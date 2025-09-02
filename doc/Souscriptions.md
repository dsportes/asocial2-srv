# Souscriptions des sessions
Une session est identifiée de manière unique par son jeton de web-push `wpToken`: dans un serveur `sessionId` est un entier JS `hashInt(wpToken)`.

### Souscription élémentaire
Une souscription élémentaire est,
- soit une souscription à UN document : _classe / valeur de la clé primaire_. Par exemple `Note:FR/3246`, _la_ note d'identifiant FR/3246.
- soit une souscription à une sous-collection de documents selon une clé secondaire : _classe du document . clé secondaire / valeur de la clé_. Par exemple `Note.aut:a7689`, _les_ notes ayant pour auteur a7689.

Les valeurs des clés sont des strings pouvant contenir des /.

Chaque souscription élémentaire est identifiée par `ids` un entier par la session, la définition de la souscription pouvant être un texte long.

### Objet souscription
Il comporte les éléments suivants:
- `org` : code l'organisation
- `wpToken` : le token de la session
- `sessionId` : son hashInt
- `time` : date-heure de déclaration
- `defs` : une map `{ ids: [def, msg] }` donnant en `ids` le shaInt du `def` représentant le code d'une souscription élémentaire (`msg` est facultatif).

Une session _s'abonne_ à des _synchronisations / notifications_ en soumettant une opération subscribe ayant en paramètre l'objet de souscription. Si defs est absent, la session est désabonnée.

#### Mise à jour de la base de données:
- Table `Subs`: insertion / mise à jour d'un row `{ (org), sessionId, time, data }` :
  - `sessionId` est clé primaire.
  - `data` est la sérialisation de l'objet souscription.
- Table `Eltsubs` : insertion / suppression pour chaque élément de defs d'un row `{ (org), sessionId, def }`.
  - après lecture de la version déjà enregistrée et comparaison avec la nouvelle version, les souscriptions élémentaires déjà présentes sont inchangées, les nouvelles ajoutées et les autres supprimées.

## Notification des sessions en fin d'opération
Une opération peut mettre à jour des documents, par exemple des notes et après _commit_ va émettre des notifications à toutes les sessions abonnées à des documents élémentaires et à des collections de documents.

Pour chaque document de clé primaire pk mis à jour, il faut notifier les sessions:
- de la mise à jour du document,
- du changement des sous-collections.

Exemple 1:
- mise à jour d'un document Note : `{ pk: FR/3246, aut: [a7689],` data: ... }
  - la propriété `aut` avait la valeur `a7689` et la conserve.
- les souscriptions élémentaires à notifier sont :
  - `Note:FR/3246`
  - `Note.aut:a7689` : la liste des notes est inchangée mais la note FR/3246 a changé de contenu.

Exemple 2:
- mise à jour d'un document Note : `{ pk: FR/3246, aut: [a7689, a8887], data: ... }`
  - la propriété `aut` avait la valeur `a7689` et prend la valeur `a8887`.
- les souscriptions élémentaires à notifier sont :
  - `Note:FR/3246`
  - `Note.aut:a7689` : la liste des notes est changée, déjà a priori réduite par l'évolution de la note FR/3246 (mais peut-être d'autres)
  - `Note.aut:a8887 `: la liste des notes est changée, déjà a priori augmentée par l'évolution de la note FR/3246 (mais peut-être d'autres)

### Process
#### Étape 1
Depuis la liste des documents changés on calcule la liste des définitions des souscriptions élémentaires impactées. Pour chacune `def` de celles-ci,
- on obtient de la table `Eltsubs` la liste des `sessionId` qui référence `def`. Pour chaque sessionId,
  - on obtient l'objet de souscription de la table Subs.
  - on créé / met à jour l'élément la map des sessions à notifier de clé  sessionId et de valeur [ids, ...] où ids est le shaInt de def.

#### Étape 2
Pour chaque session identifiée par sessionId à notifier on dispose de la liste des ids à _synchroniser_.

Pour pousser une notification à la session il faut obtenir son `wpToken` (lu de la base ou conserver en cache) depuis son `sessionId`.

Chaque session concernée recevra en conséquence une liste [ids] qui chacun est le shaInt d'une définition: la session retrouve la définition correspondante et pourra en obtenir les évolutions depuis la version connue en session.

## Notifications avec _messages_
Les souscriptions élémentaires avec pour unique objectif de _synchroniser_ des documents n'ont pas de message: la session réceptrice ne fait pas apparaître de pop-up qui, du fait de leur nombre potentiellement importun, seraient inopportunes.

Certaines souscriptions ont pour but de provoquer l'affichage d'une pop-up pour alter l'utilisateur: ce peut être le cas quand l'application n'est PAS lancée. 
- la donnée de _synchronisation_ (la liste des ids) est inutilisée, non transmise à l'application.
- en revanche la notification peut porter un _message_, un texte généré sur le serveur.

### Message associé à UNE souscription élémentaire
La souscription peut renseigner pour chaque souscription élémentaire le texte du message qui sera émis. Par exemple pour `Note.aut/a7689` le message `"Maj d'une note de Hugo"`.

Une notification peut avoir plusieurs messages: ils sont concaténés sur des lignes séparées.

### Messages génériques 
Un tel message est déclaré pour s'appliquer à TOUTES les souscriptions élémentaires d'une même _classe_, c'est à dire de la partie avant le '/' dans sa description.

Dans l'objet souscription une map `msgGen` comporte des éléments ayant:
- pour _clé_ la classe: par exemple `Note.aut`.
- pour _valeur_ le message, par exemple `"Maj d'une note"`.

Si une notification élémentaire `Note.aut/a7689` est à produire,
- si `Note.aut/a7689` a un _message_ spécifique, il est concaténé dans le message à afficher,
- sinon, 
  - si `Note.aut` a une entrée dans `msgGen` c'est ce message qui est concaténé.
  - sinon, rien n'est concaténé.

_Remarque_: un même texte n'est jamais concaténé plus d'une fois.

## Documents en base de données: _historique_ des versions
Une _version_ est un entier donnant une date-heure en _micro-seconde_:
- les 5 premiers chiffres donne le numéro du jour depuis le 1970.
- les 8 suivants donne le nombre de ms dans la journée.
- les 3 suivants donne un numéro _arbitraire_ de micro-seconde attribué au lancement du serveur et tel que deux instances de serveurs aient n'aient pas la même valeur.

Une opération reçoit une _version_ qui sera celle de tous les documents créés / modifiés / supprimées dans l'opération.

Exemple:
La classe de document Note a les propriétés suivantes:
- `pk` : numéro identifiant de la note.
- `aut` : identifiant de son auteur.
- `sujet` : identifiant du sujet dans la liste des sujets répertoriés.
- `data` : texte, fichiers attachés, etc.

On peut s'abonner à :
- une note spécifiée : `Note:FR/3246`
- la collection des notes d'un auteur `a7689` donné: `Note.aut/a7689`
- la collection des notes d'un sujet `écologie` donné: `Note.sujet/écologie`

### Cas simple
Les propriétés `aut` et `sujet` sont _immuables_, ne peuvent pas changer pour une note donnée après sa création.

#### Problème de la _suppression_ de la note `FR/3246`
La note n'est pas _purgée_ mais _zombifiée_:
- sa version `v` est celle de l'opération.
- son indicateur `z` est mis à la date du jour (les 5 premiers chiffres de la version), il indique que la note n'existe plus (a été supprimée).

La session a conservé des versions:
- `v[Note:FR/3246]` : v1 la version de la dernière note `FR/3246` obtenue du serveur.
- `v[Note.aut/a7689]` : v2 la plus haute des versions des notes retournées après sélection des notes `where aut == a7689`.

La synchronisation par `Note:FR/3246`: `where pk == FR/3246 and v > v1`:
- retourne la version vx marquée _zombi_.

La synchronisation par `Note.aut/a7689`: `where aut == a7689 and v > v2`:
- retourne la version vx marquée _zombi_. La note est FR/3246 est enlevée de la liste en mémoire `Note.aut/a7689`.

### Cas général
Les propriétés `aut` et `sujet` NE sont PAS _immuables_ et peuvent changer pour une note donnée après sa création.

> En plus du problème de la suppression, se pose celui du changement d'auteur et / ou de sujet.

Quand l'une au moins des propriétés aut et sujet change de valeur, il est inséré un autre row avec:
- la même version,
- un indicateur R (retrait) à true,
- les valeurs _avant_ de aut et sujet quand elles ont changé,
- un data restreint au propriétés de la clé primaire comme pour un _zombi_.

Exemple: la note Note:FR/3246 change d'auteur a6789 -> b6666 mais pas de sujet.

    (1) v:...17          pk:FR/3246 aut:b6666 sujet:écologie 
    (2) v:...17 R z:..32 pk:FR/3246 aut:a6789        

La synchronisation par `Note:FR/3246`: `where pk == FR/3246 and v > v1`:
- retourne (1) : la ligne (2 R) est ignorée pour un accès primaire à la note.

La synchronisation par `Note.aut/a7689`: `where aut == a7689 and v > v2`:
- NE retourne pas la ligne (1), l'auteur n'est pas a6789.
- retourne la ligne (2) qui indique qu'il faut retirer FR/3246 de la liste des notes.

La synchronisation par `Note.sujet/écologie`: `where sujet == écologie and v > v2`:
- retourne la ligne (1), la note est mise à jour dans la liste.
- NE retourne PAS la ligne (2) qui n'indique pas un sujet _écologie_.

La session terminale peut ainsi maintenir à jour:
- note FR/3246
- ses deux listes `Note.aut/a7689` et `Note.sujet/écologie`.

#### Purge des lignes R
Le fait de marquer un jour de _zombification_ sur une ligne permet quelques mois après ce jour de purger par une tâche celles-ci supposées ne plus avoir d'utilité, toutes les sessions ayant été mises à niveau incrémentalement (ou ayant subi un rechargement non incrémental).

## Propriétés de type _liste_
Dans l'exemple Note, la propriété aut peut être une liste d'auteurs `auts` de dimension modeste.

La synchronisation par `Note.auts/a7689` s'écrit avec une clause différente: `where auts array-contains a7689 and v > v2`:
- retourne toutes les notes dont l'un des auteurs cités dans `auts` vaut a7689.
- si cette liste contient `[a1, a2, a3]` le process de notification doit rechercher l'existence de souscriptions élémentaires `Note.auts/a1` `Note.auts/a2` `Note.auts/a3`, bref tous _abonnements_ à un des auteurs cités: c'est pour cela que cette liste doit rester modeste.
- quand cette liste évolue et que des auteurs par exemple a2 et a3 sont retirés les lignes R sont à inscrire pour chacune des valeurs a2 et a3.

## TODO
R doit il être systématique R = 0:courant, 1:historique ?
- on ne peut pas on utiliser z sinon l'index de z va être énorme.
- on pourrait utiliser un index composite pk / v / r.
- orderBy v et orderBy r avc limit 1 pour accès par pk.
