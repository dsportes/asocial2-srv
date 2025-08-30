import { Document, DocData } from '../src-fw/document'

class Hdr extends Document {
  static release = 1

}

class Org extends Document {
  static release = 1

  compile () { return this }

}

class Task extends Document {
  static release = 1

}

/* Mute un data en fonction de sa release et d'éventuelles options
Met à jour, supprime ajoute les prpropriétés requises dans la
dernière version en fonction de sa release actuell.
Retourne couple du data (ancien ou celui muté) 
et de l'indicateur de mutation (false si inchangé)
*/
function mutate (data: DocData, options?: Object) : [DocData, boolean] {
  const cl = documentClasses[data.clazz]
  const lr = cl.release === data.release
  // Implémentaion simpliste
  if (lr && !options) return [data, false]

  const d = { ...data }
  let m = false
  d.release = cl.release
  /* adapter d en fonction de d.cl d.rel et opts */
  return m ? [d, true] : [data, false]
}

export const documentClasses = {
  MUTATE: mutate,
  Hdr: Hdr,
  Org: Org,
  Task: Task
}
