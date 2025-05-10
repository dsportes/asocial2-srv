#! /bin/bash

gcf=./depl/gcf
dd=../tmp/gcf

mkdir -p $dd/src $dd/src-fw

cp -f $gcf/package.json $dd
cp -f ./tsconfig.json $dd
cp -f $gcf/.gcloudignore $dd
cp -f ./.yarnrc.yml $dd

cp -f $gcf/index.ts $dd/src
cp -f ./src/appDbSt.ts $dd/src
cp -f ./src/operations.ts $dd/src

cp -f ./src-fw/*.ts $dd/src-fw
cp -f ./src-dbst/*.ts $dd/src-dbst

echo "Copies faites"
npx tsx src-fw/cryptKeys.ts -i $gcf/keys.json -o $dd/src/keys.ts -p "toto est tres tres beau"

cd $dd
npm install
echo "Compilation tsc"
tsc
rm src/*.ts
rm src-fw/*.ts

echo "Prêt pour test local ou déploiement"
