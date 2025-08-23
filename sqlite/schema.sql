CREATE TABLE IF NOT EXISTS "Hdr" (
  "id" TEXT,
  "v" INTEGER,
  "data"	BLOB,
  PRIMARY KEY("id")
);

CREATE TABLE IF NOT EXISTS "Org" (
  "org" TEXT,
  "k0" TEXT,
  "v" INTEGER,
  "z" INTEGER,
  "data"	BLOB,
  PRIMARY KEY("k0")
);

CREATE TABLE IF NOT EXISTS "Task" (
  "org" TEXT,
  "k0" TEXT,
  "i0" INTEGER,
  "data"	BLOB,
  PRIMARY KEY("org", "k0")
);
CREATE INDEX IF NOT EXISTS "Task_i0" ON "Task" ( "i0" );
