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

export const nbOp = factories.size
