import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import path from 'path'
import { Util } from './util'

/*****************************************************
 * Ligne de commande: node src/crypKeys.ts "toto est tres tres beau"
 * Transforme le fichier keys.json en un script keys.ts 
 * exportant l'objet keys.json crypté.
*/
export function cryptKeys () {
  const cmdargs = parseArgs({
    allowPositionals: false,
    options: { 
      pwd: { type: 'string', short: 'p' },
      in: { type: 'string', short: 'i' },
      out: { type: 'string', short: 'o' }
    }
  })
  const pwd: string = cmdargs.values['pwd']
  const inf = cmdargs.values['in']
  const outf = cmdargs.values['out']

  const key = Util.pbkdf2(pwd)
  console.log('key= ' + key.toString('base64'))
  const pjson = path.resolve(inf)
  if (!existsSync(pjson)) {
    console.log(pjson + ' NOT FOUND')
  } else {
    try {
      const buf = readFileSync(pjson)
      const b1 = Util.crypt(key, buf)
      const b64 = b1.toString('base64')
      const b2 = Util.decrypt(key, b1)
      const pmjs = path.resolve(outf)
      const x = 'export const encryptedKeys = \'' + b64 + '\'' + '\n'
      writeFileSync(pmjs, Buffer.from(x, 'utf8'))
      console.log(pmjs + ' written')
    } catch (e) {
      console.log('Encryption failed. ' + e.message)
    }
  }
}

cryptKeys()
