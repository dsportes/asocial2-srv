import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import path from 'path'
import { Util } from './util'
import crypto from 'crypto'

/*****************************************************
 * Ligne de commande: node src/genVector.ts
 * génère le fichier vector.ts
*/

const iv = crypto.randomBytes(260)
const b64 = Util.u8ToB64(Buffer.from(iv))

const script = 'import { Util } from \'./util\'\nexport const vector = Util.b64ToU8(\'' + b64 + '\'' + ')\n'
const p = path.resolve('src-fw/vector.ts')
writeFileSync(p, Buffer.from(script, 'utf8'))
console.log(p + ' written')
