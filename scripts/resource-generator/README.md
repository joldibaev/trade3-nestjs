# Resource Generator Script

Этот скрипт автоматически генерирует NestJS Entity, DTO, Interface и Enum классы на основе вашей схемы Prisma (`prisma/schema.prisma`).

## Возможности

1.  **Единый источник истины**: Изменения в `schema.prisma` автоматически отражаются в коде.
2.  **Централизованная генерация**: Все файлы создаются в директории `src/generated/`, что позволяет избежать дублирования кода и упрощает управление зависимостями.
3.  **Swagger Support**: Автоматическое добавление `@ApiProperty` с правильными типами и форматами (UUID, date-time) в Entity и DTO.
4.  **Interfaces**: Генерация чистых TypeScript-интерфейсов без декораторов Swagger для использования во внутренней логике и типизации.
5.  **Валидация**: Добавление декораторов `class-validator` в DTO.
6.  **Relation Enums**: Генерация перечислений для связей (напр. `ProductRelations`), которые удобно использовать для `include` в Prisma.

## Как использовать

Запустите команду:

```bash
npm run generate:resource
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
