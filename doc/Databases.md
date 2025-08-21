# Document : row / data / classe
## Classes spéciales `Hdr Org Ftp`
`Hdr` est une class singleton représentant l'état global du _service_:
- elle ne peut être mise à jour que par une opération de niveau _administration_.
- sa _clé primaire_ par convention vaut '1'.
- l'instance n'a ni clés secondaires ni propriétés indexées autres celles de base.

`Org` est la classe dont chaque instance représente une _organisation_, son statut, etc.
- sa _clé primaire_ est par convention le code de l'organisation.

## Format _data_
_data_ est un objet ayant toujours les propriétés suivantes:
- `_class` : string donnant la classe du document, commençant par une majuscule comme `Avatar`.
- `_org` : string donnant le code de l'organisation. Ce code est inscrit au moment de l'écriture d'un document dans la DB, (pour un objet créé et jamais inséré il est absent).
  - certaines sélections pour les tâches d'administration peuvent retourner des documents issus de plusieurs organisations: on retrouve ainsi l'organisation de chaque document.
  - normalement aucun traitement applicatif pur (sauf administration) n'a à traiter l'organisation d'un document.
- `_v` : entier. Numéro de version. Pour un objet créé et jamais inséré _v vaut 0 ce qui permet de savoir en SQL s'il faut effectuer un insert ou un update.
- `_zombi` : entier. Numéro de jour sous la forme 20250820 de suppression logique du document. Si absent le document existe.
- `gr ac livr ...` : propriétés string de la _clé primaire_ du document.
  - remarque: les _clés secondaires_ sont aussi composées exclusivement de celles-ci. 

> Les noms des propriétés _applicatives_ ne commencent pas par `_`. Les noms `ac gr livr ...` sont données à titre d'exemple.

Un document _zombi_ (supprimé logiquement) a un _data_ ne contenant **que** les propriétés ci-dessus.

Autres propriétés applicatives:
- elles ont n'importe quel nom commençant par une minuscule.
- elles peuvent des `string, number, boolean, array, objet`.

Un objet data peut être _sérialisé / désérialisé_ par `encode / decode` de `@msgpack/msgpack`.
- pour devenir la propriété `data` d'un _row_, la sérialisation est cryptée par la clé du site.

## Format _classe_
Une classe de document hérite de la class générique `Document`.

### `Document.compile(data: object) : Document`
Cette opération retourne une instance de la classe de document indiquée dans `data._class`:
- la compilation générique crée une instance ayant une propriété pour chacun de celles trouvées dans data.
- les méthodes `doc.compile()` d'instance de documents effectuent un post-traitement applicatif retournant cette instance, par défaut aucun traitement.

### `doc.toData(opt?: objet) : object`
Ces méthodes d'instances de documents retourne l'objet data depuis une instance de classe:
- la méthode générique héritée retranscrit une propriété dans data pour chaque propriété de l'instance dont le nom ne commence pas par _ plus les propriétés `_class _org _v _zombi`. Elle n’interprète pas l'objet d'options `opt`.
- les méthodes de chaque classe de document, interprètent l'argument `opt` si présent et peuvent ou non invoquer `super.toData()`.

## Format _row_
C'est un objet représentant le document stocké en DB.

Ses propriétés systématiques sont:
- `pk` : string. clé primaire.
  - pour les documents de classe `Org`, `pk` est le code de l'organisation.
  - pour les documents de classe `Hdr` qui sont des singletons, `pk` est absent.
  - pour les autres classes, `pk` est l'encodage en base 64 URL du sha16 de la sérialisation de l'array `[gr, ac, livr, ...]` propriétés formant la clé primaire.
- `v` : entier. version du document.
- `z` : entier ou absent. Valeur de zombi pour un document supprimé.
- `data` : binaire, jamais indexée. Sérialisation cryptée du _data_ du document.

Ses autres propriétés sont indexées.

### Clé secondaires: sk1 sk2 sk3 ...
Il peut ne pas y en avoir.

Ce sont des strings. Si la clé secondaire #2 est formée des propriétés `gr, livr` `sk2` est l'encodage en base 64 URL du sha16 de la sérialisation de l'array `[gr, livr]`.

### Propriétés indexées: i1 i2 i3 ...
- Il peut ne pas y en avoir.
- Chacune correspond à UNE propriété applicative.
- Chacun peut être déclarée G / O:
  - G : l'index à une portée _globale_ de toutes les organisations. Ce sont des propriétés utilisables uniquement dans les opérations d'administration.
  - O (par défaut) : l'index n'a une portée QUE sur l'organisation spécifiée.
- Elles ont les types possibles:
  - `hash` : encodage en base 64 URL du sha16 de la propriété string applicative. Le seul filtrage possible est sur égalité.
  - `string int float` : c'est la propriété telle quelle qui permet les filtrages d'égalité et d'ordre.
  - `list` : la propriété est un array de string et le seul filtrage possible est `in`.

> Les propriétés _applicatives_, sauf `v z` et celles indexées et de type non `hash`, ne sont pas lisibles directement dans la base, même par son hébergeur: les clés primaires et secondaires sont des _hash_ et _data_ est cryptée. Il faut la clé de cryptage du site gérée confidentiellement par _l'administrateur technique_ pour en prendre connaissance.

### Méthode Document.toRow(data): objet
Cette méthode utilise le schéma des documents pour savoir générer les propriétés `pk ski ii` depuis les valeurs des propriétés applicatives constitutives trouvées dans data:
- elle retourne l'objet row correspondant au data.
- data du row est la sérialisation cryptée par la clé du site de l'objet data passé en argument.

### Méthode Document.toData(row): objet
Cette méthode décrypte row.data par la clé du site et désérialise le résultat.

### Export / import
L'export des documents d'une base consiste à lire tous les documents _d'une organisation donnée_ pour chaque classe de document et pour chaque document:
- en obtenir son _data_ décrypté / désérialisé,
- changer si demandé son organisation,
- effectuer si demandé un traitement spécifique de la classe du document sur ce data,
- convertir ce data en format _row_ pour insertion sur la base d'import.

L'export / import peut ne concerner qu'une classe de document avec les objectifs suivants:
- simple audit de l'administrateur, sans cryptage dans la base importée, afin de pouvoir les lire _en clair_.
- remplacement après traitement d'une classe de document pour une organisation donnée:
  - export de A et import sans cryptage dans T,
  - suppression de A des documents de cette classe.
  - export de T et import dans A.

> L'export pour _toutes les organisations_ est une itération sur les organisations de l'export d'une seule.

## Fils de document: classe `DThread` (héritant de `Document`)
Vis à vis du stockage en base de données, ces documents ayant certaines restrictions:
- ils ont une clé primaire `pk` mais aucune clé secondaire ni propriété indexée.
- le nom de la table (SQL) ou classe de document (NOSQL) support n'est PAS `DThread` mais le nom `DT...` figurant dans l'objet / data.

Chaque instance représente un _fil de documents_.

#### Propriété d'un fil
- `_class`: c'est le nom de la classe du **Fil** commençant arbitrairement par `DT`. 
- `pk` : c'est un array de strings donnant la clé primaire du fil.
- `v` : version du fil.
- `z` : jour de suppression du fil.
- `versions` est une map avec une entrée pour chaque classe de document donnant `[nb, vmax]`,
  - `nb`: le nombre de documents **existants** (non _zombi_),
  - `vmax`: le numéro de version du document de la collection _le plus récemment créé / mis à jour / supprimé_ .

La classe `DThread` est _finale_ (pas de sous-classe).

#### Règles de gestion
Un fil est créé par la création du premier document devant y être attaché de par sa classe et ses propriétés de sa clé secondaire correspondant au fil.
- il est ensuite mis à jour à chaque création / mise à jour / suppression d'un document lui étant rattaché ou devant lui être rattaché (en cas de création).
- il devient _zombi_ quand le nombre total de documents _existant_ rattachés est nul. Il sera _purgé_ quelques mois plus tard (si non recréé d'ici là) quand sa synchronisation incrémentale sera transformée en synchronisation intégrale

A la création / mise à jour / suppression d'un document de classe C, récupération des fils auxquels le document est attaché. 
- La nouvelle `v` du document est calculée comme le maximum des `v` des fils trouvés + 1.

**Création** : pour chaque fil auquel le document doit être attaché:
- s'il n'existe pas, créer le fil avec,
  - l'élément `versions.C` mis à `[1, v]`
  - les autres éléments `versions.x` sont initialisés à `[0, 0]`
  - si le fil avait une propriété `z`, elle est supprimée (cas de _renaissance_ d'un fil qui était _zombi_).
- s'il existe dans l'élément `versions.C`, le nombre de documents est incrémenté et la version est mise à `v`.
- la nouvelle `v` du fil est mis à la nouvelle `v` du document.

**Mise à jour** : pour chaque fil auquel le document est attaché:
- dans l'élément `versions.C` le nombre de documents `nb` est inchangé et la version `vmax` est mise à `v`.
- la nouvelle `v` du fil est mis à la nouvelle `v` du document.

**Suppression** : pour chaque fil auquel le document est attaché:
- dans l'élément `versions.C`,
  - si le nombre de documents `nb` est > 1, il est décrémenté de 1 et la version `vmax` est mise à `v`.
  - sinon l'élément est mis `[0, 0]`
- la nouvelle `v` du fil est mis à la nouvelle `v` du document.
- si tous les éléments de `versions.X` ont un nombre de documents `nb` à 0, le fil devient _zombi_: sa propriété `z` est mis à la date du jour.

# Provider _Firestore_
## Paths
Le path du singleton `Hdr` est `Hdr/1`.

Le path d'un document `Org` est `Org/demo`.

Le path des autres classes, par exemple `Avatar`, sont `Org/demo/Avatar/kYc..`, des sous-documents de l'organisation.
- `demo` est l'organisation,
- `kYc...` est le `pk` de l'avatar.

Pour un _fil de documents_ `Fil1` le path est `Org/demo/$Fil1/kYc..`.

**Toutes** les propriétés des _rows_ sauf `data` sont indexées basiquement, toutefois les propriétés indexées marquées `G` doivent être déclarées :

    "queryScope": "COLLECTION_GROUP"
    (au lieu de "COLLECTION" pour les autres)

C'est aussi le cas pour la propriété `z` pour pouvoir _purger_ les vieux zombis.

Chaque classe de _document_ et de _fil_ doit avoir une déclaration spécifique qui permette de la filtrer sur son égalité de `pk` ET sa version avec `>`:

    {
    "indexes": [
      {
        "collectionGroup": "avatar",
        "queryScope": "COLLECTION",
        "fields": [
          {
            "fieldPath": "pk",
            "order": "ASCENDING"
          },
          {
            "fieldPath": "v",
            "order": "ASCENDING"
          }
        ]
      },

# API d'accès primaire générique
Chaque fonction peut être invoquée ou non au sein d'une transaction:
- T : _toujours_ dans une transaction,
- E : utilisé exclusivement en export, _jamais_ dans une transaction,
- I : utilisé exclusivement en import, _jamais_ dans une transaction,
- sinon accepte les deux cas.

Les fonctions A exigent une transaction en mode _administration_.

`dataSer` : binaire d'un _data_ sérialisé (désérialisable par `decode()`)

Les accès retournant une _liste_ peuvent avoir comme dernier paramètre une fonction fn anonyme qui reçoit en argument chaque _data_ et la traite. Cette facilité permet d'éviter d'accumuler des listes longues quand la _data_ peut être transformée / traitée une par une.

## Accès `Hdr`

getHdr(v) : dataSer
- v : ne retourne la data que si elle est postérieure à v.

setHdr(data) - A
- data : construit le row associé et l'enregistre.

## Accès `Org`

listOrgs(v?, fn?) : dataSer[] - A
- v : ne retourne la data que si elle est postérieure à v ou que v est absent ou 0.
- fn

getOrg(org, v) : dataSer
- org : code l'organisation.
- v : ne retourne la data que si elle est postérieure à v ou que v est absent ou 0.

setOrg(data) - T
- insère s'il vient d'être créé sinon met à jour le document de l'organisation représenté par son data.

insertOrg(data) - I
- force l'insertion du document de l'organisation représenté par son data.

listOrgsIdx(p1, comp, val, fn?) : dataSer[] - T
- p1 : nom de propriété du row indexée. Si le type de p1 est `hash`, c'est le sha16 de la valeur de la propriété applicative qui est comparée.
- comp : comparateur `LT LE EQ GE GT IN`. Les opérateurs n'étant pas tous autorisés en fonction du type de p1, comp est forcé dans les cas suivants: `hash: EQ`, `list: IN`
- val : valeur de comparaison (string, number).
- fn

## Accès _fil_

listDThreads(org, cl, v?, fn?) : dataSer[]
- org : code de l'organisation.
- cl : classe du _fil_.
- v : ne retourne que les data de version postérieure à v si v est présent et non 0.
- fn

getDThread(org, cl, pk, v?) : dataSer
- org : code de l'organisation.
- cl : classe du _fil_.
- v : si présent et non 0, ne retourne le data que si sa version est supérieure à v.

setDThread(data) - T
- insère (s'il vient d'être créé) ou met à jour le document du _fil_ représenté par son data.

insertDThread(data) - I
- insère le document du _fil_ dans le cadre d'un import.

## Accès _document_

listDocs(org, cl, v?, fn?)
- org : code de l'organisation.
- cl : classe du document.
- v : ne retourne que les data de version postérieure à v si v est présent et non 0.
- fn

getDoc(org, cl, pk, v?)
- org : code de l'organisation.
- cl : classe du _document_.
- v : si présent et non 0, ne retourne le data que si sa version est supérieure à v.

setDoc(data)
- insère (s'il vient d'être créé) ou met à jour le document représenté par son data.

insertDoc(data) - I
- insère le document représenté par son data.

## Sélection des documents par clés secondaires

listDocsSk(org, cl, sk, val, v?, fn?) - T
- org : code de l'organisation
- cl : classe du document.
- sk : code de la clé secondaire à utiliser.
- val : valeur de filtre de cette clé. string représentant son hash.
- v : si présent et non 0, ne retourne le data que si sa version est supérieure à v.
- fn

## Sélection des documents par propriétés indexées

listDocsIdx(org, cl, p1, comp, val, v?, fn?)
- org : code de l'organisation
- cl : classe du document.
- p1 : code de la propriété de filtrage à utiliser.
- comp : comparateur LT LE EQ GE GT IN. Les opérateurs ne sont pas tous autorisés en fonction du type de p1 (hash: EQ, list: IN).
- val : valeur de comparaison (string, number).
- v : si présent et non 0, ne retourne le data que si sa version est supérieure à v.
- fn

## Purges

purgeOrg(org, z) - A/I
- org : code de l'organisation
- z : si présente et non 0, ne purge que les documents dont le Z est antérieure (administration) sinon import hors transaction.

purgeDoc(org, cl, pk) - A ?????????????
- org : code de l'organisation.
- cl : classe du document ou du _fil_.
- pk : clé primaire du document.

purgeDocs(org, cl, z) - A/I
- org : code de l'organisation.
- cl : classe du document ou du _fil_.
- z : si présente et non 0, ne purge que les documents dont le Z est antérieure (administration) sinon import hors transaction.

purgeZombis() - A

# Autres _tables_ / _Classes de documents_

## Fichiers à purger
Des fichiers stockés en _storage_ peuvent être marqués _à purger_ jusqu'à un jour donné: au delà de ce jour, ils peuvent être purgés du storage.

Le `path` d'un fichier d'une organisation en storage est de la forme `folderId/fid` :
- `folderId` est facultatif et son string peut contenir des /.
- `fid` est un string totalement identifiant en lui-même.

**NOSQL**
- le path d'un document est `Orgs/org/FTP/path`
- sa propriété unique (et indexée) est `p`, date du jour de purge.

**SQL**
- la table a pour nom FTP.
- ses propriétés sont `org, path, p`. La clé primaire est `org, path`.

setFTP(org, path, p)

purgeFTP(org, path)

purgeAllFTP(org, p)
- si p est absent ou 0, purge sans tenir compte de la date de purge, sinon uniquement ceux de date antérieure.

## Gestion des tâches
