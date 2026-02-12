# Safe
Testé OK.

- Gérer la mise à jour du volume des sessions par l'application.
- Gérer dans l'application l'arrivée d'une mise à jour de credential.
- Dans safe-app, pour une session (épinglée donc) qui signifie "hasCache" ?
  existe-t-il des sessions épinglées sans "cache" ? 

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
