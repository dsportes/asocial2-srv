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
exports.appSQLiteConnexion = appSQLiteConnexion;
const src_sl_1 = require("../src-sl");
function appSQLiteConnexion(code, site, op) {
    return __awaiter(this, void 0, void 0, function* () {
        const cnx = new AppSQLiteConnexion((0, src_sl_1.getOptions)(code, site), op);
        yield cnx.connect();
    });
}
class AppSQLiteConnexion extends src_sl_1.SQLiteConnexion {
    constructor(opts, op) { super(opts, op); }
}
