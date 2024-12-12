import fs from 'fs'
import path from 'path'
import { createRecorderManager, Recorder, RecorderCreateOpts, RecordExtraData } from '@autorecord/manager'
import { provider as providerForDouYu } from '@autorecord/douyu-recorder'
import { provider as providerForBilibili } from '@autorecord/bilibili-recorder'
import { provider as providerForHuYa } from '@autorecord/huya-recorder'
import { provider as providerForDouYin } from '@autorecord/douyin-recorder'
import { paths } from './env'
import { pick, readJSONFileSync, replaceExtName, writeJSONFileSync } from './utils'
const sharp = require('sharp')
const textToSvg = require('text-to-svg')
import {
  genRecorderIdInDB,
  getRecorders,
  insertRecord,
  insertRecorder,
  removeRecord,
  removeRecorder,
  updateRecorder,
  updateRecordStopData,
} from './db'
import { ServerOpts } from './types'
import { parseSync, stringifySync } from 'subtitle'

const managerConfigPath = path.join(paths.config, 'manager.json')

export interface RecorderExtra {
  createTimestamp: number
}

export const recorderManager = createRecorderManager<RecorderExtra>({
  providers: [providerForDouYu, providerForBilibili, providerForHuYa, providerForDouYin],
})

export const defaultManagerConfig: ManagerConfig = {
  savePathRule: path.join(paths.data, '{platform}/{owner}/{year}-{month}-{date} {hour}-{min}-{sec} {title}.mp4'),
  autoRemoveSystemReservedChars: true,
  autoCheckLiveStatusAndRecord: true,
  autoCheckInterval: 1000,
  ffmpegOutputArgs: recorderManager.ffmpegOutputArgs,
}

export function addRecorderWithAutoIncrementId(args: RecorderCreateOpts<RecorderExtra>): Recorder<RecorderExtra> {
  return recorderManager.addRecorder({
    ...args,
    id: genRecorderIdInDB().toString(),
  })
}

export async function initRecorderManager(serverOpts: ServerOpts): Promise<void> {
  const { logger } = serverOpts

  const managerConfig = readJSONFileSync<ManagerConfig>(managerConfigPath, defaultManagerConfig, serverOpts)

  // 这里做一些旧版本 schema 升级的处理
  if (managerConfig.ffmpegOutputArgs == null) {
    // v0.0.2 -> v1.0.0
    managerConfig.ffmpegOutputArgs = recorderManager.ffmpegOutputArgs
    managerConfig.savePathRule += '.mp4'
  }
  if (managerConfig.autoRemoveSystemReservedChars == null) {
    // v1.0.0 -> v1.1.0
    managerConfig.autoRemoveSystemReservedChars = true
  }

  Object.assign(recorderManager, managerConfig)

  recorderManager.on('error', ({ source, err }) => {
    const errText = err instanceof Error ? err.stack ?? err.message : JSON.stringify(err)
    logger.error(`[RecorderManager][${source}]: ${errText}`)
  })

  recorderManager.on('Updated', () => {
    writeJSONFileSync<ManagerConfig>(
      managerConfigPath,
      pick(
        recorderManager,
        'savePathRule',
        'autoRemoveSystemReservedChars',
        'autoCheckLiveStatusAndRecord',
        'autoCheckInterval',
        'ffmpegOutputArgs',
      ),
    )
  })

  // TODO: 目前持久化的实现方式是不支持多实例同时运行的，考虑在程序运行期间把数据文件持续占用防止意外操作
  const serializedRecorders = getRecorders()
  for (let i = 0; i < serializedRecorders.length; i++) {
    const serialized = serializedRecorders[i]
    recorderManager.addRecorder(serialized)
  }

  if (recorderManager.autoCheckLiveStatusAndRecord) {
    recorderManager.startCheckLoop()
  }

  recorderManager.on('RecordStart', ({ recorder, recordHandle }) => {
    const recordId = recordHandle.id

    insertRecord({
      id: recordId,
      recorderId: recorder.id,
      savePath: recordHandle.savePath,
      startTimestamp: Date.now(),
    })

    const updateRecordOnceRecordStop: Parameters<typeof recorderManager.on<'RecordStop'>>[1] = async ({
      recordHandle,
      reason,
    }) => {
      if (recordHandle.id !== recordId) return
      recorderManager.off('RecordStop', updateRecordOnceRecordStop)

      const { autoGenerateSRTOnRecordStop, autoRemoveRecordWhenTinySize } = await serverOpts.getSettings()
      if (
        autoRemoveRecordWhenTinySize &&
        (!fs.existsSync(recordHandle.savePath) || fs.statSync(recordHandle.savePath).size === 0)
      ) {
        const extraDataPath = replaceExtName(recordHandle.savePath, '.json')
        // 直接把错误吞掉，影响不大
        function noop(): void {}
        fs.promises.rm(extraDataPath).catch(noop)
        fs.promises.rm(recordHandle.savePath).catch(noop)

        removeRecord(recordId)
        return
      }

      updateRecordStopData({
        id: recordId,
        stopTimestamp: Date.now(),
        stopReason: reason,
      })
      genNewMp4(recordHandle.savePath)
      // await genCoverFile(
      //   path.join(__dirname, '/public/cover.jpg'),
      //   { fontSize: 160, text: recordHandle.savePath, fill: '#FFF', stroke: '#87CEFA' },
      //   replaceExtName(recordHandle.savePath, '.jpg'),
      // )
      if (autoGenerateSRTOnRecordStop) {
        const extraDataPath = replaceExtName(recordHandle.savePath, '.json')
        if (!fs.existsSync(extraDataPath)) return

        await genSRTFile(extraDataPath, replaceExtName(recordHandle.savePath, '.srt'))
      }
    }

    recorderManager.on('RecordStop', updateRecordOnceRecordStop)
  })

  recorderManager.on('RecorderDebugLog', async ({ recorder, ...log }) => {
    const { debugMode } = await serverOpts.getSettings()
    if (!debugMode) return

    if (log.type === 'ffmpeg' && recorder.recordHandle) {
      const logFilePath = replaceExtName(`${recorder.recordHandle.savePath}_${recorder.id}`, '.ffmpeg.log')
      fs.appendFileSync(logFilePath, log.text + '\n')
      return
    }

    logger.debug(`[${recorder.id}][${log.type}]: ${log.text}`)
  })

  recorderManager.on('RecorderAdded', (recorder) => insertRecorder(recorder.toJSON()))
  recorderManager.on('RecorderRemoved', (recorder) => removeRecorder(recorder.id))
  recorderManager.on('RecorderUpdated', ({ recorder }) => updateRecorder(recorder.toJSON()))
}

// ass 看起来只有序列化和反序列化的库（如 ass-compiler），没有支持帮助排列弹幕的库，
// 要自己实现，成本较高。所以先只简单实现个 srt 的，后面有需要的话再加个 ass 的版本。
export async function genSRTFile(extraDataPath: string, srtPath: string): Promise<void> {
  // TODO: 这里要不要考虑用 RecordExtraDataController 去操作？
  const buffer = await fs.promises.readFile(extraDataPath)
  const recordExtraData = JSON.parse(buffer.toString()) as RecordExtraData

  const parsedSRT = parseSync('')

  recordExtraData.messages.forEach((msg) => {
    switch (msg.type) {
      case 'comment':
        const start = msg.timestamp - recordExtraData.meta.recordStartTimestamp
        // TODO: 先简单写个固定值
        const life = 4500
        parsedSRT.push({
          type: 'cue',
          data: {
            start: start,
            end: start + life,
            text: msg.text,
          },
        })
        break
    }
  })

  await fs.promises.writeFile(srtPath, stringifySync(parsedSRT, { format: 'SRT' }))
}
const { exec } = require('child_process')
function convertToAudio(address: string, savePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let [one, two, three] = path.basename(address).replace('董路_', '').replace('.mp4', '').split('_')
    two.replaceAll('-', ':')
    const command = `ffmpeg -i ${address} -f lavfi -i color=s=400x300 -vf "drawtext=text='${one}':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=(h-text_h)/2:borderw=1:bordercolor=#87CEFA,drawtext=text='${two}':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=(h-text_h)/2+30:borderw=1:bordercolor=#87CEFA,drawtext=text='${three}':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=(h-text_h)/2+60:borderw=1:bordercolor=#87CEFA"  -map 0:a -map 1:v -c:v libx264 -c:a aac -shortest -threads 4 ${savePath}`
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`执行出错: ${error}`)
        reject(error)
        return
      }
      console.log(`stdout: ${stdout}`)
      console.error(`stderr: ${stderr}`)
    })
  })
}
function convertToAudio2(address: string, savePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // ffmpeg -err_detect ignore_err -i input.fmp4 -c copy output.mp4

    const command = `ffmpeg -err_detect ignore_err  -i ${address}   -c copy  -threads 4  ${savePath}`
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`执行出错: ${error}`)
        reject(error)
        return
      }
      console.log(`stdout: ${stdout}`)
      console.error(`stderr: ${stderr}`)
    })
  })
}
export async function genNewMp4(address) {
  const dirPath = path.dirname(address).replace('抖音', 'dymp3')

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }

  const savePath = path.join(dirPath, path.basename(address))
  console.log(savePath)
  await convertToAudio2(address, savePath)
}
export async function genCoverFile(basePicture, font, newFilePath) {
  const { fontSize, text, fill, stroke } = font

  const textToSvgSync = textToSvg.loadSync(path.join(__dirname, '/public/FZSTK.TTF'))
  const attributes = {
    fill: fill,
    stroke: stroke, // 边框颜色
    'stroke-width': 3,
    'font-weight': 'bold',
  }
  const options = {
    x: 0,
    y: 0,
    fontSize,
    anchor: 'top',
    attributes,
  }

  let textArr = text.split('.')[0].split('_')
  textArr.shift()
  if (textArr.length > 1) {
    const lastElement = textArr[textArr.length - 1]
    // 如果 lastElement 长度大于 10，就拆分
    if (lastElement.length > 14) {
      textArr.pop()
      textArr.push(lastElement.slice(0, 14))
      textArr.push(lastElement.slice(14))
    }
  }
  let svgBuffers = textArr.map((item) => Buffer.from(textToSvgSync.getSVG(item, options)))

  let basePictureInfo = await sharp(basePicture).metadata()

  let compositePromises = svgBuffers.map(async (svgBuffer, index) => {
    let { width } = await sharp(svgBuffer).metadata()

    return {
      input: svgBuffer,
      top: Math.floor((basePictureInfo.height + 2 * index * fontSize) / 2 - 100),
      left: Math.floor((basePictureInfo.width - width) / 2),
    }
  })

  let compositeArray = await Promise.all(compositePromises)
  await sharp(basePicture).composite(compositeArray).toFile(newFilePath)
}
interface ManagerConfig {
  savePathRule: string
  autoRemoveSystemReservedChars: boolean
  autoCheckLiveStatusAndRecord: boolean
  autoCheckInterval: number
  ffmpegOutputArgs: string
}
