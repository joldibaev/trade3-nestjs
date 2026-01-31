# --- STEP 1: Builder ---
FROM node:24-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

# 1. Зависимости
COPY package*.json ./
RUN npm ci

# 2. Конфиги и схема
COPY scripts ./scripts/
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# 3. Генерация (Client + DTO)
RUN npx prisma generate
# Генерируем DTO до билда, так как они нужны для компиляции
COPY . .
RUN npx tsx scripts/resource-generator/index.ts

# 4. Сборка проекта
RUN npm run build

# Проверка, что попало в dist (для отладки)
RUN ls -R dist/src/generated || echo "Generated files not in dist"

# 5. Очистка
RUN npm prune --omit=dev && npm cache clean --force

# --- STEP 2: Production ---
FROM node:24-alpine
RUN apk add --no-cache openssl curl
ENV NODE_ENV=production
WORKDIR /app

# Копируем артефакты
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
# Важно: если nest build не скопировал внутренние файлы Prisma, копируем их явно
COPY --from=builder /app/src/generated ./src/generated
COPY docker-entrypoint.sh ./

# Настройка прав
USER root
RUN chmod +x docker-entrypoint.sh
USER node

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/src/main"]
