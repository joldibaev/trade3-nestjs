#!/bin/sh
set -e

# Мы не переопределяем DATABASE_URL здесь, так как prisma.config.ts сам его собирает.
# Но нам нужно убедиться, что все составляющие есть.
echo "🔍 Checking environment variables for Prisma..."
if [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ] || [ -z "$DB_NAME" ]; then
  echo "⚠️ Missing some DB environment variables. Prisma might fail."
fi

echo "🚀 Running database migrations..."
# Prisma 7 автоматически подхватит prisma.config.ts, если он в корне
npx prisma migrate deploy

echo "✅ Migrations completed. Starting application..."
exec "$@"
