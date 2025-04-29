import winston from 'winston'
import { LoggingWinston } from '@google-cloud/logging-winston'
import { env } from 'process'
import { config } from '../src-app/app'

const PROD = env.NODE_ENV === 'production' ? true : false
const GAE = env.GAE_INSTANCE || ''

class Log {
  private _logger: winston.Logger;

  constructor () {
    if (GAE) {
      // Imports the Google Cloud client library for Winston
      const loggingWinston = new LoggingWinston()
      // Logs will be written to: "projects/YOUR_PROJECT_ID/logs/winston_log"
      this._logger = winston.createLogger({
        level: 'info',
        transports: [
          new winston.transports.Console(),
          // Add Cloud Logging
          loggingWinston,
        ],
      })
    } else {
      // const { format, transports } = require('winston')
      // const { combine, timestamp, label, printf } = format
      const fne = config.logsPath + '/error.log'
      const fnc = config.logsPath + '/combined.log'
      const myFormat = winston.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} ${level}: ${message}`
      })
      this._logger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(winston.format.timestamp(), myFormat),
        // defaultMeta: { service: 'user-service' },
        transports: [
          // - Write all logs with importance level of `error` or less to `error.log`
          // - Write all logs with importance level of `info` or less to `combined.log`
          new winston.transports.File({ filename: fne, level: 'error' }),
          new winston.transports.File({ filename: fnc }),
        ],
      })
      // If we're not in production then log to the `console
      if (!PROD)
        this._logger.add(new winston.transports.Console())
    }
  }

  public debug (msg: string) { this._logger.debug(msg) }
  public info (msg: string) { this._logger.info(msg) }
  public error (msg: string) { this._logger.error(msg) }

}

const _log = new Log()

export function logDebug (msg: string) { _log.debug(msg)}
export function logInfo (msg: string) { _log.info(msg)}
export function logError (msg: string) { _log.error(msg)}
