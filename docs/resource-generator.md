# Resource Generator Script

**Path:** `scripts/resource-generator/index.ts`

Этот скрипт автоматически генерирует NestJS Entity, DTO, Interface и Enum классы на основе вашей схемы Prisma (`prisma/schema.prisma`). Скрипт специально оптимизирован под актуальный стек проекта (Zod v4) и имеет модульную структуру.

## Project Structure

Скрипт разделен на независимые модули для удобства поддержки:

- `index.ts`: Главный оркестратор, управляет процессом генерации.
- `backend.ts`: Логика генерации бэкенд-ресурсов (Entity, Zod DTO, Relations).
- `frontend.ts`: Логика генерации фронтенд-ресурсов (Interfaces, Constants, Stripping).
- `types.ts`: Общие интерфейсы данных (`Field`, `Model`).
- `utils.ts`: Общие утилиты (парсинг Prisma, работа с файловой системой).

## Key Features

1.  **Single Source of Truth**: Определите схему один раз в `prisma/schema.prisma` и синхронизируйте все слои приложения.
2.  **Dual Generation**: Генерирует ресурсы как для Backend (NestJS + Zod), так и для Frontend (чистый TypeScript).
3.  **Modern Zod v4 Patterns**:
    - Использует `z.uuid()` для всех UUID полей.
    - Использует `z.enum()` для перечислений.
    - Использует `z.iso.datetime()` для валидации дат в формате ISO.
4.  **Frontend Purity (Stripping & Transformation)**:
    - **Clean DTOs**: Автоматически очищает код от всех декораторов и зависимостей Backend-валидации (`zod`, `nestjs-zod`).
    - **Intelligent Type Conversions**:
      - **Decimal to Number**: Преобразует Prisma `Decimal` в `number`.
      - **Date to String**: Преобразует `DateTime` в `string`.
      - **Json to Record**: Преобразует `Json` (или `z.any()`) в `Record<string, unknown>` для безопасной типизации.
    - **Relations Support**: Автоматически генерирует интерфейсы связей с правильными импортами (включая циклические ссылки).
    - **Partial Updates**: Корректно определяет `UpdateDto` как `Partial<CreateDto>`, распознавая паттерны наследования `createZodDto(Schema.partial())`.
    - **Import Normalization**: Перенаправляет импорты Enum на централизованный файл констант фронтенда.
5.  **Smart Directory Management**:
    - Группирует DTO связанных моделей (например, `DocumentPurchase` и `DocumentPurchaseItem`) в одну директорию, предотвращая дублирование папок.
    - Избегает создания лишних вложенных структур по типу `foo/foo-item`.
6.  **Custom Overrides**: Если в `src/<module>/dto/` существует кастомный DTO, скрипт копирует и очищает его для фронтенда, пропуская стандартную генерацию бэкенд-файла.
7.  **Centralized Enums**: Генерирует `src/generated/types/frontend/constants.ts` со всеми перечислениями в виде `const` объектов и типов.

## Output Structure

Скрипт создает файлы в `src/generated/types/`:

- `backend/entities/`: Бэкенд-сущности с декораторами Swagger.
- `backend/dto/`: Бэкенд-DTO на базе **Zod**.
- `backend/relations/`: Централизованные Enum-ы связей для бэкенда.
- `frontend/`: Ресурсы для клиентской части:
  - `constants.ts`: Централизованные Enum-ы.
  - `entities/`: Интерфейсы моделей с типизированными связями.
  - `dtos/`: Чистые DTO-интерфейсы и частичные типы обновлений.

## Usage

```bash
# Генерация всех ресурсов (запускается автоматически после prisma generate)
npm run postprisma:generate

# Запуск вручную с принудительной генерацией DTO (игнорируя кастомные файлы)
npx tsx scripts/resource-generator/index.ts --force
```

**Примечание:** По умолчанию, если скрипт находит кастомный DTO в `src/<module>/dto/`, он не перезаписывает сгенерированный бэкенд-DTO. Флаг `--force` заставляет скрипт игнорировать наличие кастомных файлов.

## Тестирование

Логика генератора разделена на бэкенд и фронтенд тесты в Vitest.

```bash
# Запуск всех тестов генератора
npx vitest run scripts/resource-generator/

# Запуск тестов бэкенда
npx vitest run scripts/resource-generator/backend.spec.ts

# Запуск тестов фронтенда
npx vitest run scripts/resource-generator/frontend.spec.ts
```

Тесты проверяют:

- Парсинг схемы Prisma.
- Корректность генерации Zod v4 схем.
- Корректность очистки (stripping) кода для фронтенда.
- Маппинг типов и работу кастомных переопределений.

## Frontend Developer Guide

Эта секция описывает, как скрипт трансформирует код для использования на фронтенде. Понимание этих правил поможет избежать ошибок типизации.

### 1. Маппинг Типов (Backend -> Frontend)

Скрипт автоматически конвертирует типы Prisma и Zod в нативные типы TypeScript для фронтенда:

| Backend / Prisma / Zod                  | Frontend TypeScript       | Примечание                                                           |
| :-------------------------------------- | :------------------------ | :------------------------------------------------------------------- |
| `String`, `UUID`, `z.string()`          | `string`                  | Включая ID и строковые значения.                                     |
| `DateTime`, `z.iso.datetime()`          | `string`                  | Даты передаются как ISO-строки.                                      |
| `Int`, `Float`, `Decimal`, `z.number()` | `number`                  | Все числовые типы, включая Decimal, становятся `number`.             |
| `Boolean`, `z.boolean()`                | `boolean`                 | -                                                                    |
| `Json`, `z.any()`, `z.unknown()`        | `Record<string, unknown>` | **Важно:** `any` заменяется на строгий тип объекта для безопасности. |
| `Enum`                                  | `EnumName`                | Импортируется из `frontend/constants.ts`.                            |
| `Optional`, `Default`                   | `?` (optional)            | Поле помечается как необязательное.                                  |

### 2. Трансформация DTO

Скрипт не просто копирует файлы, он "компилирует" Zod-схемы в интерфейсы:

- **Create DTO**:
  - _Было:_ `class CreateUserDto extends createZodDto(CreateUserSchema) {}`
  - _Стало:_ `interface CreateUserDto { email: string; age?: number; }`
  - Zod-валидация полностью вырезается, остаются только типы.

- **Update DTO**:
  - _Было:_ `class UpdateUserDto extends createZodDto(CreateUserSchema.partial()) {}`
  - _Стало:_ `type UpdateUserDto = Partial<CreateUserDto>;`
  - Это обеспечивает идеальную синхронизацию типов обновления с типами создания.

### 3. Структура Папок и "Items"

Для чистоты структуры, DTO дочерних элементов (например, `DocumentItem`) группируются в папку родительской сущности.

- Если у вас есть модуль `document-purchase` и `document-purchase-item`.
- Все DTO для обоих будут лежать в `src/generated/types/frontend/dtos/document-purchase/`.
- Это упрощает импорты: `import { ... } from 'src/generated/types/frontend/dtos/document-purchase/create-document-purchase-item.interface'`.

### 4. Связи (Relations)

Интерфейсы сущностей (`entities/`) генерируются с полными связями.

- Если сущность ссылается сама на себя (например, `Category.parent`), импорт не дублируется.
- Циклические зависимости разрешаются стандартным механизмом импортов TypeScript.
