import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import path from 'path'
import { keyToB64 } from './b64'
import { Crypt } from './crypt'
import { toUrl } from './b64'
import { Log } from '../src-fw/log'

/*****************************************************
 * Ligne de commande: npx tsx src-fw/cryptKeys.ts -i ./keys.json -o src/keys.ts -p "toto est tres tres beau"
 * Transforme le fichier keys.json en un script keys.ts 
 * exportant l'objet keys.json crypté.
*/
export function cryptKeys () {
  const cmdargs = parseArgs({
    allowPositionals: true,
    options: { 
      pwd: { type: 'string', short: 'p' },
      in: { type: 'string', short: 'i' },
      out: { type: 'string', short: 'o' }
    }
  })
  const pwd: string = cmdargs.values['pwd']
  const inf = cmdargs.values['in']
  const outf = cmdargs.values['out']

  const k = Crypt.syncStrongHash(pwd + pwd)
  Log.info('key= ' + toUrl(keyToB64(k)))
  const pjson = path.resolve(inf)
  if (!existsSync(pjson)) {
    Log.error(pjson + ' NOT FOUND')
  } else {
    try {
      const buf = readFileSync(pjson)
      const b1 = Crypt.syncCrypt(k, buf)
      const b64 = b1.toString('base64')
      // const b2 = Crypt.syncDecrypt(k, b1)
      const pmjs = path.resolve(outf)
      const x = 'export const encryptedKeys = \'' + b64 + '\'' + '\n'
      writeFileSync(pmjs, Buffer.from(x, 'utf8'))
      Log.info(pmjs + ' written')
    } catch (e) {
      Log.error('Encryption failed. ' + e.message)
    }
  }
}

cryptKeys()
