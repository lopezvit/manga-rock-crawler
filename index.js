//const data = require("./data.json");
const http = require("https");
const webp = require("webp-converter");
const fs = require("fs");
const archiver = require("archiver");
const { spawn } = require("child_process");
const decode = require("manga-rock-image-decoder");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const serieUrl = "https://mangarock.com/manga/mrs-serie-295440/";
const originalChapter =
  "https://mangarock.com/manga/mrs-serie-295440/chapter/mrs-chapter-100290684";
const apiVersion = "web400";
const country = "Finland";
//const oid = "mrs-chapter-100290684";

const newURL = "https://mri-image-decoder.now.sh/?url=";
const capNumbers = [109, 110, 111];
(async () => {
  try {
    await Promise.all(
      capNumbers.map(async capNumber => await downloadCap(capNumber))
    );
  } catch (error) {
    console.log(error);
  }
})();

async function downloadCap(capNumber) {
  try {
    const dir = `./shingeki_${capNumber}`;

    let page = 100;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    const bufferSerie = await downloadBuffer(serieUrl);
    const domSerie = await JSDOM.fromURL(serieUrl, {
      runScripts: "outside-only"
    });
    for (const script of domSerie.window.document.scripts) {
      if (script.outerHTML.startsWith("<script>window.APP_STATE")) {
        //console.log(script.outerHTML.slice(8, -9));
        domSerie.window.eval(script.outerHTML.slice(8, -9));
        break;
      }
    }
    const chapter = domSerie.window.APP_STATE.currentManga.info.chapters.find(
      chapter => chapter.order === capNumber + 1
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
    //await zipDirectory(dir, dir + ".cbz");
    /* const child = spawnSync(
      "kcc-c2e",
      [
        "--profile=KV",
        "--manga-style",
        "--format=MOBI",
        "--upscale",
        "--splitter=2",
        dir
      ],
      {
        stdio: "inherit"
      }
    ); */

    await executeConversion(dir);
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

function executeConversion(path) {
  return new Promise((resolve, reject) => {
    const child = spawn("kcc-c2e", [
      "--profile=KV",
      "--manga-style",
      "--format=MOBI",
      "--upscale",
      "--splitter=2",
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
