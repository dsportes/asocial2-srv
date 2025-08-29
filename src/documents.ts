import { Document } from '../src-fw/document'

class Hdr extends Document {
  static release = 1

}

class Org extends Document {
  static release = 1

}

class Task extends Document {
  static release = 1

}

export const documentClasses = {
  Hdr: Hdr,
  Org: Org,
  Task: Task
}

/* Mute un data en fonction de sa release et d'éventuelles options
Met à jour, supprime ajoute les prpropriétés requises dans la
dernière version en fonction de sa release actuell.
Retourne couple du data (ancien ou celui muté) 
et de l'indicateur de mutation (false si inchangé)
*/
export function mutate (data: Object, options?: Object) : [Object, boolean] {
  const cl = documentClasses[data['clazz']]
  const lr = cl.release === data['rel']
  // Implémentaion simpliste
  if (lr && !options) return [data, false]

  const d = { ...data }
  let m = false
  /* adapter d en fonction de d.cl d.rel et opts */
  return m ? [d, m] : [data, false]
}
