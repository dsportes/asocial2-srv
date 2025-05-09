import winston from 'winston'
import { LoggingWinston } from '@google-cloud/logging-winston'

export class Log {
  private static _logger: winston.Logger;

  public static debug (msg: string) { this._logger.info(msg) }
  public static info (msg: string) { this._logger.info(msg) }
  public static error (msg: string) { this._logger.error(msg) }

  constructor (PROD: boolean, GCLOUDLOGGING: boolean, logsPath: string) {
    if (GCLOUDLOGGING) {
      // Imports the Google Cloud client library for Winston
      const loggingWinston = new LoggingWinston()
      // Logs will be written to: "projects/YOUR_PROJECT_ID/logs/winston_log"
      Log._logger = winston.createLogger({
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
      const fne = logsPath + '/error.log'
      const fnc = logsPath + '/combined.log'
      const myFormat = winston.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} ${level}: ${message}`
      })
      Log._logger = winston.createLogger({
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
        Log._logger.add(new winston.transports.Console())
    }
  }

}

