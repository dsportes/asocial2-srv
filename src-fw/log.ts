// @ts-ignore
import { encode } from '@msgpack/msgpack'
import winston from 'winston'
import { LoggingWinston } from '@google-cloud/logging-winston'

let debugLevel = 0
let adminAlert = (x, y, z) => {}

export function setDebugLevel (l: number) {
  debugLevel = l
}

export function setAdminAlert (al: any) {
  adminAlert = al
}

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

/* Classe AppExc ********************************************************/
export class AppExc {
  /* codes:
  Détecté par l'application
  1: erreur fonctionnelle APP
  2: erreur fonctionnelle FW
  3: assertion FW - BUG: 
  4: assertion APP - BUG:
  8: FW : Exception technique DB / réseau
  9: APP: Exception technique DB / réseau
  10: FW : Exception technique DB / réseau : configuration suspectée
  11: APP: Exception technique DB / réseau : configuration suspectée
  99: Interruption actionnée par l'utilisateur

  Remonté d'un service - assertions 13...16 transmises à l'adiministarteur
  101: erreur fonctionnelle FW : non détectable par l'application
  102: erreur fonctionnelle APP : non détectable par l'application
  103: assertion FW - BUG: l'erreur fonctionnelle est censée avoir été bloquée par l'application
  104: assertion APP - BUG: l'erreur fonctionnelle est censée avoir été bloquée par l'application
  105: assertions FW - Données incohérentes non détectables par l'application
  106: assertions APP - Données incohérentes non détectables par l'application
  108: FW : Exception technique DB / réseau
  109: APP : Exception technique DB / réseau
  110: FW : Exception technique DB / réseau : configuration suspectée
  111: APP : Exception technique DB / réseau : configuration suspectée
  */

  public code: number
  public label: string
  public opName: string
  public org: string
  public stack: string
  public args: string[]

  static important = new Set([103, 104, 108, 109, 110, 111])

  constructor (code: number, label: string, op: any, args?: string[], stack?: string) {
    this.label = label
    this.code = code
    this.opName = op ? (op.opName || '') : ''
    this.org = op && op['org'] ? op['org'] : ''
    this.args = args || []
    this.stack = stack || ''
    if (code > 103) Log.error(this.message)
    else { if (debugLevel > 0) Log.debug(this.toString()) }
    if (AppExc.important.has(code)) 
      adminAlert(op, this.message, this.stack)
  }

  serial () { 
    return Buffer.from(encode({code: this.code, label: this.label, opName: this.opName,
      org: this.org, stack: this.stack, args: this.args}))
  }

  get message () { return 'AppExc: ' + this.code + ':' + this.label + 
    (this.opName ? '@' + this.opName + ':' : '') 
    + JSON.stringify(this.args || []) }

  toString () { return this.message + (this.stack ? '\n' + this.stack : '')}
}
