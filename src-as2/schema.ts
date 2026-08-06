import { DocDescriptor, FormType, idx, collection, propType } from '../src-fw/docDescriptor'
import { Log } from '../src-fw/log'

let exc: Error | null = null

let svc = DocDescriptor.declareService('AS2')

try {
  const nd = DocDescriptor.size()
  const nf = FormType.size()

  new DocDescriptor(svc,
    { name: 'Status', sync: true, pk: ['svc'], nohash: true }
  )

  new DocDescriptor(svc,
    { name: 'Subs', pk: ['sessionId'] }
  )
  
  new DocDescriptor(svc,
    { name: 'SubsItem', pk: ['sessionId', 'def'] },
    null,
    new Map<string, idx>([
      ['def',  { type: propType.STRING }]
    ])
  )

  new DocDescriptor(svc, 
    { name: 'Credential', pk: ['credId'], nohash: true, subClassBy: 'docCl' },
    null,
    new Map<string, idx>([
      ['doc', { type: propType.HASH, key: ['docCl', 'docPk'], nohash: true }],
    ])
  )

  new DocDescriptor(svc, 
    { name: 'Form', pk: ['formId'], nohash: true, subClassBy: 'type' },
    null,
    new Map<string, idx>([
      ['creds', { type: propType.LIST, nohash: true }]
    ])
  )

  new DocDescriptor(svc, 
    { name: 'Section', virtual: true, enum: ['roman', 'histoire', 'sf'] }
  )

  new DocDescriptor(svc, 
    { name: 'Auteur', pk: ['autId'], sync: true, embedCreds: true },
    new Map<string, collection>([
      ['section',  { key: ['section'], mutable: true }]
    ]),
    new Map<string, idx>([
      ['nom',  { type: propType.STRING, key: ['nomAuteur'], testable: true }]
    ])
  )

  new DocDescriptor(svc,
    { name: 'Redaction', virtual: true }
  )

  new DocDescriptor(svc,
    { name: 'CoDir', virtual: true }
  )

  new FormType(svc, 'membrecodir', svc + '_' + 'ad', 'k1', ['A'])
  new FormType(svc, 'membreredaction', svc + '_' + 'ad', 'k1', ['A'])
  new FormType(svc, 'auteur', svc + '_' + 'auteurs', 'k2', ['Redaction/1'])
  // Un Auteur peut aussi nommer un co-auteur
  new FormType(svc, 'coauteur', 'auteurs', 'k2', ['Redaction/1', 'Auteur/$1'])
  
  Log.info('AS2 document descriptors:' + (DocDescriptor.size() - nd) 
    + ' forms descriptors:' + (FormType.size() - nf))

} catch (e: any) {
  exc = e
}

export const schemaExcAS2 = () : Error | null => {
  if (exc)  Log.error('Schema Exception: ' + exc.toString())
  return exc
}
