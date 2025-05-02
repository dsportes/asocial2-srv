import path from 'path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { crypt, pbkdf2 } from './util'

const cmdargs = parseArgs({
  allowPositionals: false,
  options: { 
    pwd: { type: 'string', short: 'p' }
  }
})

const pwd = cmdargs.values['pwd']
const key = pbkdf2(pwd)
console.log('key= ' + key.toString('base64'))
const pjson = path.resolve('./keys.json')
if (!existsSync(pjson)) {
  console.log('./keys.json NOT FOUND')
} else {
  try {
    const buf = readFileSync(pjson)
    const b64 = crypt(key, buf).toString('base64')
    const pmjs = path.resolve('./src-fw/keys.ts')
    const x = 'export const json64 = \'' + b64 + '\'' + '\n'
    writeFileSync(pmjs, Buffer.from(x, 'utf8'))
    console.log('./src-fw/keys.js written')
  } catch (e) {
    console.log('Encryption failed. ' + e.message)
  }
}
