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
