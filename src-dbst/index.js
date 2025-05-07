"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageGeneric = exports.StOptions = exports.DbConnexion = exports.DbOptions = void 0;
exports.getOptions = getOptions;
const index_1 = require("../src-fw/index");
const msgpack_1 = require("@msgpack/msgpack");
class DbOptions {
    constructor(code, site) {
        this.cfg = index_1.Operation.config.dbOptions[code];
        if (!this.cfg)
            throw new index_1.AppExc(1020, 'config.dbOptions not found', null, [code]);
        this.code = code;
        if (!this.cfg.credentials)
            throw new index_1.AppExc(1022, 'config.stOptions credentials not found', null, [code]);
        const cred = index_1.Operation.config.keys[this.cfg.credentials];
        if (!cred)
            throw new index_1.AppExc(1023, 'keys credentials not found', null, [code, this.cfg.credentials]);
        this.credentials = cred;
        const k = index_1.Operation.config.keys['sites'][site];
        if (!k)
            throw new index_1.AppExc(1021, 'keys.sites not found', null, [site]);
        this.site = site;
        this.key = this.cfg.cryptIds ? Buffer.from(k, 'base64') : null;
    }
}
exports.DbOptions = DbOptions;
class DbConnexion {
    constructor(opts, op) {
        this.opts = opts;
        this.op = op;
    }
    get key() { return this.opts.key; }
}
exports.DbConnexion = DbConnexion;
class StOptions {
    constructor(code, site) {
        this.cfg = index_1.Operation.config.stOptions[code];
        if (!this.cfg)
            throw new index_1.AppExc(1020, 'config.stOptions not found', null, [code]);
        this.code = code;
        if (!this.cfg.bucket)
            throw new index_1.AppExc(1020, 'config.stOptions bucket not found', null, [code]);
        this.bucket = this.cfg.bucket;
        if (!this.cfg.credentials)
            throw new index_1.AppExc(1022, 'config.stOptions credentials not found', null, [code]);
        const cred = index_1.Operation.config.keys[this.cfg.credentials];
        if (!cred)
            throw new index_1.AppExc(1023, 'keys credentials not found', null, [this.cfg.credentials]);
        this.credentials = cred;
        const k = index_1.Operation.config.keys['sites'][site];
        if (!k)
            throw new index_1.AppExc(1024, 'keys.site not found', null, [site]);
        this.site = site;
        this.key = this.cfg.cryptIds ? Buffer.from(k, 'base64') : null;
    }
}
exports.StOptions = StOptions;
const optionsCache = new Map();
function getOptions(code, site) {
    let opts = optionsCache.get(code + '/' + site);
    if (!opts) {
        opts = new StOptions(code, site);
        optionsCache.set(code + '/' + site, opts);
    }
    return opts;
}
class StorageGeneric {
    constructor(options) {
        this.key = options.key;
        this.srvkey = Buffer.from(index_1.Operation.config.SRVKEY, 'base64');
        this.srvUrl = index_1.Operation.config.srvUrl || 'http://localhost:8080';
    }
    cryptId(id) {
        return this.key ? index_1.Util.cryptId(this.key, id) : id;
    }
    decryptId(id) {
        return this.key ? index_1.Util.decryptId(this.key, id) : id;
    }
    encode3(id1, id2, id3) {
        const b = Buffer.from((0, msgpack_1.encode)([id1, id2, id3]));
        const x = index_1.Util.crypt(this.srvkey, b).toString('base64');
        const y = x.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        return y;
    }
    decode3(b64) {
        const x = index_1.Util.decrypt(this.srvkey, Buffer.from(b64, 'base64'));
        return (0, msgpack_1.decode)(x);
    }
    storageUrlGenerique(id1, id2, id3) {
        return this.srvUrl + '/file/' + this.encode3(id1, id2, id3);
    }
}
exports.StorageGeneric = StorageGeneric;
