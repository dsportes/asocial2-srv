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
const index_1 = require("../src-fw/index");
function register(config) {
    index_1.Operation.config = config;
}
/* EchoTexte retourne le texte passé en argument (un peu modifié)
*/
class EchoTexte2 extends index_1.Operation {
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
index_1.Operation.register('EchoTexte2', () => { return new EchoTexte2(); });
