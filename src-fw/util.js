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
exports.Util = void 0;
const crypto_1 = __importDefault(require("crypto"));
class Util {
    static amj(epoch) {
        const d = new Date(epoch || Date.now());
        return (d.getUTCFullYear() * 10000) + ((d.getUTCMonth() + 1) * 100) + d.getUTCDate();
    }
    static sleep(delay) {
        return __awaiter(this, void 0, void 0, function* () {
            if (delay <= 0)
                return;
            return new Promise((resolve) => { setTimeout(() => resolve(), delay); });
        });
    }
    /* Retourne le couple [hostname, port] d'une URL */
    static getHP(url) {
        let i = url.indexOf('://');
        if (i !== -1)
            url = url.substring(i + 3);
        i = url.indexOf('/');
        if (i !== -1)
            url = url.substring(0, i);
        i = url.indexOf(':');
        const hn = i === -1 ? url : url.substring(0, i);
        const po = i === -1 ? 0 : parseInt(url.substring(i + 1));
        return [hn, po];
    }
    static buildSalt() {
        const s = new Uint8Array(16);
        for (let j = 0; j < 16; j++)
            s[j] = j + 47;
        return Buffer.from(s);
    }
    static getSalt() { return Util.salt; }
    static crypt(key, buf) {
        const cipher = crypto_1.default.createCipheriv('aes-256-cbc', key, Util.salt);
        const b1 = cipher.update(buf);
        const b2 = cipher.final();
        return Buffer.concat([b1, b2]);
    }
    static decrypt(key, bin) {
        const decipher = crypto_1.default.createDecipheriv('aes-256-cbc', key, Util.salt);
        const b1 = decipher.update(bin);
        const b2 = decipher.final();
        return Buffer.concat([b1, b2]);
    }
    static cryptId(key, id) {
        const x = Util.crypt(key, Buffer.from(id)).toString('base64');
        return x.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    }
    static decryptId(key, id64) {
        const x = Util.decrypt(key, Buffer.from(id64, 'base64'));
        return x.toString('utf8');
    }
    static pbkdf2(pwd) {
        return crypto_1.default.pbkdf2Sync(Buffer.from(pwd, 'utf-8'), Util.getSalt(), 10000, 32, 'sha256');
    }
}
exports.Util = Util;
Util.salt = Util.buildSalt();
