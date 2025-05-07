"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppExc = exports.Util = exports.Log = exports.Operation = void 0;
exports.checkConfig = checkConfig;
exports.getExpressApp = getExpressApp;
exports.startSRV = startSRV;
exports.testDb = testDb;
exports.doOp = doOp;
exports.cryptKeys = cryptKeys;
exports.adminAlert = adminAlert;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const path_1 = __importDefault(require("path"));
const node_fs_1 = require("node:fs");
const node_util_1 = require("node:util");
const process_1 = require("process");
const msgpack_1 = require("@msgpack/msgpack");
const log_1 = require("./log");
Object.defineProperty(exports, "Log", { enumerable: true, get: function () { return log_1.Log; } });
const operation_1 = require("./operation");
Object.defineProperty(exports, "Operation", { enumerable: true, get: function () { return operation_1.Operation; } });
const util_1 = require("./util");
Object.defineProperty(exports, "Util", { enumerable: true, get: function () { return util_1.Util; } });
const operations_1 = require("./operations");
function checkConfig(encryptedKeys) {
    const config = operation_1.Operation.config;
    new log_1.Log(config.PROD, config.GAE, config['logsPath']);
    // Chargement des "keys" cryptées dans config.keys
    try {
        if (config.SRVKEY) {
            const key = Buffer.from(config.SRVKEY, 'base64');
            const bin = Buffer.from(encryptedKeys, 'base64');
            const x = util_1.Util.decrypt(key, bin).toString('utf-8');
            config['keys'] = JSON.parse(x);
        }
        else {
            throw new AppExc(1012, 'env.SRVKeY NOT FOUND', null);
        }
    }
    catch (e) {
        const m = './keys.bin or ./keys.json is NOT readable / decipherable: ' + e.toString();
        throw new AppExc(1012, m, null);
    }
    if (config.database) {
        if (!config.dbOptions || !config.dbOptions[config.database])
            throw new AppExc(1013, 'config.dbOptions not found', null, [config.database]);
        if (!config.site || !config.keys['sites'][config.site])
            throw new AppExc(1014, 'config.site not found or no key', null, [config.site || '?']);
    }
    (0, operations_1.register)();
}
function getExpressApp(dbConnexion, storage) {
    const config = operation_1.Operation.config;
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)({}));
    // OPTIONS est toujours envoyé pour tester les appels cross origin
    app.use('/', (req, res, next) => {
        if (req.method === 'OPTIONS')
            res.send('');
        else
            next();
    });
    app.get('/robots.txt', (req, res) => {
        res.send('User-agent: *\nDisallow: /\n');
    });
    app.get('/ping', (req, res) => {
        res.send(new Date().toISOString() + ' ' + config.BUILD + ' [' + config.APIVERSIONS[0] + '/' + config.APIVERSIONS[1] + ']');
    });
    app.get('/file/:arg', (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const [id1, id2, id3] = storage.decode3(req.params.arg);
            const bytes = yield storage.getFile(id1, id2, id3);
            if (bytes)
                res.status(200).type('application/octet-stream').send(bytes);
            else
                res.status(404).send('File not found');
        }
        catch (e) {
            res.status(404).send('File not found');
        }
    }));
    app.put('/file/:arg', (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const bufs = [];
            req.on('data', (chunk) => {
                bufs.push(chunk);
            }).on('end', () => __awaiter(this, void 0, void 0, function* () {
                const bytes = Buffer.concat(bufs);
                const [id1, id2, id3] = storage.decode3(req.params.arg);
                yield storage.putFile(id1, id2, id3, bytes);
                res.status(200).send('OK');
            }));
        }
        catch (e) {
            res.status(404).send('File not uploaded');
        }
    }));
    //**** appels des opérations ****
    app.use('/op/:operation', (req, res) => __awaiter(this, void 0, void 0, function* () {
        let body;
        if (!req['rawBody']) {
            let chunks = [];
            req.on('data', (chunk) => {
                chunks.push(Buffer.from(chunk));
            }).on('end', () => __awaiter(this, void 0, void 0, function* () {
                body = Buffer.concat(chunks);
                yield doOp(storage, dbConnexion, req, res, body);
            }));
        }
        else // Cloud functions
            yield doOp(storage, dbConnexion, req, res, req['rawBody']);
    }));
    return app;
}
function startSRV(config, app) {
    const port = process_1.env.PORT || config.port;
    let server;
    if (config.https) {
        let p = path_1.default.resolve('./cert/fullchain.pem');
        const cert = (0, node_fs_1.existsSync)(p) ? (0, node_fs_1.readFileSync)(p) : '';
        if (!cert)
            throw new AppExc(1015, 'certificate NOT FOUND', null, [p]);
        p = path_1.default.resolve('./cert/privkey.pem');
        const key = (0, node_fs_1.existsSync)(p) ? (0, node_fs_1.readFileSync)(p) : '';
        if (!key)
            throw new AppExc(1015, 'private key NOT FOUND', null, [p]);
        server = https_1.default.createServer({ key, cert }, app).listen(port, () => __awaiter(this, void 0, void 0, function* () {
            log_1.Log.info('HTTPS listen [' + config.port + ']');
        }));
    }
    else {
        server = http_1.default.createServer(app).listen(port, () => __awaiter(this, void 0, void 0, function* () {
            log_1.Log.info('HTTP listen [' + port + ']');
        }));
    }
    if (server)
        server.on('error', (e) => {
            log_1.Log.error('HTTP/S error: ' + e.message + '\n' + e.stack);
            throw new AppExc(1016, 'HTTP/S error', null, [e.message]);
        });
}
function testDb(dbConnexion, storage) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            const config = operation_1.Operation.config;
            const op = operation_1.Operation.fake();
            yield dbConnexion(config.database, config.site, op);
            {
                const [status, msg] = yield op.db.ping();
                if (status === 0)
                    log_1.Log.info(msg);
                else
                    reject('PING SDatabase FAILED');
            }
            {
                const [status, msg] = yield storage.ping();
                if (status === 0)
                    log_1.Log.info(msg);
                else
                    reject('PING Storage FAILED: ' + msg);
            }
            resolve();
        }));
    });
}
/****************************************************************/
function checkOrigin(req, origins) {
    let origin = req.headers['origin'];
    if (origins.has(origin))
        return true;
    if (!origin || origin === 'null') {
        const referer = req.headers['referer'];
        if (referer)
            origin = referer;
    }
    if (origins.has(origin))
        return true;
    if (!origin || origin === 'null')
        origin = req.headers['host'];
    const [hn, po] = util_1.Util.getHP(origin);
    if (origins.has(hn) || origins.has(hn + ':' + po))
        return true;
    throw new AppExc(1001, 'origin not authorized', null, [origin]);
}
let today = 0;
let todayEpoch = 0;
function doOp(storage, dbConnexion, req, res, body) {
    return __awaiter(this, void 0, void 0, function* () {
        const now = Date.now();
        const e = Math.floor(now / 86400000);
        if (e !== todayEpoch) {
            todayEpoch = Math.floor(now / 86400000);
            today = util_1.Util.amj(now);
        }
        const opName = req.params.operation;
        try {
            if (opName === 'yo') {
                yield util_1.Util.sleep(1000);
                res.status(200).type('text/plain').send('yo ' + new Date().toISOString());
                return;
            }
            if (operation_1.Operation.config.origins.size)
                checkOrigin(req, operation_1.Operation.config.origins);
            if (opName === 'yoyo') {
                yield util_1.Util.sleep(1000);
                res.status(200).type('text/plain').send('yoyo ' + new Date().toISOString());
                return;
            }
            const op = operation_1.Operation.new(opName);
            if (!op)
                throw new AppExc(1002, 'unknown operation', null, [opName]);
            op.opName = opName;
            op.storage = storage;
            op.today = today;
            op.args = (0, msgpack_1.decode)(body);
            op.params = {};
            if (op.args.APIVERSION && (op.args.APIVERSION < operation_1.Operation.config.APIVERSIONS[0]
                || op.args.APIVERSION > operation_1.Operation.config.APIVERSIONS[1]))
                throw new AppExc(1003, 'unsupported API', null, [operation_1.Operation.config.APIVERSIONS[0],
                    operation_1.Operation.config.APIVERSIONS[1], op.args.APIVERSION, operation_1.Operation.config.BUILD]);
            if (operation_1.Operation.config.debugLevel === 2)
                log_1.Log.info(opName + ' started');
            op.init();
            if (operation_1.Operation.config.database)
                yield dbConnexion(operation_1.Operation.config.database, operation_1.Operation.config.site, op);
            yield op.run();
            if (operation_1.Operation.config.debugLevel === 2)
                log_1.Log.info(opName + ' finished');
            const b = (0, msgpack_1.encode)(op.result || {});
            res.status(200).type('application/octet-stream').send(Buffer.from(b));
        }
        catch (exc) {
            if (operation_1.Operation.config.debugLevel === 2)
                log_1.Log.info(opName + ' terminated on exception');
            // 400: AppExc
            // 401: AppExc inattendue
            const e = exc;
            let b;
            let st = 400;
            if (e instanceof AppExc) {
                b = e.serial();
            }
            else {
                const e2 = new AppExc(1999, 'unexpected exception', null, [e.message], e.stack || '');
                b = e2.serial();
                st = 401;
            }
            res.status(st).type('application/octet-stream').send(b);
        }
    });
}
/*****************************************************
 * Ligne de commande: node src/crypKeys.ts "toto est tres tres beau"
 * Transforme le fichier keys.json en un script keys.ts
 * exportant l'objet keys.json crypté.
*/
function cryptKeys() {
    const cmdargs = (0, node_util_1.parseArgs)({
        allowPositionals: false,
        options: {
            pwd: { type: 'string', short: 'p' }
        }
    });
    const pwd = cmdargs.values['pwd'];
    const key = util_1.Util.pbkdf2(pwd);
    console.log('key= ' + key.toString('base64'));
    const pjson = path_1.default.resolve('./keys.json');
    if (!(0, node_fs_1.existsSync)(pjson)) {
        console.log('./keys.json NOT FOUND');
    }
    else {
        try {
            const buf = (0, node_fs_1.readFileSync)(pjson);
            const b64 = util_1.Util.crypt(key, buf).toString('base64');
            const pmjs = path_1.default.resolve('./src/keys.ts');
            const x = 'export const encryptedKeys = \'' + b64 + '\'' + '\n';
            (0, node_fs_1.writeFileSync)(pmjs, Buffer.from(x, 'utf8'));
            console.log('./src/keys.js written');
        }
        catch (e) {
            console.log('Encryption failed. ' + e.message);
        }
    }
}
function adminAlert(op, subject, text) {
    return __awaiter(this, void 0, void 0, function* () {
        const config = operation_1.Operation.config;
        const al = config.keys['adminAlerts'];
        if (al['adminAlerts'] === 0)
            return;
        const s = '[' + config.site + '] '
            + (op && op.org ? 'org:' + op.org + ' - ' : '')
            + (op ? 'op:' + op.opName + ' - ' : '')
            + subject;
        log_1.Log.info('Mail sent to:' + al.to + ' subject:' + s + (text ? '\n' + text : ''));
        if (!config.adminAlerts)
            return;
        // Test avec le script server.php
        try {
            const response = yield fetch(al.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    mailer: 'A',
                    mdp: al.pwd,
                    subject: s,
                    to: al.to,
                    text: text || '-'
                })
            });
            const t = yield response.text();
            if (!t.startsWith('OK'))
                log_1.Log.error('Send mail error: [' + al.url + '] -  ' + t);
        }
        catch (e) {
            log_1.Log.error('Send mail exception: [' + al.url + '] -  ' + e.toString());
        }
    });
}
/* code
  1000: erreurs fonctionnelles FW
  2000: erreurs fonctionnelles APP
  3000: asserions FW
  4000: asserions APP
  8000: asserions FW - transmises à l'administrateur
  9000: asserions APP - transmises à l'administrateur
*/
class AppExc {
    constructor(code, label, op, args, stack) {
        this.label = label;
        this.code = code;
        this.opName = op ? op.opName : '';
        this.org = op && op.org ? op.org : '';
        this.args = args || [];
        this.stack = stack || '';
        const m = 'AppExc: ' + code + ':' + label + (op ? '@' + op.opName + ':' : '') + JSON.stringify(args || []);
        if (code > 3000)
            log_1.Log.error(m + this.stack);
        else {
            if (operation_1.Operation.config.debugLevel > 0)
                log_1.Log.info(m);
        }
        if (code > 8000)
            adminAlert(op, m, this.stack);
    }
    serial() {
        return Buffer.from((0, msgpack_1.encode)({ code: this.code, label: this.label, opName: this.opName,
            org: this.org, stack: this.stack, args: this.args }));
    }
}
exports.AppExc = AppExc;
