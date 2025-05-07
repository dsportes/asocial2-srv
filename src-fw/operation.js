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
exports.Operation = void 0;
const index_1 = require("./index");
class Operation {
    static nbOf() {
        return Operation.factories.size;
    }
    static fake() { return new Operation(true); }
    static new(opName) {
        const f = Operation.factories.get(opName);
        return f ? f() : null;
    }
    static register(opName, factory) {
        Operation.factories.set(opName, factory);
    }
    constructor(fake) { this.fake = fake || false; }
    get config() { return Operation.config; }
    init() {
    }
    run() {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
    type(par, req) {
        if (par === undefined)
            throw new index_1.AppExc(8001, 'unknown argument', null, ['?']);
        const v = this.args[par];
        if (v === undefined) {
            if (req)
                throw new index_1.AppExc(3001, 'argument absent', null, [par]);
            return [false, null, ''];
        }
        return [true, v, typeof v];
    }
    invalid(par) { throw new index_1.AppExc(3001, 'invalid argument', this, [par]); }
    stringValue(par, req, minlg, maxlg) {
        const [present, value, type] = this.type(par, req);
        if (!present && !req)
            return '';
        if (present && type !== 'string'
            || (minlg !== undefined && value.length < minlg)
            || (maxlg !== undefined && value.length > maxlg)) {
            throw new index_1.AppExc(1010, 'invalid argument', this, [par]);
        }
        return value;
    }
    intValue(par, req, min, max) {
        const [present, value, type] = this.type(par, req);
        if (!present && !req)
            return 0;
        if (type !== 'number' || !Number.isInteger(value)
            || (min !== undefined && value < min)
            || (max !== undefined && value > max)) {
            throw new index_1.AppExc(1010, 'invalid argument', this, [par]);
        }
        return value;
    }
    boolValue(par, req) {
        const [present, value, type] = this.type(par, req);
        if (!present && !req)
            return false;
        if (type !== 'boolean')
            throw new index_1.AppExc(1010, 'invalid argument', this, [par]);
        return value;
    }
    orgValue(req) {
        return this.stringValue('org', req, 4, 16);
    }
}
exports.Operation = Operation;
Operation.factories = new Map();
