
export function amj (epoch?: number) : number {
  const d = new Date(epoch || Date.now())
  return (d.getUTCFullYear() * 10000) + ((d.getUTCMonth() + 1) * 100) + d.getUTCDate()
}

export function sleep (delay: number) {
  if (delay <= 0) return
  return new Promise((resolve: Function) => { setTimeout(() => resolve(), delay) })
}

/* Retourne le couple [hostname, port] d'une URL */
export function getHP (url: string) : [string, number] {
  let i = url.indexOf('://')
  if (i !== -1) url = url.substring(i + 3)
  i = url.indexOf('/')
  if (i !== -1) url = url.substring(0, i)
  i = url.indexOf(':')
  const hn = i === -1 ? url : url.substring(0, i)
  const po = i === -1 ? 0 : parseInt(url.substring(i + 1))
  return [hn, po]
}
