import crypto from 'crypto'
import path from 'path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

function getSalt () {
  const s = new Uint8Array(16)
  for (let j = 0; j < 16; j++) s[j] = j + 47
  return Buffer.from(s)
}

function crypt (key, buf) { // u8: Buffer
  const cipher = crypto.createCipheriv('aes-256-cbc', key, getSalt())
  const b1 = cipher.update(buf)
  const b2 = cipher.final()
  return Buffer.concat([b1, b2])
}

const cmdargs = parseArgs({
  allowPositionals: false,
  options: { 
    pwd: { type: 'string', short: 'p' }
  }
})

const par = cmdargs.values['pwd']
const pwd = Buffer.from(par, 'utf-8')
const key = crypto.pbkdf2Sync(pwd, getSalt(), 10000, 32, 'sha256')
console.log('key= ' + key.toString('base64'))
const pjson = path.resolve('./keys.json')
if (!existsSync(pjson)) {
  console.log('./keys.json NOT FOUND')
} else {
  try {
    const buf = readFileSync(pjson)
    const b64 = crypt(key, buf).toString('base64')
    const pmjs = path.resolve('./src-fw/keys.ts')
    const x = 'export const json64 = \'' + b64 + '\'\r\n'
    writeFileSync(pmjs, Buffer.from(x, 'utf8'))
    console.log('./src-fw/keys.js written')
  } catch (e) {
    console.log('Encryption failed. ' + e.message)
  }
}
