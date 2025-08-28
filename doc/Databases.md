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
- `_z` : entier. Numéro de jour sous la forme 20250820 de suppression logique du document. Si absent le document existe.
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
- `k0` : string. clé primaire.
  - pour les documents de classe `Org`, `k0` est le code de l'organisation.
  - pour les documents de classe `Hdr` qui sont des singletons, `k0` est absent.
  - pour les autres classes, `k0` est l'encodage en base 64 URL du sha16 de la sérialisation de l'array `[gr, ac, livr, ...]` propriétés formant la clé primaire.
- `v` : entier. version du document.
- `z` : entier ou absent. Valeur de zombi pour un document supprimé.
- `data` : binaire, jamais indexée. Sérialisation cryptée du _data_ du document.

Ses autres propriétés sont indexées.

### Clé secondaires: k1 k2 k3 ...
Il peut ne pas y en avoir.

Ce sont des strings. Si la clé secondaire #2 est formée des propriétés `gr, livr` `sk2` est l'encodage en base 64 URL du sha16 de la sérialisation de l'array `[gr, livr]`.

### Propriétés indexées: i0 i1 i2 ...
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

#### Index de liste de valeurs
Les propriétés indexées peuvent être de type `list`, avoir un array de valeurs. La sélection peut se faire avec l'opérateur `IN` et rechercher les documents dont la valeur `myval1` est dans la liste des valeurs de leur propriété `i2`.

Les index _de liste_ ne sont pas implémentés nativement dans toutes les base de données.

Pour chaque propriété de type `list`, `i2` par exemple, le format _row_ va disposer de 2 valeurs:
- `i2` : la liste des valeurs du document à insérer / mettre à jour.
- `_i2` : la liste des valeurs actuelles.

De cette manière il est ainsi possible de gérer une table annexe permettant de gérer les sélections par l'opérateur `IN`.

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
- ils ont une clé primaire `k0` mais aucune clé secondaire ni propriété indexée.
- le nom de la table (SQL) ou classe de document (NOSQL) support n'est PAS `DThread` mais la propriété `_class` nom figurant dans l'objet / data.

Chaque instance représente un _fil de documents_.

#### Propriété d'un fil
- `_class`: c'est le nom de la classe du **Fil** commençant arbitrairement par `DT`. 
- `k0` : c'est un array de strings donnant la clé primaire du fil.
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
Le path du singleton `Hdr` est `Hdr/hdr`.
Le path du singleton `Ping` est `Hdr/ping`.
Le path d'un document `Org` est `Org/demo`.

Le path des autres classes, par exemple `Avatar`, sont `Org/demo/Avatar/kYc..`, des sous-documents de l'organisation.
- `demo` est l'organisation,
- `kYc...` est le `k0` de l'avatar.

Pour un _fil de documents_ `Fil1` le path est `Org/demo/Fil1/kYc..`.

**Toutes** les propriétés des _rows_ sauf `data` sont indexées basiquement, toutefois les propriétés indexées marquées `G` doivent être déclarées :

    "queryScope": "COLLECTION_GROUP"
    (au lieu de "COLLECTION" pour les autres)

C'est aussi le cas pour la propriété `z` pour pouvoir _purger_ les vieux zombis.

Chaque classe de _document_ (sauf `Hdr Task`) et de _fil_ doit avoir une déclaration spécifique qui permette de la filtrer sur son égalité de `k0` ET sa version avec `>`:

    {
    "indexes": [
      {
        "collectionGroup": "avatar",
        "queryScope": "COLLECTION",
        "fields": [
          {
            "fieldPath": "k0",
            "order": "ASCENDING"
          },
          {
            "fieldPath": "v",
            "order": "ASCENDING"
          }
        ]
      },

# API d'accès primaire générique

Les accès retournant une _liste_ peuvent avoir comme dernier paramètre une fonction fn anonyme qui reçoit en argument chaque _data_ et la traite. Cette facilité permet d'éviter d'accumuler des listes longues quand la _data_ peut être transformée / traitée une par une.

## Accès aux documents / fils / tasks

    async getDoc (org: string, cl: string, pk: string, v?: number) { return null }
    async insertDoc (row: Object) {}
    async updateDoc (row: Object) {}
    async deleteDoc (org: string, cl: string, pk: string) {}
    async listDocs (org: string, cl: string, v?: number, fn? : Function) { return [] }
    async listDocsSk (org: string, cl: string, ik: number, val: string, v?: number, fn? : Function) { return [] }
    async listDocsIdx (org: string, cl: string, ix: number, comp: string, val: any, v?: number, fn? : Function) { return [] }

## Accès `Hdr`

    async getHdr (v? : number) { return null }
    async insertHdr (row: Object) {}
    async updateHdr (row: Object) {}

## Accès `Org`

    async getOrg (org: string, v?: number) { return null }
    async insertOrg (row: Object) {}
    async updateOrg (row: Object) {}
    async listOrgs (v?: number, fn? : Function) { return [] }  
    async listOrgsIdx (ix: number, comp: string, val: any, v?: number, fn? : Function) { return []}

## Purges hors transaction

    async purgeAllDocs (org: string, cl: string) {}
    async purgeOrg (org: string, z?: number) {}
    async purgeOrgs (org: string, z: number) {}
    async purgeDlvDocs (org: string, cl: string, ix: number, comp: string, val: any, lsp?: string[]) {}

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

    async setFTP (org: string, path: string, dp: number) {}
    async purgeFTP (org: string, path: string) {}
    async listFTP (dp : number, fn: Function) {}
    async purgeAllFTP (dp : number) {}

## Gestion des tâches
Une tâche différée est représentée par une instance d'une classe héritant de `Task` (héritant de Document) ayant les propriétés suivantes:
- `_class` : `Task`.
- `_org` : code l'organisation.
- `starTime`: date-heure de création. Cette propriété est l'index 0 (`i0` du row), de type string / global. 
- `process` : classe de traitement de la tâche (sous-classe de `Task`).
- `pk` : array des identifiants de la cible du traitement.
- `nb`: une tâche peut être _itérative_ pour épuiser une liste. nb est le nombre d'itérations restant à effectuées.
- `exc`: code de l'exception rencontrée lors du dernier traitement.
- `endTime`: date-heure de fin.

La propriété `k0` du row correspondant est le base64 du sha16 de l'array `processPk`.

`'startTime endTime`' ont une forme string `AAAAMMJJhhmmssmmm` ce qui les rend comprables par relation d'ordre et plus lisible.

**NOSQL**
- le path d'une tâche est `Orgs/org/Task/pk`
- les propriétés sont `org k0, i0, data`.
- il n'y a ni `v` ni `z`. 

**SQL**
- table portant le nom `Task`.
- colonnes: `org, k0, i0, data`

**Méthode spécifique**

    async nextTask (time: string) { return null }

