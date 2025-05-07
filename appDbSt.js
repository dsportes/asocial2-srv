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
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbConnexion = dbConnexion;
exports.storageFactory = storageFactory;
const index_1 = require("../src-fw/index");
const index_2 = require("../src-dbst/index");
// Choix de l'application
const src_fs_1 = require("../src-fs");
const dbSqlite_1 = require("./dbSqlite");
function dbConnexion(code, site, op) {
    return __awaiter(this, void 0, void 0, function* () {
        if (code.startsWith('sql'))
            return yield (0, dbSqlite_1.appSQLiteConnexion)(code, site, op);
        throw new index_1.AppExc(8002, 'dbCode not implemented', op, [code]);
    });
}
function storageFactory(code, site) {
    const options = (0, index_2.getOptions)(code, site);
    if (code.startsWith('fs'))
        return new src_fs_1.FsStorage(options);
    throw new index_1.AppExc(8003, 'storage code not implemented', null, [code]);
}
