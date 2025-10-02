import { propType, collection, idx, DocType } from '../src-fw/doctypes'

new DocType(
  { name: 'Org', sync: true, pk: ['org'] }, //header
  null, // collections
  null
)

new DocType(
  { name: 'Task', sync: false, pk: ['process', 'target'] }, //header
  null, // collections
  new Map<string, idx>([
    ['startTime',  { type: propType.STRING, global: true }]
  ]) // index 
)

new DocType(
  { name: 'Subs', sync: false, pk: ['sessionId'] }, //header
  null, // collections
  null // index  
)

new DocType(
  { name: 'SubsItem', sync: false, pk: ['sessionId', 'def'] }, //header
  null, // collections
  new Map<string, idx>([
    ['def',  { type: propType.STRING }]
  ]) // index 
)

new DocType(
  { name: 'Article', sync: true, pk: ['artid'] }, //header
  new Map<string, collection>([
    ['sujet', { key: ['sujet', 'sousSujet'], mutable: true }],
    ['auteurs', { key: ['autid'], mutable: true, list: true }]
  ]), // collections
  new Map<string, idx>([
    ['volume',  { type: propType.FLOAT, global: true }]
  ]) // index 
)

new DocType(
  { name: 'Auteur', sync: true, pk: ['autid'] }, //header
  null, // collections
  new Map<string, idx>([
    ['nom',  { type: propType.STRING }]
  ])
)

new DocType(
  { name: 'Chat', sync: true, pk: ['chatid'] }, //header
  new Map<string, collection>([ 
    ['participants', { key: ['autid'], mutable: true, list: true }]
  ]), // collections
  new Map<string, idx>([
    ['time', {type: propType.INTEGER} ]
  ])
)

new DocType(
  { name: 'Sujet', sync: true, pk: ['sujet'] }, //header
  null, // collections
  new Map<string, idx>([
    ['titre', {type: propType.INTEGER} ]
  ])
)

export const docTypeErrors = DocType.errors
