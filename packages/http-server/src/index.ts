import path from 'path'
import express from 'express'
import morgan from 'morgan'
import cors from 'cors'
import { initRecorderManager } from './manager'
import { createRouter } from './routes'
import { initDB } from './db'
import { setFFMPEGPath } from '@autorecord/manager'
import { Settings } from '@autorecord/shared'
import { paths } from './env'
import { PickPartial, readJSONFile, writeJSONFile } from './utils'
import { ServerOpts } from './types'
import { createLogger } from './logger'

export * from './routes/api_types'

export async function startServer(opts: PickPartial<ServerOpts, 'getSettings' | 'setSettings' | 'logger'> = {}) {
  const serverOpts: ServerOpts = {
    ...opts,
    getSettings: opts.getSettings ?? createDefaultGetSettings({ logger: opts.logger ?? console }),
    setSettings: opts.setSettings ?? defaultSetSettings,
    logger: opts.logger ?? console,
  }
  const { logger } = serverOpts

  logger.info('initializing db')
  await initDB(serverOpts)

  logger.info('initializing recorder manager')
  if (opts.ffmpegPath != null) {
    setFFMPEGPath(opts.ffmpegPath)
  }
  await initRecorderManager(serverOpts)

  logger.info('HTTP server starting')
  const app = express()
  app.use(express.json({ limit: '32mb' }))
  app.use(express.urlencoded({ extended: true }))
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
    'https://re.li-h.me',
    'https://re.t.li-h.me',
    'https://sapi.li-h.me',
  ]

  app.use(
    cors({
      origin: function (origin, callback) {
        // 允许没有 origin 的请求（例如：mobile apps 或 curl requests）
        if (!origin) return callback(null, true)
        if (allowedOrigins.indexOf(origin) === -1) {
          var msg = 'CORS policy for this site does not ' + 'allow access from the specified Origin.'
          return callback(new Error(msg), false)
        }
        return callback(null, true)
      },
    }),
  )

  app.use(morgan('default'))
  const router = createRouter(serverOpts)
  app.use('/api', router)

  const port = process.env.PORT ?? 8085
  app.listen(port, () => {
    logger.info(`HTTP server started, listening at http://localhost:${port}`)
  })
}

// TODO: Opts 的默认值代码似乎不应该放这里
const settingsConfigPath = path.join(paths.config, 'settings.json')
function createDefaultGetSettings(opts: Pick<ServerOpts, 'logger'>) {
  return async function defaultGetSettings() {
    return readJSONFile<Settings>(
      settingsConfigPath,
      {
        notExitOnAllWindowsClosed: true,
        noticeOnRecordStart: true,
      },
      opts,
    )
  }
}
async function defaultSetSettings(newSettings: Settings) {
  await writeJSONFile(settingsConfigPath, newSettings)
  return newSettings
}

const isDirectlyRun = require.main === module
if (isDirectlyRun) {
  const logger = createLogger()
  // winston 的 rejectionHandlers / exceptionHandlers 实现有 bug，配置后在遇到
  // unhandledRejection 时会导致 logger 的 stream 永久 pause，所以这里手动写日志。
  process.on('unhandledRejection', (error) => {
    logger.error('unhandledRejection', error)
  })
  process.on('unhandleExceptions', (error) => {
    logger.error('unhandleExceptions', error)
  })

  void startServer({ logger })
}
