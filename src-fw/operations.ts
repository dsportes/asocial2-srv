import { Operation } from './operation'
import { Item } from './items'
import { Util } from './util'
import { Log } from './index'

export function register () {
  return Operation.nbOf()
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
    this.result = { echo: '>>>' + this.params.text + '<<< [' + new Date(this.now).toISOString() + ']'}
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

/* RegisterToken enregistre un token et son hash */
class RegisterToken extends Operation {
  constructor () { super() }

  init () {
    const token = this.stringValue('token', true)
    Operation.setToken(token)
  }

}
Operation.register('RegisterToken', () => { return new RegisterToken()})

/* SetAndListen enregistre un item ******************************************
S'il n'existait pas lui affecte la valeur value
Se met à l'écoute (qu'il existait ou non)
*/
class SetAndListenItem extends Operation {
  constructor () { super() }

  init () {
    const id = this.stringValue('id', true)
    const value = this.stringValue('value', false)
    const token = this.stringValue('token', true)
    Item.setAndListen(id, value, token)
  }

}
Operation.register('SetAndListenItem', () => { return new SetAndListenItem()})

/* DeleteItem supprime un item (s'il existait) ******************************************
Notifie les écouteurs
*/
class DeleteItem extends Operation {
  constructor () { super() }

  init () {
    const id = this.stringValue('id', true)
    Item.deleteItem(id)
  }

}
Operation.register('DeleteItem', () => { return new DeleteItem()})

/* StopListen arrête d'écouter un item ******************************************
*/
class StopListenItem extends Operation {
  constructor () { super() }

  init () {
    const id = this.stringValue('id', true)
    const token = this.stringValue('token', true)
    Item.stopListen(id, token)
  }

}
Operation.register('StopListenItem', () => { return new StopListenItem()})

/* GetAllItems retourne tous les items écoutés par le token *****************
*/
class GetAllItems extends Operation {
  constructor () { super() }

  init () {
    this.params.token = this.stringValue('token', true)
  }

  async run () {
    const list = Item.getAll(this.params.token)
    this.result = { list }
  }

}
Operation.register('GetAllItems', () => { return new GetAllItems()})


/* TestMessage retourne tous les items écoutés par le token *****************
*/
class TestMessage extends Operation {
  constructor () { super() }

  init () {
    this.params.longtoken = this.stringValue('token', true)
    Operation.setToken(this.params.longtoken)
    console.log(Operation.tokenHash.get(this.params.longtoken))
  }

  async run () {
    /*
    const message = {
      notification: {
        title: 'Portugal vs. Denmark',
        'body': 'great match!'
      },
      // data: { score: '850', time: '2:45' },
      token: this.params.longtoken
    }
      */
    const message = {
      notification: {
        title: 'Hello',
        body: 'Depuis serveur'
      },
      data: { url: 'http://localhost:8085/'},
      token: this.params.longtoken
    }
    try {
      const resp = await Operation.config.messaging.send(message)
      console.log('Successfully sent message:', resp)
      this.result = { message }
    } catch (e) {
      console.log('Error sending message:', e)
    }
  }

}
Operation.register('TestMessage', () => { return new TestMessage()})
