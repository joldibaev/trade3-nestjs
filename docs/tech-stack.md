# 🛠 Tech Stack & Architecture Standards

> **Strict compliance required.** This document defines the non-negotiable architectural and technological standards for `trade3-nestjs`.

---

## 1. Core Architecture: Vertical Slices

We adhere strictly to the **Vertical Slice Architecture**. This means code is organized by **Feature**, not by **Layer**.

### ✅ The Rule

A folder in `src/` should represent a **Business Capability** (e.g., `product`, `order`, `auth`), NOT a technical layer.

**Structure Example:**

```text
src/
  ├── product/              # <--- Feature Module
  │   ├── dto/              # DTOs specific to Product
  │   ├── product.controller.ts
  │   ├── product.service.ts
  │   └── product.module.ts
  ├── common/               # <--- Only truly shared code
  └── main.ts
```

- **Encapsulation**: Features should be self-contained. Export only what is needed (usually just the Module).
- **Proximity**: "Things that change together, stay together."

---

## 2. Server Framework

| Component     | Choice              | Rationale                                                                    |
| :------------ | :------------------ | :--------------------------------------------------------------------------- |
| **Framework** | **NestJS v11**      | Robust Dependency Injection and modularity.                                  |
| **Adapter**   | **Fastify**         | Significantly higher throughput (req/sec) than Express (Rule 1).             |
| **Language**  | **TypeScript 5.7+** | Full strict mode enabled (`strict: true`, `noImplicitAny: true`) (Rule 7.1). |

**Key Constraints**:

- **Strict Typing**: `strictPropertyInitialization` is disabled only for generated files; all manual code must be strictly typed.
- **Fastify Only**: Do not use Express-specific middleware. Use Fastify plugins or NestJS abstracted interfaces.

---

## 3. Database Layer

| Component     | Choice             | Rationale                                       |
| :------------ | :----------------- | :---------------------------------------------- |
| **Database**  | **PostgreSQL 16+** | Reliable, supports JSONB and heavy concurrency. |
| **ORM**       | **Prisma v7+**     | Type-safe queries that match the schema.        |
| **Migration** | `prisma migrate`   | Declarative schema management.                  |

### Best Practices

- **No Raw SQL** unless absolutely necessary for performance.
- **Repository Pattern**: NOT enforced globally. Services can call Prisma directly if the logic is simple. For complex queries, create specialized repository classes within the Feature Slice.

---

## 4. Validation (The "Zero-Class-Validator" Policy)

🚫 **BANNED**: `class-validator`, `class-transformer`.
✅ **REQUIRED**: **Zod** (`nestjs-zod`).

We use **Zod** for all validation to ensure runtime safety matches compile-time types.

- **DTOs**: Must be defined using `createZodDto`.
- **Global Pipe**: `ZodValidationPipe` is enabled globally in `main.ts`.
- **Swagger**: `cleanupOpenApiDoc()` is used to automatically generate OpenAPI schemas from Zod definitions.

```typescript
// Example DTO
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const CreateProductSchema = z.object({
  name: z.string().min(3),
  price: z.number().positive(),
  tags: z.array(z.string()).optional(),
});

export class CreateProductDto extends createZodDto(CreateProductSchema) {}
```

---

## 5. Testing Strategy

We use **Vitest** for a faster, modern testing experience.

- **Unit Tests**: Co-located with files (`*.spec.ts`).
- **E2E Tests**: Located in `test/e2e/`. Use `supertest` against the compiled NestJS instance.
- **Mocks**: Use `vi.fn()` and `vi.mock()`.

---

## 6. Development Ecosystem

- **Linter**: ESLint (Flat Config)
- **Formatter**: Prettier
- **Git Hooks**: Husky (Pre-commit linting)
- **Package Manager**: npm

---

_Adhere to these standards to maintain system integrity and performance._
