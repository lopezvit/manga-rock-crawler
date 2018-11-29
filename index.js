//const data = require("./data.json");
const http = require("https");
const webp = require("webp-converter");
const fs = require("fs");
const archiver = require("archiver");
const { spawn } = require("child_process");
const decode = require("manga-rock-image-decoder");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const parallel = true;
const serie = "neverland";
const firstNumber = 112;
const lastNumber = 113;

let serieUrl, serieName, serieStartsAt;
switch (serie) {
  case "neverland":
    serieUrl = "https://mangarock.com/manga/mrs-serie-303939";
    serieName = "neverland";
    serieStartsAt = 1;
    break;
  case "attack":
    serieUrl = "https://mangarock.com/manga/mrs-serie-295440/";
    serieName = "shingeki";
    serieStartsAt = 0;
  default:
    break;
}

//const originalChapter =
//  "https://mangarock.com/manga/mrs-serie-295440/chapter/mrs-chapter-100290684";
const apiVersion = "web401";
const country = "Finland";
//const oid = "mrs-chapter-100290684";

const newURL = "https://mri-image-decoder.now.sh/?url=";
const capNumbers = Array.from(
  { length: lastNumber - firstNumber + 1 },
  (v, k) => k + firstNumber - serieStartsAt
);
let domSerie;
(async () => {
  try {
    domSerie = await JSDOM.fromURL(serieUrl, {
      runScripts: "outside-only"
    });
    for (const script of domSerie.window.document.scripts) {
      if (script.outerHTML.startsWith("<script>window.APP_STATE")) {
        //console.log(script.outerHTML.slice(8, -9));
        domSerie.window.eval(script.outerHTML.slice(8, -9));
        break;
      }
    }
    if (parallel) {
      await Promise.all(
        capNumbers.map(async capNumber => await downloadCap(capNumber))
      );
    } else {
      for (const capNumber of capNumbers) {
        await downloadCap(capNumber);
        //console.log(capNumber + padDigits(capNumber + serieStartsAt, 3));
      }
    }
  } catch (error) {
    console.log(error);
  }
})();

async function downloadCap(capNumber) {
  try {
    const dir = `./${serieName}_${padDigits(capNumber + serieStartsAt, 3)}`;

    let page = 100;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    const chapter = domSerie.window.APP_STATE.currentManga.info.chapters.find(
      chapter => chapter.order === capNumber
    );
    console.log(chapter);
    const dataChapter = `https://api.mangarockhd.com/query/${apiVersion}/pages?oid=${
      chapter.oid
    }&country=${country}`;

    const bufferData = await downloadBuffer(dataChapter);
    const data = JSON.parse(bufferData.toString());
    console.log(data);
    await Promise.all(
      data.data.map(async url => {
        const actualPage = page++;
        const webpFile = `${dir}/${actualPage}.webp`;
        const jpgFile = `${dir}/${actualPage}.jpg`;
        console.log(newURL + url);
        const mriImageBuffer = await downloadBuffer(url);
        const webpImageBuffer = decode(mriImageBuffer);
        await new Promise(function(resolve, reject) {
          fs.writeFile(webpFile, webpImageBuffer, function(err) {
            if (err) reject(err);
            else resolve();
          });
        });
        await new Promise((resolve, reject) =>
          webp.dwebp(webpFile, jpgFile, "-o", function(status) {
            //if exicuted successfully status will be '100'
            //if exicuted unsuccessfully status will be '101'
            console.log(status);
            if (
              status ===
              `100
Converted Successfully`
            ) {
              resolve(status);
            } else {
              reject(status);
            }
          })
        );
        fs.unlinkSync(webpFile);
      })
    );
    console.log("All the conversions done!");

    await executeConversion(dir, chapter.name);
    console.log("Conversion done!");
    deleteFolderRecursive(dir);
    console.log("Directory deleted!");
  } catch (error) {
    console.error(error);
  }
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    http
      .get(url, res => {
        console.log("statusCode:", res.statusCode);
        console.log("headers:", res.headers);

        res.on("data", d => {
          buf = Buffer.concat([buf, d]);
        });
        res.on("end", () => resolve(buf));
      })
      .on("error", e => {
        console.error(e);
        reject(e);
      });
  });
}

/**
 * @param {String} source
 * @param {String} out
 * @returns {Promise}
 */
function zipDirectory(source, out) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = fs.createWriteStream(out);

  return new Promise((resolve, reject) => {
    archive
      .directory(source, false)
      .on("error", err => reject(err))
      .pipe(stream);

    stream.on("close", () => resolve());
    archive.finalize();
  });
}

function deleteFolderRecursive(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function(file, index) {
      var curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) {
        // recurse
        deleteFolderRecursive(curPath);
      } else {
        // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
}

function executeConversion(path, title) {
  return new Promise((resolve, reject) => {
    const child = spawn("kcc-c2e", [
      "--profile=KV",
      "--manga-style",
      "--format=MOBI",
      "--upscale",
      "--splitter=2",
      `--title=${title}`,
      path
    ]);
    child.stdout.on("data", data => {
      console.log(`child stdout:\n${data}`);
    });

    child.stderr.on("data", data => {
      console.error(`child stderr:\n${data}`);
    });
    child.on("error", error => reject(error));
    child.on("exit", data => resolve(data));
  });
}

function padDigits(number, digits) {
  return (
    Array(Math.max(digits - String(number).length + 1, 0)).join(0) + number
  );
}
