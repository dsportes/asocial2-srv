# Développement Firestore

Il y a une dualité entre Firebase et GCP (Google Cloud Platform):
- `firestore, storage, functions` sont _effectivement_ hébergés sur GCP.
- la console Firebase propose une vue et des fonctions plus simples d'accès mais moins complètes.
- il faut donc parfois retourner à la console GCP pour certaines opérations.

Consoles:

        https://console.cloud.google.com/
        https://console.firebase.google.com/

## Lancer les commandes firebase depuis `./emulators`
Quelques fichiers de configuration y sont installés:

`.firebaserc`
- évite de spécifier le code projet sur chaque commande.

        {
            "projects": {
                "default": "asocial-test1"
            }
        }

`firebase.json`
- indique à emulator où se trouvent ses fichiers et fixe le port de l'émulator de Firestore à sa valeur qui n'est PAS celle par défaut.

        {
        "firestore": {
            "rules": "firestore.rules",
            "indexes": "firestore.indexes.json"
        },
        "emulators": {
            "singleProjectMode": true,
            "firestore": {
            "port": "8085"
            },
            "ui": {
            "enabled": true,
            "port": 4000
            }
        },
        "storage": {
            "rules": "storage.rules"
        }
        }

`firestore-debug.log`
- un log.

Les trois fichiers de configurations importants sont:
- `firestore.indexes.json`
- `firestore.rules`
- `storages.rules`

## CLI Firebase
https://firebase.google.com/docs/cli

Installation ou mise à jour de l'installation

        npm install -g firebase-tools

### Authentification

        firebase login

**MAIS ça ne suffit pas toujours,** il faut parfois se ré-authentifier:

        firebase login --reauth

### Delete ALL collections
Aide: `firebase firestore:delete -`

        firebase firestore:delete --all-collections -r -f

**ATTENTION**: ça purge la base de production sans trop demander de confirmation.

### Déploiement des index et rules
Les fichiers sont:
- `emulators/firestore.indexes.json`
- `emulators/firestore.rules`

        # Déploiement (import)
        firebase deploy --only firestore:indexes

        Export des index dans firestore.indexes.json
        firebase firestore:indexes > firestore.indexes.EXP.json

Pour `emulators/storage.rules`, intervenir directement dans la console firebase (pas trouvé comment le déployer).

### Emulator
Dans `src/config.mjs` remplir la section `env:`

        env: {
        // On utilise env pour EMULATOR
        STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199', // 'http://' est REQUIS
        FIRESTORE_EMULATOR_HOST: 'localhost:8085'
        },

Le port par défaut de `FIRESTORE_EMULATOR_HOST` étant `8080` il se télescope avec celui par défaut du serveur (en particulier pour déploiement GAE): lui affecter `8085`.

Remarques:
- Pour storage: 
  - le nom de variable a changé au cours du temps. C'est bien STORAGE_...
  - il faut `http://` devant le host sinon il tente https.
- Le port par défaut de `FIRESTORE_EMULATOR_HOST` étant `8080` il se télescope avec celui par défaut du serveur (en particulier pour déploiement GAE): lui affecter `8085`.
- En cas de message `cannot determine the project_id ...`
  `export GOOGLE_CLOUD_PROJECT="asocial-test1"`

**Commandes usuelles:**

        # depuis ./emulators

        # Lancement avec mémoire vide:
        firebase emulators:start --project asocial-test1

        # Lancement avec chargée depuis un import:
        firebase emulators:start --import=./bk/t1

        # Le terminal reste ouvert. Arrêt par CTRL-C (la mémoire est perdue)

En cours d'exécution, on peut faire un export depuis un autre terminal:

        firebase emulators:export ./bk/t2 -f

**Consoles Web sur les données:**

        http://127.0.0.1:4000/firestore
        http://127.0.0.1:4000/storage
