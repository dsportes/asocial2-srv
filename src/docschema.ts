import { idxType, collection, idx, DocType } from '../src-fw/doctypes'

new DocType(
  { name: 'Hdr', sync: false, pk: [] }, //header
  null, // collections
  null // index
)

new DocType(
  { name: 'Org', sync: true, pk: ['org'] }, //header
  null, // collections
  null
)

new DocType(
  { name: 'Task', sync: false, pk: ['process', 'pk'] }, //header
  null, // collections
  new Map<string, idx>([['startTime',  { type: idxType.STRING, global: true }]]) // index 
)

new DocType(
  { name: 'Article', sync: true, pk: ['artid'] }, //header
  new Map<string, collection>([
      ['sujet', { key: ['sujet', 'sousSujet'], mutable: true }],
      ['auteurs', { key: ['autid'], mutable: true, list: true }]
  ]), // collections
  null // index
)

new DocType(
  { name: 'Auteur', sync: true, pk: ['autid'] }, //header
  null, // collections
  new Map<string, idx>([['nom',  { type: idxType.STRING }]])
)

new DocType(
  { name: 'Chat', sync: true, pk: ['chatid'] }, //header
  new Map<string, collection>([ 
    ['participants', { key: ['autid'], mutable: true, list: true }]
  ]), // collections
  new Map<string, idx>([['time', {type: idxType.INTEGER} ]])
)

new DocType(
  { name: 'Sujet', sync: true, pk: ['sujet'] }, //header
  null, // collections
  new Map<string, idx>([['titre', {type: idxType.INTEGER} ]])
)

export const docTypeErrors = DocType.errors
