-- Update the ram column in Node table to BIGINT
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Node" (
	"id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	"name" TEXT NOT NULL,
	"ram" BIGINT NOT NULL DEFAULT 0,
	"cpu" INTEGER NOT NULL DEFAULT 0,
	"disk" INTEGER NOT NULL DEFAULT 0,
	"address" TEXT NOT NULL DEFAULT '127.0.0.1',
	"port" INTEGER NOT NULL DEFAULT 3001,
	"key" TEXT NOT NULL,
	"locationId" INTEGER,
	"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Node" ("id", "name", "ram", "cpu", "disk", "address", "port", "key", "locationId", "createdAt")
SELECT "id", "name", "ram", "cpu", "disk", "address", "port", "key", "locationId", "createdAt"
FROM "Node";

DROP TABLE "Node";
ALTER TABLE "new_Node" RENAME TO "Node";

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;