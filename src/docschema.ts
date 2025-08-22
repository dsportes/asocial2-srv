import { idxType, DocType, ThType, DocSchema } from '../src-fw/doctypes'

const DocTypes = {
  Org: new DocType('Org'),
  Task: new DocType('Task', [['processPk']], [['startTime', idxType.STRING, true]]),
  RG: new DocType('RG'),
  RC: new DocType('RC', [['gc']]),
  RP: new DocType('RP', [['gp']]),
  FGC: new DocType('FGC', [['gc']]),
  FCO: new DocType('FCO', [['gc', 'co'], ['gc'], ['co']]),
  FGP: new DocType('FGP', [['gp']]),
  FPR: new DocType('FPR', [['gp', 'pr'], ['gp'], ['pr']]),
  CATG: new DocType('CATG', [['gp']]),
  CATL: new DocType('CATL', [['gp', 'livr']]),
  CALG: new DocType('CALG', [['gp']]),
  LIVRG: new DocType('LIVRG', [['gp', 'livr'], ['gp']]),
  BCC: new DocType('BCC', [['gc', 'co', 'gp', 'livr'], ['gc', 'gp', 'livr'], ['gc', 'co', 'livr']]),
  BCG: new DocType('BCG', [['gc', 'gp', 'livr'], ['gc', 'gp'], ['gp', 'livr']]),
  CART: new DocType('CART', [['gp', 'pr', 'livr', 'gc'], ['gp', 'livr', 'gc'], ['gp', 'pr'], ['gp', 'livr']]),
  CHL: new DocType('CHL', [['gp', 'livr'], ['gp']]),
  CHD: new DocType('CHD', [['gp', 'livr', 'gc'], ['gp', 'livr'], ['gp', 'gc']]),
  CHCO: new DocType('CHCO', [['gc']]),
  CHPR: new DocType('CHPR', [['gp']])
}

const ThTypes = {
  // commande d'un groupe gc à un groupement gp pour une livraison livr
  CMDGC: new ThType('CMDGC', ['gc', 'gp', 'livr'], 
    new Map([[DocTypes.BCG, 0], [DocTypes.CART, 1], [DocTypes.BCC, 1]])),

  // commandes d'un consommateur gc co pour une livraison livr (tous groupements confondus)
  BCC: new ThType('BCC', ['gc', 'co', 'livr'],
    new Map([[DocTypes.BCC, 2]])),
  
  // commandes d'un groupe gc à un groupement gp
  CMDOV: new ThType('CMDOV', ['gc', 'gp'],
    new Map([[DocTypes.BCG, 1]])),

  // calendrier des livraisons d'un groupement gp
  CALGP: new ThType('CALGP', ['gp'],
    new Map([[DocTypes.CALG, 0], [DocTypes.LIVRG, 1], [DocTypes.CHL, 1]])),
  
  // commandes à un groupement gp pour une livraison livr
  CMDGP: new ThType('CMDGP', ['gp', 'livr'],
    new Map([[DocTypes.CHD, 1], [DocTypes.BCG, 2], [DocTypes.CART, 3]])),

  // répertoire général des groupes et groupements
  RG: new ThType('RG', [], new Map([[DocTypes.RG, -1]])),

  // fiche d'un groupe gc, ses consommateurs, son chat 
  RGC: new ThType('RGC', ['gc'],
    new Map([[DocTypes.RC, 0], [DocTypes.CHCO, 0], [DocTypes.FGC, 0], [DocTypes.FCO, 1]])),

  // fiche du consommateur gc co
  FCO: new ThType('FCO', ['gc', 'co'],
    new Map([[DocTypes.FCO, 0]])),
  
  // Chat point de livraison
  CHD: new ThType('CHD', ['gp', 'gc'],
    new Map([[DocTypes.CHD, 2]])),
  
}

export const docSchema = new DocSchema(DocTypes, ThTypes)

