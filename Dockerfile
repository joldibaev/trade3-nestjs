# --- STEP 1: Builder ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- STEP 2: Production ---
FROM node:20-alpine
# Устанавливаем переменную окружения для оптимизации библиотек (например, NestJS/Express)
ENV NODE_ENV=production

WORKDIR /app

# Копируем конфиги и ставим только зависимости для работы
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Копируем билд
COPY --from=builder /app/dist ./dist

# Открываем порт
EXPOSE 3000

# Переключаемся на безопасного пользователя
USER node

# Запускаем напрямую через node
CMD ["node", "dist/src/main"]
