Sur srv:
- IDBgeneric à reprendre pour gérer le master dir, et sqlite avec.

# Safe
Gestion des invitations en cours (app, service OK ?)

- Gérer la mise à jour du volume des sessions par l'application.
- Gérer dans l'application l'arrivée d'une mise à jour de credential.

- gestion de la non régression du time d'une signature dans un service.
- récupération de l'URL du safe dans le query string.

# Serveur

Report des credentials: rapprochement _safe / service_.

GetLock : hors transaction.

Non régression de v pour un document à gérer.

Export Db: fait ? à vérifier

Export FS

Operation sync colls: fait ? à vérifier 

Tasks

Compta

# App

Gestion de fin de session: souscription de "background" et son longLife

Contexte d'ouverture de session: auths, sessionState

# DB from scratch
- safe.sql schema.sql

- création du compte daniel

Sous daniel
- récupération de son ID (en session normale)
- inscription dans src/index.ts en ADMINUSERS et relance du serveur
- dans Settings >>> Outils Techniques >>> Hot
  - déclarer le service AS2 pour l'opérateur $RED
  - ASSO2 pou $RED
  - Autoriser "doda" et "demo"
- dans Menu >>> Ma Safe Box >>> Gérer mes rôles d'admin, ajouter AS2 $RED
- dans Menu >>> Administration Technique >>> Service et Organisation
  - déclarer org. doda
- dans Menu >>> Données de sécurité >>> Certifier mon terminal

>>> 2 a

Daniel : setting de Domi comme "manager" >>> 3 a
(et testS grant / revoke / auto-revoke)

Daniel: demande Auteur 1
Domi : accepte Auteur 1 (auteur et droit minor)
Daniel valide Auteur 1
Daniel demande Auteur 2 minor
Daniel accepte Auteur 2 et valide Auteur 2
