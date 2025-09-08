import { idxType, props, docHeader, collection, idx, DocType, DocTypeNosync, ThType, DocSchema } from '../src-fw/doctypes'

const DocTypes = [
  new DocType(
    { name: 'Hdr', sync: false, pk: [] }, //header
    null, // collections
    null // index
  ),
  new DocType(
    { name: 'Org', sync: true, pk: ['org'] }, //header
    null, // collections
    null
  ),
  new DocType(
    { name: 'Task', sync: false, pk: ['process', 'pk'] }, //header
    null, // collections
    new Map<string, idx>([['startTime',  { type: idxType.STRING, global: true }]]) // index 
  ),

  new DocType(
    { name: 'Article', sync: true, pk: ['artid'] }, //header
    new Map<string, collection>([
        ['sujet', { key: ['sujet'], mutable: true }],
        ['auteurs', { key: ['autid'], mutable: true, list: true }]
    ]), // collections
    null // index
  ),
  new DocType(
    { name: 'Auteur', sync: true, pk: ['autid'] }, //header
    null, // collections
    new Map<string, idx>([['nom',  { type: idxType.STRING }]])
  ),
  new DocType(
    { name: 'Chat', sync: true, pk: ['chatid'] }, //header
    new Map<string, collection>([ 
      ['participants', { key: ['autid'], mutable: true, list: true }]
    ]), // collections
    new Map<string, idx>([['time', {type: idxType.INTEGER} ]])
  ),
  new DocType(
    { name: 'Sujet', sync: true, pk: ['sujet'] }, //header
    null, // collections
    new Map<string, idx>([['titre', {type: idxType.INTEGER} ]])
  )
]

export const docSchema = new DocSchema(DocTypes)

