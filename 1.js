const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

function convertToAudio(address, savePath) {
  return new Promise((resolve, reject) => {
    let [one, two, three] = path
      .basename(address)
      .replace("董路_", "")
      .replace(".mp4", "")
      .split("_");
    const command = `ffmpeg -i ${address} -f lavfi -i color=s=400x300 -vf "drawtext=text='${one}':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=(h-text_h)/2:borderw=1:bordercolor=#87CEFA,drawtext=text='${two}':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=(h-text_h)/2+30:borderw=1:bordercolor=#87CEFA,drawtext=text='${three}':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=(h-text_h)/2+60:borderw=1:bordercolor=#87CEFA"  -map 0:a -map 1:v -c:v libx264 -c:a aac -shortest -threads 4 ${savePath}`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`执行出错: ${error}`);
        reject(error);
        return;
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
    });
  });
}
async function genNewMp4(address) {
  const dirPath = path.join(path.dirname(address), "mp4");

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  const savePath = path.join(
    dirPath,
    path.basename(address).replace("董路_", "")
  );
  console.log(savePath);
  await convertToAudio(address, savePath);
}

genNewMp4("F:/dl/抖音/董路2024-06-19/董路_2024-06-19_13-51-07_还学捷克吗.mp4");
