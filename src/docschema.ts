import { propType, collection, idx, DocType } from '../src-fw/doctypes'

new DocType(
  { name: 'Org', sync: true, pk: [] }, //header
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
  { name: 'Credential', sync: false, pk: ['userId', 'role', 'docId'] }, // header
  new Map<string, collection>([
    ['userId', { key: ['userId'], mutable: false }]
  ]), // collections
  new Map<string, idx>([
    ['roles', { type: propType.HASH, key: ['role', 'docId'] }],
  ])
)

new DocType(
  { name: 'Invitation', sync: true, pk: ['inviId'] }, // header
  new Map<string, collection>([
    ['major', { key: ['major'], mutable: false }],
    ['majorminor', { key: ['major', 'minor'], mutable: false }]
  ]), // collections
  null
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
