#!/bin/sh
set -e

echo "=================================================="
echo "🚀 [FlagOps] Initializing Production Environment"
echo "=================================================="

# Check and apply database migrations
case "$DATABASE_URL" in
  postgres* | postgresql*)
    echo "🐘 [FlagOps] PostgreSQL detected. Synchronizing database schema..."
    if [ -f "prisma/schema.postgresql.prisma" ]; then
      npx prisma db push --schema=prisma/schema.postgresql.prisma --accept-data-loss
    else
      npx prisma db push --accept-data-loss
    fi

    echo "🌱 [FlagOps] Seeding initial projects, environments, and feature flags..."
    npx tsx prisma/seed.ts || echo "⚠️ Seeding skipped or records already exist."
    ;;
  *)
    echo "📁 [FlagOps] SQLite detected. Synchronizing local database schema..."
    npx prisma db push --accept-data-loss
    npx tsx prisma/seed.ts || true
    ;;
esac

echo "⚡ [FlagOps] Starting Next.js Production Engine on port 3000..."
exec "$@"
