/* Retourne un string en base 64 depuis un binaire */
export function keyToB64(key: Buffer) : string {
  return key ? Buffer.from(key).toString('base64') : ''
}

export function keyFromB64 (key: string) : Buffer{
  return Buffer.from(key, 'base64')
}

/* Retourne un string en base 64 URL depuis un base 64 standard */
export function toUrl (s: string) : string {
  if (!s) return ''
  let i = s.length
  for(; s.charAt(i-1) === '='; i--) {}
  return s.substring(0, i).replace(/\+/g, '-').replace(/\//g, '_')
}

/* Retourne un string en base 64 stanadard depuis un string en base 64 URL */
export function fromUrl (s: string) : string {
  const diff = s.length % 4
  const pad = diff ? '===='.substring(0, 4 - diff) : ''
  return s.replace(/-/g, '+').replace(/_/g, '/') + pad
}
