# Tech Stack (Технологический стек)

Этот документ описывает актуальный технологический стек и инструменты, используемые в проекте `trade3-nestjs`.

## Core Framework
- **Framework:** [NestJS v11](https://nestjs.com/)
- **Platform:** Fastify (`@nestjs/platform-fastify`) — выбран за высокую производительность по сравнению с Express.
- **Language:** TypeScript 5.7+

## Database & ORM
- **Database:** PostgreSQL 16+
- **ORM:** [Prisma v7+](https://www.prisma.io/)
- **Migration Management:** Prisma Migrate (`prisma migrate dev`)

## Validation & DTOs
- **Validation Library:** [Zod v4+](https://zod.dev/v4) via `nestjs-zod`.
- **Strategy:** `ZodValidationPipe` используется глобально.
- **DTOs:** Все DTO генерируются из Zod схем с помощью `createZodDto`. Используется новый синтаксис Zod v4 (напр. `z.uuid()` вместо `z.string().uuid()`). Мы полностью отказались от `class-validator` и `class-transformer` в пользу Zod для строгой типизации и производительности.

## Testing
- **Test Runner:** [Vitest](https://vitest.dev/) — используется вместо Jest для всех видов тестов (Unit, E2E).
- **Environment:** `vitest-setup.ts` настраивает глобальное окружение для E2E тестов.
- **Tools:**
  - `supertest`: Для HTTP-запросов к API.
  - `cross-env`: Для кросс-платформенной установки переменных окружения (`NODE_ENV=test`).

## Logging & Monitoring
- **Logging:** Встроенный `Logger` NestJS (планируется миграция на Pino).
- **Errors:** Глобальный `HttpExceptionFilter` для стандартизации ошибок.

## Other Key Libraries
- **Scheduler:** `@nestjs/schedule` (Cron jobs).
- **Auth:** `@nestjs/passport`, `passport-jwt` (JWT Strategy).
- **Cookies:** `@fastify/cookie` (для безопасной работы с куками в Fastify).

## Development Tools
- **Linter:** ESLint (Flat Config).
- **Formatter:** Prettier + `prettier-plugin-prisma`.
- **Runtime:** Node.js 22+ (LTS).
