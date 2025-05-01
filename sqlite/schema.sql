CREATE TABLE IF NOT EXISTS "singletons" (
  "id" TEXT,
  "v" INTEGER,
  "_data_"	BLOB,
  PRIMARY KEY("id")
);

CREATE TABLE IF NOT EXISTS "taches" (
  "op" INTEGER,
  "org" TEXT,
  "id" TEXT,
  "dh" INTEGER,
  "exc"	TEXT,
  "dhf" INTEGER,
  "nb" INTEGER,
  PRIMARY KEY("op", "org", "id")
);
CREATE INDEX IF NOT EXISTS "taches_dh" ON "taches" ( "dh" );
