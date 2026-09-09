# BUGS


# Safe

- gestion de la non régression du time d'une signature dans un service.

# Serveur

GetLock : hors transaction.

Non régression de v pour un document à gérer.

Export Db: fait ? à vérifier

Export FS

Tasks

Compta

# App

Gestion de fin de session: souscription de "background" et son longLife

# DB from scratch
- safe.sql 
- générer schema.sql
- dans base z lancer le script initsites.sql OU ... 
  - le compte daniel pourra créer de puis la Page Administration:
  - les Sites et les services (services.json et sites.json)
  - Rappel: un code de site se terminant par st est un storage de Safe Box.

- création du compte daniel - Invité, site "blue", mot de passe "adminadmin1"
- se connecter par alias / phrase (ne semble plus requis, bug corrigé)
- dans Page Administration Technique
  - déclarer le service AS2 UP
  - déclarer une organisation doda sur site blue
  - sur onglet Organisations,
    - déclarer UP doda sur site blue
- dans Menu >>> Ma Safe Box >>> Certifier mon terminal

>>> 1 a

# Protection du Master Directory
Les opérations sur le MD vérifient que l'utilisateur demandeur de l'opération a droit de l'effectuer selon les  critères suivants.

`$mdUserNew`
- aucune protection pour l'instant, le userId n'étant pas connu avant par principe.
- réfléchir à une autorisation par présentation d'un _token_ de durée de vie limitée générée par un autre utilisateur ayant droit à un certain nombre de tokens sur une durée donnée.

`$mdUserSetAA GetAAS SetS`
- l'utilisateur fournit un shK

`$mdUserGetICVS`
- depuis un login, un hsha est fournit.
- prévoir une temporisation en cas d'échec pour limiter l'attaque par force brute.

`$mdUserGetCV AliasFree`
- libre. 
- prévoir une temporisation en cas d'échec pour limiter l'attaque par force brute.

**Opérations d'administration**
- la signature d'un challenge authentifie le userId qui doit figurer dans la liste des administrateurs.


# Détection des pertes de synchronisation

Applicable par `service / organisation`.

#### Synchronisation _générale_
Première synchronisation juste après une _souscription_:
- elle porte sur tous les périmètres,
- c'est depuis celle-ci qu'il faut contrôler l'absence de perte,
  - de synchronisations incrémentales courantes,
  - de notifications de changement sur des _defs_.

#### Synchronisation _sélective_
Les synchronisations _sélectives_ ne porte que sur les _defs_ pour lesquels la session a reçu une notification de changement.

#### Notifications _reçues_ par une session S1
- soit sur au retour d'une opération soumise par S1 elle-même ayant modifié des documents faisant l'objet d'un abonnement,
- soit du fait d'une opération soumise par une autre session et ayant modifié des documents auxquels la session S1 est abonnée.

#### _Heartbeats_ d'une session
Cette opération est émise par une session dès lors qu'un délai de quelques minutes s'est écoulé sans qu'aucune synchronisation n'ait été effectué avec pour seul objectif d'affirmer que la session est toujours _vivante_.

### Table SVC@HBC
Colonnes:
- `org`: organisation.
- `sessionId`: ID de la session. Clé primaire `org sessionId`.
- `ttl`: time-to-live, date heure (_epoch_ en minutes) au delà de laquelle la session est considérée comme terminée.
- `hbc`: texte `dh c` où:
  - `dh`: est la date-heure de la dernière synchronisation _générale_,
  - `c`: un compteur séquentiel.

Les rows ayant un `ttl` dépassé sont ignorés et peuvent être techniquement purgés à tout instant.

Pour une session donnée `sessionId` et un couple `svc org` les opérations suivantes agissent sur svc@HBC.

#### Synchronisation _générale_ de date d'opération `now`:
Effectué **dans la transaction** de synchronisation:
- création ou remplacement du row.
- `ttl` est mis à `now` en minutes + X minutes.
- `hbc`:
  - `dh`: `now`
  - `c`: 1

#### Synchronisation _sélective_ de date d'opération `now`:
Effectué **dans la transaction** de synchronisation:
- lecture du row: exception s'il n'existe pas.
- `ttl` est mis à `now` en minutes + X minutes.
- `hbc`:
  - `dh`: inchangé
  - `c`:  valeur précédente incrémentée de 1.

#### Toutes opérations _ayant mis à jour un document synchronisé_ de date d'opération `now`

A) Effectué **dans la transaction** de l'opération:
- lecture du row: exception s'il n'existe pas.
- `ttl` est mis à `now` en minutes + X minutes.
- `hbc`:
  - `dh`: inchangé
  - `c`:  valeur précédente incrémentée de 1.

Le triplet `svc org hbc` est retourné en résultat de l'opération:
- il annonce au _store_ de `svc/org` (s'il y en a un) qu'une mise à jour le concernant _peut-être_ a été faite.
- si les documents mis à jour faisaient partie de l'abonnement courant de la session, le _store_ est informé dans le but d'en demander une synchronisation _sélective_ sur ces documents.
- si aucun des documents mis à jour ne faisaient l'objet d'abonnement, le _store_ est informé seulement pour garder trace d'une évolution du compteur `hbc` et en surveiller la continuité.

B) Effectué après la fin de la transaction de mise à jour:
- ce sont des _notifications_ à destination d'autres sessions que des documents auxquels elles sont abonnées ont changé.
- ça ne concerne qu'un couple svc/org (celui de l'opération source).
- dans une courte transaction dédiée,
  - lecture du row: ne fait rien s'il n'existe pas.
  - `ttl` est inchangé.
  - `hbc`:
    - `dh`: inchangé
    - `c`:  valeur précédente incrémentée de 1.

Le _message de notification_ porte le hbs résultant. La session réceptrice,
- vérifie que le **dh** est bien celui en cours (dernière synchronisation _générale_). Sinon il s'agit d'une _vieille_ notification à ignorer, du moins vis à vis de la synchro des documents, les messages de notification peuvent apparaître.
- note le compteur c pour contrôle de perte de synchro.
- déclenche les synchronisations sélectives requises. 

#### _Heartbeats_ d'une session
Effectué **dans la transaction** de l'opération:
- lecture du row: exception s'il n'existe pas.
- `ttl` est mis à `now` en minutes + X minutes.
- `hbc`:
  - `dh`: inchangé
  - `c`:  inchangé.

### Contrôle de l'absence de _perte_ de synchronisation
#### Mode strict
Dans ce mode la session vérifie que les hbc reçus,
- ont un dh égal à celui de la dernière synchronisation _générale_ (sinon les ignore).
_ que le c est bien égal au c actuellement connu + 1.

Si ce n'est pas le cas,
- soit des _notifications_ ont été perdues,
- soit une opération de _synchro sélective_ s'est mal terminé **après** le _commit_: bref le résultat de la synchro n'a pas été reçu. Mais _normalement_ ce dernier cas doit se traduire en session par une exception en retour de l'opération _Sync_. 

Problème : les notifications sont _poussées_ par un circuit externe qui peut avoir des lenteurs et/ou ne pas respecter un ordre de distribution respectant l'ordre de génération.

#### Mode souple
Dans ce mode on garde l'historique des c reçus.
- à chaque fois que l'historique est une séquence continue, il est réduit à son dernier terme (le plus récent).
- quand il y a des _trous_ dans l'historique, c'est _peut-être_ dû à un retard d'acheminement d'une notification. On ne déclare pas immédiatement que la synchronisation est _cassée_.
- toutefois quand un historique est _troué_ depuis plus d'un certain temps, on considère que la perte de notification(s) est définitive et la synchro est déclarée _cassée_.
