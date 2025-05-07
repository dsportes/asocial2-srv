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
exports.register = register;
const operation_1 = require("./operation");
const index_1 = require("./index");
function register() {
    index_1.Log.info(operation_1.Operation.nbOf() + ' operations registered');
}
/* EchoTexte retourne le texte passé en argument (un peu modifié)
*/
class EchoTexte extends operation_1.Operation {
    constructor() { super(); }
    init() {
        this.params.text = this.stringValue('text', true, 1, 10);
        if (this.params.text.startsWith('KO'))
            throw Error('KO');
    }
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            this.result = { echo: 'echo >>> ' + this.params.text + ' [' + this.today + ']' };
        });
    }
}
operation_1.Operation.register('EchoTexte', () => { return new EchoTexte(); });
/* PingDB effectue un ping de DB et retourne le texte enregistré en DB
*/
class PingDB extends operation_1.Operation {
    constructor() { super(); }
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            const [status, msg] = yield this.db.ping();
            this.result = { status, msg };
        });
    }
}
operation_1.Operation.register('PingDB', () => { return new PingDB(); });
/* GetPutUrl retourne l'URL de GET ou de PUT d'un fichier en storage
*/
class GetPutUrl extends operation_1.Operation {
    constructor() { super(); }
    init() {
        this.params.id1 = this.stringValue('id1', true);
        this.params.id2 = this.stringValue('id2', true);
        this.params.id3 = this.stringValue('id3', true);
        this.params.isPut = this.boolValue('put', true);
    }
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            const p = this.params;
            const url = p.isPut ? this.storage.putUrl(p.id1, p.id2, p.id3)
                : this.storage.getUrl(p.id1, p.id2, p.id3);
            this.result = { url };
        });
    }
}
operation_1.Operation.register('GetPutUrl', () => { return new GetPutUrl(); });
