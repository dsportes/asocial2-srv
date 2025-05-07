A propos des gcloud functionss

https://johnwargo.com/posts/2024/google-cloud-support-notice/

https://cloud.google.com/functions/docs/deploy

https://blog.stackademic.com/building-a-rest-api-with-cloud-functions-on-google-cloud-platform-using-javascript-ffc570469f75

URL GCF: https://europe-west1-asocial-test1.cloudfunctions.net/asocialGCF


## Pour passer en gcloud function:
- `src/index.ts`
  - décommenter : `import { HttpFunction } from '@google-cloud/functions-framework'`
  - `const gcloudfunction = true`
  - A la fin décommenter: `export const asocialGCF: HttpFunction = app`
  - Dans `config` : `GCLOUDLOGGING: true,`
- `package.json`:

      "main": "src/index.js",
      "sourceX": "src/index.ts",
      "mainX": "dist/bundle.cjs",
      "targetsX": { "main": { "includeNodeModules": false }},

    yarn add @google-cloud/functions-framework

Test local avant de déployer: `npm run testcf`

Déploiement: `npm run deploycf`

Les logs sont visible dans la console Google >>> Cloud Run functions >>> asocialgcf >>> onglet 'Logs'

## Pour passer en serveur:
- `src/index.ts`
  - Commenter : `// import { HttpFunction } from '@google-cloud/functions-framework'`
  - `const gcloudfunction = false`
  - A la fin commenter: `// export const asocialGCF: HttpFunction = app`
  - Dans `config` : `GCLOUDLOGGING: false,`
- `package.json`:

      "mainX": "src/index.js",
      "source": "src/index.ts",
      "main": "dist/bundle.cjs",
      "targets": { "main": { "includeNodeModules": false }},

    yarn remove @google-cloud/functions-framework // mais ça ne gêne pas

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
A tester depuis `./tmp/srv`
