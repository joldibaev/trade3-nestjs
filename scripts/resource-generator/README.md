# Resource Generator Script

Этот скрипт автоматически генерирует NestJS Entity, DTO, Interface и Enum классы на основе вашей схемы Prisma (`prisma/schema.prisma`).

## Key Features

1.  **Single Source of Truth**: Define your schema once in `prisma/schema.prisma` and sync everything.
2.  **Dual Generation**: Generates resources for both Backend (NestJS) and Frontend (clean TypeScript).
3.  **Frontend Purity**:
    - **Clean DTOs**: Automatically stripped of all decorators (Swagger, `class-validator`, etc.) and external dependencies.
    - **Type Conversions**:
      - **Decimal to Number**: Automatically converts Prisma `Decimal` to standard TypeScript `number`.
      - **Date to String**: Automatically converts `DateTime`/`Date` to `string` for generic frontend use.
    - **Import Normalization**: Cleanly redirects all Enum imports to a centralized frontend constants file.
4.  **Custom Overrides**: If a custom DTO exists in `src/<module>/dto/`, the script skips backend generation and copies/cleans the custom DTO for the frontend.
5.  **Centralized Enums**: Generates `src/generated/frontend/constants.ts` with all enums defined as `const` objects and types.

## Output Structure

The script generates files in `src/generated/`:

- `entities/`: Backend entities with Swagger decorators.
- `dto/`: Backend DTOs with Swagger and validation decorators.
- `relations/`: Centralized relation enums for backend use.
- `frontend/`: Clean resources for client-side use:
  - `constants.ts`: Centralized enums (value-objects and types).
  - `entities/`: Flat directory with model interfaces.
  - `dtos/`: Model-specific subfolders with clean DTO interfaces.

## Usage

```bash
# Generate all resources
npm run postprisma:generate

# Run unit tests for the generator
npm test scripts/resource-generator/index.spec.ts
```

Скрипт создаст/обновит следующие папки в `src/generated/`:

- `entities/` — классы сущностей (`[model].entity.ts`)
- `interfaces/` — интерфейсы моделей (`[model].interface.ts`)
- `dto/[model]/` — DTO для создания и обновления
- `relations/` — Enum-ы для связей

## Тестирование

Логика генератора полностью покрыта юнит-тестами. Для запуска тестов используйте:

```bash
npx jest scripts/resource-generator/index.spec.ts --rootDir .
```

Тесты проверяют:

- Парсинг схемы Prisma.
- Маппинг типов.
- Генерацию Entity, Interface и DTO.
- Корректность импортов и путей.
