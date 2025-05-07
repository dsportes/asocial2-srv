"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Log = void 0;
const winston_1 = __importDefault(require("winston"));
const logging_winston_1 = require("@google-cloud/logging-winston");
class Log {
    static debug(msg) { this._logger.debug(msg); }
    static info(msg) { this._logger.info(msg); }
    static error(msg) { this._logger.error(msg); }
    constructor(PROD, GCLOUDLOGGING, logsPath) {
        if (GCLOUDLOGGING) {
            // Imports the Google Cloud client library for Winston
            const loggingWinston = new logging_winston_1.LoggingWinston();
            // Logs will be written to: "projects/YOUR_PROJECT_ID/logs/winston_log"
            Log._logger = winston_1.default.createLogger({
                level: 'info',
                transports: [
                    new winston_1.default.transports.Console(),
                    // Add Cloud Logging
                    loggingWinston,
                ],
            });
        }
        else {
            // const { format, transports } = require('winston')
            // const { combine, timestamp, label, printf } = format
            const fne = logsPath + '/error.log';
            const fnc = logsPath + '/combined.log';
            const myFormat = winston_1.default.format.printf(({ level, message, timestamp }) => {
                return `${timestamp} ${level}: ${message}`;
            });
            Log._logger = winston_1.default.createLogger({
                level: 'info',
                format: winston_1.default.format.combine(winston_1.default.format.timestamp(), myFormat),
                // defaultMeta: { service: 'user-service' },
                transports: [
                    // - Write all logs with importance level of `error` or less to `error.log`
                    // - Write all logs with importance level of `info` or less to `combined.log`
                    new winston_1.default.transports.File({ filename: fne, level: 'error' }),
                    new winston_1.default.transports.File({ filename: fnc }),
                ],
            });
            // If we're not in production then log to the `console
            if (!PROD)
                Log._logger.add(new winston_1.default.transports.Console());
        }
    }
}
exports.Log = Log;
