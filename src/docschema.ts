import { propType, collection, idx, DocType, FormType } from '../src-fw/doctypes'

new DocType(
  { name: '$Status', sync: true }, //header
  null, // collections
  null
)

new DocType(
  { name: '$Task', sync: false, pk: ['process', 'target'] }, //header
  null, // collections
  new Map<string, idx>([
    ['startTime',  { type: propType.STRING, global: true }]
  ]) // index 
)

new DocType(
  { name: '$Subs', sync: false, pk: ['sessionId'] }, //header
  null, // collections
  null // index  
)

new DocType(
  { name: '$SubsItem', sync: false, pk: ['sessionId', 'def'] }, //header
  null, // collections
  new Map<string, idx>([
    ['def',  { type: propType.STRING }]
  ]) // index 
)

new DocType(
  { name: '$Credential', sync: false, pk: ['credId'], subClassBy: 'docCl'
   }, // header
  null, // collections
  new Map<string, idx>([
    ['doc', { type: propType.HASH, key: ['docCl', 'docPk'], nohash: true }],
  ])
)

new DocType(
  { name: '$Form', sync: true, pk: ['formId'], 
    nohash: true, subClassBy: 'type' }, // header
  null, // collections
  new Map<string, idx>([
    ['creds', { type: propType.LIST, nohash: true }]
  ])
)

new DocType(
  { name: 'Readaction', virtual: true, manager: true },
  null,
  null
)

new DocType(
  { name: 'CoDir', virtual: true, manager: true },
  null,
  null
)

new DocType(
  { name: 'Section', virtual: true, enum: ['roman', 'histoire', 'sf'] },
  null,
  null
)

new FormType('default', 'k1', ['A'])
new FormType('membrecodir', 'k1', ['A'])
new FormType('membreredaction', 'k1', ['A'])
new FormType('auteur', 'k2', ['Readction/1'])
// Un Auteur peut aussi nommer un co-auteur
new FormType('coauteur', 'k2', ['Readction/1', 'Auteur/$1'])

new DocType(
  { name: 'Article', sync: true, pk: ['artid'] }, //header
  new Map<string, collection>([
    ['sujet', { key: ['sujet', 'sousSujet'], mutable: true }],
    ['auteurs', { key: ['autid'], mutable: true, list: true }]
  ]), // collections
  new Map<string, idx>([
    ['volume',  { type: propType.FLOAT }]
  ]) // index 
)

new DocType(
  { name: 'Auteur', sync: true, pk: ['autid'], embedCreds: true }, //header
  null, // collections
  new Map<string, idx>([
    ['nom',  { type: propType.STRING, testable: true }]
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
export const docTypeNb = DocType.docTypes.size
