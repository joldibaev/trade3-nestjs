# Resource Generator Script

**Path:** `scripts/resource-generator/index.ts`

Этот скрипт автоматически генерирует NestJS Entity, DTO, Interface и Enum классы на основе вашей схемы Prisma (`prisma/schema.prisma`). Скрипт специально оптимизирован под актуальный стек проекта (Zod v4).

## Key Features

1.  **Single Source of Truth**: Определите схему один раз в `prisma/schema.prisma` и синхронизируйте все слои приложения.
2.  **Dual Generation**: Генерирует ресурсы как для Backend (NestJS + Zod), так и для Frontend (чистый TypeScript).
3.  **Modern Zod v4 Patterns**:
    - Использует `z.uuid()` вместо `z.string().uuid()`.
    - Использует `z.enum()` вместо `z.nativeEnum()`.
    - Использует `z.iso.datetime()` для валидации дат в формате ISO.
4.  **Frontend Purity (Stripping)**:
    - **Clean DTOs**: Автоматически очищает код от всех декораторов (Swagger, `class-validator`) и зависимостей Backend-валидации (`nestjs-zod`, `zod`).
    - **Type Conversions**:
      - **Decimal to Number**: Преобразует Prisma `Decimal` в стандартный `number`.
      - **Date to String**: Преобразует `DateTime`/`Date` в `string` для удобства работы на фронтенде.
    - **Import Normalization**: Перенаправляет все импорты Enum на централизованный файл констант фронтенда.
5.  **Custom Overrides**: Если в `src/<module>/dto/` существует кастомный DTO, скрипт пропускает генерацию бэкенд-файла и просто копирует/очищает ваш кастомный DTO для фронтенда.
6.  **Centralized Enums**: Генерирует `src/generated/frontend/constants.ts` со всеми перечислениями в виде `const` объектов и типов.

## Output Structure

Скрипт создает файлы в `src/generated/`:

- `entities/`: Бэкенд-сущности с декораторами Swagger.
- `dto/`: Бэкенд-DTO на базе **Zod** (с использованием `nestjs-zod`).
- `relations/`: Централизованные Enum-ы связей для бэкенда.
- `frontend/`: Ресурсы для клиентской части:
  - `constants.ts`: Централизованные Enum-ы (value-objects и типы).
  - `entities/`: Интерфейсы моделей.
  - `dtos/`: Подпапки для модулей с чистыми DTO-интерфейсами.

## Usage

```bash
# Генерация всех ресурсов (запускается автоматически после prisma generate)
npm run postprisma:generate

# Запуск вручную с принудительной генерацией DTO (игнорируя кастомные файлы)
npx tsx scripts/resource-generator/index.ts --force
```

**Примечание:** По умолчанию, если скрипт находит кастомный DTO в `src/<module>/dto/`, он не перезаписывает сгенерированный бэкенд-DTO, чтобы избежать конфликтов. Флаг `--force` заставляет скрипт игнорировать наличие кастомных файлов и генерировать стандартные DTO заново.

## Тестирование

Логика генератора полностью покрыта юнит-тестами в Vitest.

```bash
# Запуск всех тестов генератора
npx vitest run scripts/resource-generator/

# Запуск конкретного файла
npx vitest run scripts/resource-generator/index.spec.ts
```

Тесты проверяют:
- Парсинг схемы Prisma.
- Маппинг типов (включая Zod v4 паттерны).
- Генерацию Entity, Interface и DTO.
- Корректность очистки (stripping) для фронтенда.
- Корректность импортов и путей.
