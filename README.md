# Test OK avec GCF déployée sur asocial2

Le folder `depl/gcf` contient les fichiers ajustés pour ce déploiement:
- `.gclodignore`
- `package.json` réduit
- `index.ts` : configuration de l'application adaptée

Pour déployer:
- créer le répertoire de déploiement `./tmp/gcf`
- `./dplgsf.sh`
  - copie les fichiers nécessaires
  - créé le fichier `src/keys.js`
  - effectue un `npm install` (doute sur le fonctionnement de `yarn`)
  - compilation tsc
  - suppression des .js

Dans le répertoire de déploiement:
- `npm run testgcf` : test local
- `npm run deplgcf` : déploiement sur Google Cloud Run (c'est long)

Les logs sont visible dans la console Google >>> Cloud Run functions >>> asocialgcf >>> onglet 'Logs'.

URL GCF : https://europe-west1-asocial2.cloudfunctions.net/asocialgcf

# A propos des gcloud functionss

https://johnwargo.com/posts/2024/google-cloud-support-notice/

https://cloud.google.com/functions/docs/deploy

https://blog.stackademic.com/building-a-rest-api-with-cloud-functions-on-google-cloud-platform-using-javascript-ffc570469f75

## Pour passer en gcloud function:
- `src/index.ts`
  - décommenter : `import { HttpFunction } from '@google-cloud/functions-framework'`
  - `const gcp = true`
  - commenter les imports des _providers_ non utilisés
- `package.json`:
  - enlever les modules inemployés. (les devDependencies ne semblent pas utiles mais n'ont pas gêner).
  - pas sur que le "main" soit utile.
 - yarn add @google-cloud/functions-framework : ne serait pas utile en GAE.

## Pour passer en serveur:
- `src/index.ts`
  - Commenter : `// import { HttpFunction } from '@google-cloud/functions-framework'`
  - const gcp = false`

- `package.json`:

      "source": "src/index.ts",
      "main": "dist/bundle.cjs",
      "targets": { "main": { "includeNodeModules": false }},

`yarn remove @google-cloud/functions-framework` // mais ça ne gêne pas

Test local: `npm run testsrv`

### Préparation au déploiement et test:
- Créer un folder temporaire: `../tmp/srv`
  - ./filestorea (vide)
  - ./sqlite
      ./testa.db3
  - ./package.json

    {
      "name": "srv",
      "dependencies": {
        "@google-cloud/functions-framework": "^4.0.0",
        "@google-cloud/logging-winston": "^6.0.0",
        "@msgpack/msgpack": "^3.1.1",
        "better-sqlite3": "^11.9.1",
        "cors": "^2.8.5",
        "express": "^5.1.0",
        "typescript": "^5.8.3",
        "winston": "^3.17.0"
      }
    }

    yarn install
    npm run builddist
    npm run testdist

### Déploiement GAE
A scripter et tester en s'inspirant de `./tmp/gcf` avec un yaml de déploiement.
