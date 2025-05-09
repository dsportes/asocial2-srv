import { Operation, BaseConfig } from '../src-fw/index'

export function register () {
  return Operation.nbOf()
}

/* EchoTexte retourne le texte passé en argument (un peu modifié)
*/
class EchoTexte2 extends Operation {

  constructor () { super() }

  init () {
    this.params.text = this.stringValue('text', true, 1, 10)
    if (this.params.text.startsWith('KO')) throw Error('KO')
  }

  async run () {
    this.result = { echo: 'echo >>> ' + this.params.text + ' [' + this.today + ']'}
  }

}
Operation.register('EchoTexte2', () => { return new EchoTexte2()})
