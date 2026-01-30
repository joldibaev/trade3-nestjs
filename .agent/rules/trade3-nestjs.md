---
trigger: always_on
---

# **System Instruction: Trade3 NestJS High-Performance Stack (2026)**

This document defines the architecture, coding standards, and tech stack for the `trade3-nestjs` project. All generated code must strictly adhere to these rules.

---

## **1. Core Tech Stack**
- **Framework**: NestJS 11+ with **Fastify** (`@nestjs/platform-fastify`).
- **Database**: Prisma 7+ (PostgreSQL).
- **Validation**: **Zod** via `nestjs-zod`.
- **Testing**: **Vitest** (replaces Jest).
- **Documentation**: Swagger/OpenAPI with `nestjs-zod/patch`.
- **Execution**: `tsx` for scripts and development.

---

## **2. Architecture: Vertical Slices**
- **Feature-Based Modules**: Group all related files by feature, not by type. 
  - *Correct:* `src/modules/orders/{order.controller.ts, order.service.ts, order.dto.ts, order.module.ts}`
  - *Incorrect:* `src/controllers/order.controller.ts`, `src/services/order.service.ts`.
- **Encapsulation**: Export only what is necessary from a module. Use a local `index.ts` for clean exports.
- **Dependency Injection**: Always use constructor injection with `private readonly`.

---

## **3. Data Validation & DTOs (Zod-First)**
- **No Class-Validator**: Strictly forbid the use of `class-validator` and `class-transformer`.
- **Zod DTOs**: Use `createZodDto` from `nestjs-zod`.
- **Prisma Sync**: Reference Prisma-generated types or use `zod-prisma-types` to ensure the DTOs match the database schema.
- **Example Pattern**:
```typescript
const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export class CreateUserDto extends createZodDto(CreateUserSchema) {}
```

---

## **4. Database Layer (Prisma 7)**
- **Strict Typing**: Use the generated Prisma Client. Avoid `any` at all costs.
- **JSON Validation**: For `Json` fields in Prisma, always define a Zod schema to parse and validate the data upon retrieval.
- **Repositories**: Wrap complex Prisma queries into dedicated services or repository classes.

---

## **5. Testing (Vitest)**
- **Runner**: Use Vitest for unit, integration, and E2E tests.
- **Syntax**: Compatible with Jest (`describe`, `it`, `expect`), but imported from `vitest`.
- **Mocks**: Use `vi.fn()` and `vi.mock()` instead of `jest.*`.
- **E2E**: Use `supertest` in conjunction with the Vitest runner.

---

## **6. API & Security**
- **Fastify Adapter**: Use `NestFastifyApplication` in `main.ts`.
- **Swagger Patching**: Use `cleanupOpenApiDoc()` to ensure Zod DTOs are correctly rendered in the Swagger UI.
- **Guards**: Apply `JwtAuthGuard` globally or per-controller. Use a custom `@Public()` decorator for unauthorized access.
- **Serialization**: Use Zod's `.omit()` or `.pick()` to filter out sensitive data from API responses.

---

## **7. Code Quality & DX**
- **Strict TypeScript**: `strict: true` in `tsconfig.json`.
- **Modern Features**: Use ES2024+ features (Optional chaining, Nullish coalescing, Top-level await).
- **Naming Conventions**: 
  - Files: `kebab-case.ts`
  - Classes: `PascalCase`
  - Methods/Variables: `camelCase`
- **Error Handling**: Use Global Exception Filters for consistent JSON error responses.

---

## **8. Observability**
- **Metrics**: Export metrics using `nestjs-prometheus`.
- **Logging**: Use structured JSON logging (Pino) to ensure compatibility with Fastify and cloud logging systems.

---

**AI Action Trigger**: When asked to generate a new resource, use the Vertical Slice pattern, create Zod-based DTOs, and ensure the service uses Prisma for data access.
