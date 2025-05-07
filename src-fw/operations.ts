import { Operation } from './operation'
import { Log } from './index'

export function register () {
  Log.info(Operation.nbOf() + ' operations registered')
}

/* EchoTexte retourne le texte passé en argument (un peu modifié)
*/
class EchoTexte extends Operation {
  constructor () { super() }

  init () {
    this.params.text = this.stringValue('text', true, 1, 10)
    if (this.params.text.startsWith('KO')) throw Error('KO')
  }

  async run () {
    this.result = { echo: 'echo >>> ' + this.params.text + ' [' + this.today + ']'}
  }

}
Operation.register('EchoTexte', () => { return new EchoTexte()})

/* PingDB effectue un ping de DB et retourne le texte enregistré en DB
*/
class PingDB extends Operation {
  constructor () { super() }

  async run () {
    const [status, msg] = await this.db.ping()
    this.result = { status, msg}
  }

}
Operation.register('PingDB', () => { return new PingDB()})

/* GetPutUrl retourne l'URL de GET ou de PUT d'un fichier en storage
*/
class GetPutUrl extends Operation {
  constructor () { super() }

  init () {
    this.params.id1 = this.stringValue('id1', true)
    this.params.id2 = this.stringValue('id2', true)
    this.params.id3 = this.stringValue('id3', true)
    this.params.isPut = this.boolValue('put', true)
  }

  async run () {
    const p = this.params
    const url = p.isPut ? this.storage.putUrl(p.id1, p.id2, p.id3)
      : this.storage.getUrl(p.id1, p.id2, p.id3)
    this.result = { url }
  }

}
Operation.register('GetPutUrl', () => { return new GetPutUrl()})

