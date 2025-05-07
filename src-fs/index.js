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
exports.FsStorage = void 0;
const promises_1 = require("node:fs/promises");
const node_fs_1 = require("node:fs");
const path_1 = __importDefault(require("path"));
const index_1 = require("../src-fw/index");
const src_dbst_1 = require("../src-dbst");
/* FsProvider ********************************************************************/
class FsStorage extends src_dbst_1.StorageGeneric {
    constructor(options) {
        super(options);
        this.rootpath = path_1.default.resolve(options.bucket);
        if (!(0, node_fs_1.existsSync)(this.rootpath))
            throw new index_1.AppExc(1030, 'fs storage path not found', null, [this.rootpath]);
        index_1.Log.info('Storage FS - path:[' + this.rootpath) + ']';
    }
    ping() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const txt = new Date().toISOString();
                const data = Buffer.from(txt);
                const p = path_1.default.resolve(this.rootpath, 'ping.txt');
                yield (0, promises_1.writeFile)(p, data);
                return [0, 'File-System ping OK: ' + txt];
            }
            catch (e) {
                return [1, 'File-System ping KO: ' + e.toString];
            }
        });
    }
    getUrl(id1, id2, id3) {
        return this.storageUrlGenerique(id1, id2, id3);
    }
    putUrl(id1, id2, id3) {
        return this.storageUrlGenerique(id1, id2, id3);
    }
    getFile(id1, id2, id3) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const p = path_1.default.resolve(this.rootpath, id1, this.cryptId(id2), this.cryptId(id3));
                return yield (0, promises_1.readFile)(p);
            }
            catch (err) {
                index_1.Log.error(err.toString());
                return null;
            }
        });
    }
    putFile(id1, id2, id3, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const dir = path_1.default.resolve(this.rootpath, id1, this.cryptId(id2));
                if (!(0, node_fs_1.existsSync)(dir))
                    (0, node_fs_1.mkdirSync)(dir, { recursive: true });
                const p = path_1.default.resolve(dir, this.cryptId(id3));
                yield (0, promises_1.writeFile)(p, Buffer.from(data));
            }
            catch (err) {
                index_1.Log.error(err.toString());
                throw err;
            }
        });
    }
    delFiles(id1, id2, lidf) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!lidf || !lidf.length)
                return;
            try {
                const dir = path_1.default.resolve(this.rootpath, id1, this.cryptId(id2));
                if ((0, node_fs_1.existsSync)(dir)) {
                    for (let i = 0; i < lidf.length; i++) {
                        const idf = this.cryptId(lidf[i]);
                        const p = path_1.default.resolve(dir, idf);
                        try {
                            (0, node_fs_1.unlinkSync)(p);
                        }
                        catch (e) { /* rien*/ }
                    }
                }
            }
            catch (err) {
                index_1.Log.error(err.toString());
                throw err;
            }
        });
    }
    delId(id1, id2) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const dir = path_1.default.resolve(this.rootpath, id1, this.cryptId(id2));
                if ((0, node_fs_1.existsSync)(dir)) {
                    (0, node_fs_1.rmSync)(dir, { recursive: true, force: true });
                }
            }
            catch (err) {
                index_1.Log.error(err.toString());
                throw err;
            }
        });
    }
    delOrg(id1) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const dir = path_1.default.resolve(this.rootpath, id1);
                if ((0, node_fs_1.existsSync)(dir)) {
                    (0, node_fs_1.rmSync)(dir, { recursive: true, force: true });
                }
            }
            catch (err) {
                index_1.Log.error(err.toString());
                throw err;
            }
        });
    }
    listFiles(id1, id2) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const lst = [];
                const dir = path_1.default.resolve(this.rootpath, id1, this.cryptId(id2));
                if ((0, node_fs_1.existsSync)(dir)) {
                    const files = (0, node_fs_1.readdirSync)(dir);
                    if (files && files.length)
                        files.forEach(name => {
                            const dname = this.decryptId(name);
                            lst.push(dname);
                        });
                }
                return lst;
            }
            catch (err) {
                index_1.Log.error(err.toString());
                throw err;
            }
        });
    }
    listIds(id1) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const lst = [];
                const dir = path_1.default.resolve(this.rootpath, id1);
                if ((0, node_fs_1.existsSync)(dir)) {
                    const files = (0, node_fs_1.readdirSync)(dir);
                    if (files && files.length)
                        files.forEach(name => {
                            const dname = this.decryptId(name);
                            lst.push(dname);
                        });
                }
                return lst;
            }
            catch (err) {
                index_1.Log.error(err.toString());
                throw err;
            }
        });
    }
}
exports.FsStorage = FsStorage;
