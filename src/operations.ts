import { Operation, registerOp, nbOperations } from '../src-fw/operation'

export function registerOpApp () { return nbOperations() }

/* EchoTexte retourne le texte passé en argument (un peu modifié)
*/
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
registerOp('EchoTexte', () => { return new EchoTexte()})
