# Safe
Testé OK.

- Gérer la mise à jour du volume des sessions par l'application.
- Gérer dans l'application l'arrivée d'une mise à jour de credential.

# Serveur

GetLock : hors transaction.

Non régression de v pour un document à gérer.

Sous-collection sur propriétés immuables: ne pas gérer de rowQ.

Export Db: fait ? à vérifier

Export FS

Operation sync colls: fait ? à vérifier 

AuthRecord

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
- dans Settings / Outils Techniques / Hot
  - déclarer le service AS2 pour l'opérateur $RED
  - ASSO2 pou $RED
  - Autoriser "doda" et "demo"
- dans Menu >>> Données de sécurité >>> Gérer mes rôles d'admin, ajouter AS2 $RED
  - Ne pas oublier de "Valider" avant de sortir de la page
- dans Menu >>> Administration Technique >>> Service et Organisation
  - déclarer org. doda
- dans Menu >>> Données de sécurité >>> Certifier mon terminal

Création de domi et terminal certifié

Daniel : setting de Domi comme "manager"

