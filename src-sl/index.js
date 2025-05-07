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
exports.SQLiteConnexion = exports.SQLiteOptions = void 0;
exports.getOptions = getOptions;
exports.fwSqlConnexion = fwSqlConnexion;
// import { Database } from './loadreq.js'
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const index_1 = require("../src-dbst/index");
const index_2 = require("../src-fw/index");
const path_1 = __importDefault(require("path"));
const node_fs_1 = require("node:fs");
class SQLiteOptions extends index_1.DbOptions {
    constructor(code, site) {
        super(code, site);
        const p = this.cfg.path;
        if (!p)
            throw new index_2.AppExc(1030, 'SQLite path absent', null, [code]);
        this.path = path_1.default.resolve(p);
        if (!(0, node_fs_1.existsSync)(this.path))
            throw new index_2.AppExc(1020, 'SQLite path not found', null, [code, p]);
        index_2.Log.info('SQLite ' + code + '/' + site + ' DB path= [' + p + ']');
    }
}
exports.SQLiteOptions = SQLiteOptions;
const optionsCache = new Map();
function getOptions(code, site) {
    let opts = optionsCache.get(code + '/' + site);
    if (!opts) {
        opts = new SQLiteOptions(code, site);
        optionsCache.set(code + '/' + site, opts);
    }
    return opts;
}
function fwSqlConnexion(code, site, op) {
    return __awaiter(this, void 0, void 0, function* () {
        const cnx = new SQLiteConnexion(getOptions(code, site), op);
        yield cnx.connect();
    });
}
class SQLiteConnexion extends index_1.DbConnexion {
    constructor(opts, op) {
        super(opts, op);
        this.path = opts.path;
        this.lastSql = [];
        this.cachestmt = {};
    }
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            const options = {
                // nativeBinding: require('better-sqlite3/build/Release/better_sqlite3.node'),
                verbose: (msg) => {
                    if (index_2.Operation.config.debugLevel === 2)
                        index_2.Log.debug(msg);
                    this.lastSql.unshift(msg);
                    if (this.lastSql.length > 3)
                        this.lastSql.length = 3;
                }
            };
            try {
                this.sql = new better_sqlite3_1.default(this.path, options),
                    this.sql.pragma('journal_mode = WAL');
            }
            catch (e) {
                throw new index_2.AppExc(1024, 'SQLite connexion failed', this.op, [e.message]);
            }
            this.op.db = this;
            return this;
        });
    }
    // Méthode PUBLIQUE de déconnexion, impérative et sans exception
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.sql.close();
            }
            catch (e2) { /* */ }
        });
    }
    trap(e) {
        if (e.constructor.name !== 'SqliteError')
            throw e;
        const s = (e.code || '???') + '\n' + (e.message || '') + '\n' +
            (e.stack ? e.stack + '\n' : '') + this.lastSql.join('\n');
        if (e.code && e.code.startsWith('SQLITE_BUSY'))
            return [1, s];
        return [2, s];
    }
    // Méthode PUBLIQUE de test: retour comme doTransaction [0 / 1 / 2, detail]
    ping() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const stmt = this.sql.prepare('SELECT _data_ FROM singletons WHERE id = \'1\'');
                const t = stmt.get();
                const d = new Date();
                const v = d.getTime();
                const _data_ = d.toISOString();
                if (t) {
                    const stu = this.sql.prepare('UPDATE singletons SET _data_ = @_data_, v = @v  WHERE id = \'1\'');
                    stu.run({ v, _data_ });
                }
                else {
                    const sti = this.sql.prepare('INSERT INTO singletons (id, v, _data_) VALUES (\'1\', @v, @_data_)');
                    sti.run({ v, _data_ });
                }
                const m = 'Sqlite ping OK: ' + (t && t._data_ ? t._data_ : '?') + ' <=> ' + _data_;
                return [0, m];
            }
            catch (e) {
                return this.trap(e);
            }
        });
    }
}
exports.SQLiteConnexion = SQLiteConnexion;
