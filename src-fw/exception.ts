import { encode } from '@msgpack/msgpack'
import { config } from '../src-app/app'
import { logInfo, logError } from'./log'
import { Operation } from './operation'

interface admin_alerts { url: string, pwd: string, to: string }

export async function adminAlert (op: Operation, subject: string, text: string) {
  const al: admin_alerts  = config.keys['adminAlerts']
  if (al['adminAlerts'] === 0) return
  const s = '[' + config.site + '] '  
    + (op && op.org ? 'org:' + op.org + ' - ' : '') 
    + (op ? 'op:' + op.opName + ' - ' : '') 
    + subject
  logInfo('Mail sent to:' + al.to + ' subject:' + s + (text ? '\n' + text : ''))

  if (!config.adminAlerts) return

  // Test avec le script server.php
  try {
    const response = await fetch(al.url, {
      method: 'POST',
      headers:{
        'Content-Type': 'application/x-www-form-urlencoded'
      },    
      body: new URLSearchParams({ 
        mailer: 'A',
        mdp: al.pwd, 
        subject: s, 
        to: al.to, 
        text:  text || '-'
      })
    })
    const t = await response.text()
    if (!t.startsWith('OK'))
      logError('Send mail error: [' + al.url + '] -  ' + t)
  } catch (e) {
    logError('Send mail exception: [' + al.url + '] -  ' + e.toString())
  }
}

/* code
  1000: erreurs fonctionnelles FW
  2000: erreurs fonctionnelles APP
  3000: asserions FW
  4000: asserions APP
  8000: asserions FW - transmises à l'administrateur
  9000: asserions APP - transmises à l'administrateur
*/

export class AppExc {
  public code: number
  public label: string
  public opName: string
  public org: string
  public stack: string
  public args: string[]

  constructor (op: Operation, code: number, label: string, args?: string[], stack?: string) {
    this.label = label
    this.code = code
    this.opName = op ? op.opName : ''
    this.org = op && op.org ? op.org : ''
    this.args = args || []
    this.stack = stack || ''
    const m = 'AppExc: ' + code + ':' + label + (op ? '@' + op.opName + ':' : '') + JSON.stringify(args || [])
    if (code > 3000) logError(m + this.stack)
    else { if (config.debugLevel > 0) logInfo(m) }
    if (code > 8000)
      adminAlert(op, m, this.stack)
  }

  serial() { 
    return Buffer.from(encode({code: this.code, label: this.label, opName: this.opName,
      org: this.org, stack: this.stack, args: this.args}))
  }
}
