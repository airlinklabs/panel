#!/bin/bash
# Run this once to reset the DB to the new schema and regenerate the Prisma client.
set -e
echo "Deleting old database..."
rm -f prisma/dev.db prisma/dev.db-shm prisma/dev.db-wal
echo "Applying migration..."
npx prisma migrate deploy
echo "Regenerating Prisma client..."
npx prisma generate
echo "Done."
