#!/bin/bash
# Run this once to reset the DB to the new schema and regenerate the Prisma client.
set -e
echo "Deleting old database..."
rm -f prisma/dev.db prisma/dev.db-shm prisma/dev.db-wal
echo "Applying migration..."
./node_modules/.bin/prisma migrate deploy
echo "Regenerating Prisma client..."
./node_modules/.bin/prisma generate
echo "Done."
