// import { BaseConfig } from '../src-fw/index'
import { Operation } from '../src-fw/operation'

export function register () {
  return Operation.nbOf()
}


/* Classe abstraite surchargeant la classe Operation générique
pour certaines méthodes ayant une implémentation spécifique.
*/
export class AppOperation extends Operation {

}

/* EchoTexte retourne le texte passé en argument (un peu modifié)
*/
class EchoTexte2 extends AppOperation {

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
