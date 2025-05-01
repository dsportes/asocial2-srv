import { Operation, factories } from './operation'

class EchoTexte extends Operation {
  private text: string

  constructor () { super() }

  init () {
    this.params.text = this.stringValue('text', true, 1, 10)
    if (this.params.text.startsWith('KO')) throw Error('KO')
  }

  async run () {
    this.result = { echo: 'echo >>> ' + this.params.text + ' [' + this.today + ']'}
  }

}
factories.set('EchoTexte', () => { return new EchoTexte()})

class PingDB extends Operation {
  constructor () { super() }

  async run () {
    const [status, msg] = await this.db.ping()
    this.result = { status, msg}
  }

}
factories.set('PingDB', () => { return new PingDB()})

export const nbOp = factories.size
