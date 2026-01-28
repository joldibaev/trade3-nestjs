# 🚀 Trade3: High-Performance WMS Backend

> **Next-Generation Warehouse Management System API**
> Built for performance, scalability, and type safety.

![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-000000?style=for-the-badge&logo=fastify&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=for-the-badge&logo=zod&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)

## 📖 Overview

**Trade3** is a monolithic backend service designed to handle complex inventory operations with strict data integrity and high throughput. It leverages **NestJS** with the **Fastify** adapter for maximum performance and **PostgreSQL** with **Prisma** for robust data management.

This system is built with a **Vertical Slice Architecture**, ensuring that features are encapsulated, maintainable, and loosely coupled.

---

## 🏗 System Architecture

The project strictly follows the **Vertical Slice** pattern. Instead of grouping files by technical type (controllers, services), we group them by **Business Feature**.

### Core Modules

- **`src/core/`**: Infrastructure and shared services (Auth, Inventory, Config).
- **`src/<feature>/`**: Self-contained feature modules (e.g., `src/document-purchase`, `src/product`).
- **`src/common/`**: Truly global utilities and decorators.

---

## 📚 Documentation Hub

### 🔧 Engineering Standards

| Document                                               | Description                                                                     |
| :----------------------------------------------------- | :------------------------------------------------------------------------------ |
| [**Tech Stack & Rules**](docs/tech-stack.md)           | Defines the "Rules of Engagement": Zod-only, Vertical Slices, Testing strategy. |
| [**System Entities**](docs/entities.md)                | Database schema deep-dive, relations, and typical usage patterns.               |
| [**Visual Architecture**](docs/visual-architecture.md) | 🎨 Diagrams of algorithms, flows, and vertical slices.                          |
| [**Detailed Methods**](docs/services/)                 | 🛠 Deep-dive text breakdown of all methods per service.                         |
| [**Resource Generator**](docs/resource-generator.md)   | Guide to the custom `prisma-to-zod-to-ts` code generation pipeline.             |
| [**Concurrency Control**](docs/concurrency.md)         | How we handle race conditions using Advisory Locks and ACID transactions.       |

### 🔐 Security & Access

| Document                                         | Description                                                  |
| :----------------------------------------------- | :----------------------------------------------------------- |
| [**Authentication Flow**](docs/auth.md)          | JWT Dual-Token strategy (Access/Refresh), Guards, and Roles. |
| [**Document History**](docs/document-history.md) | Immutable audit logs for all WMS operations.                 |

### 📦 Business Domains (Services)

Detailed breakdown of business logic for each document type:

- 📥 [**Purchase (Закупки)**](docs/services/document-purchase.md) - WAP calculation, Stock increments.
- 📤 [**Sale (Продажи)**](docs/services/document-sale.md) - FIFO/LIFO logic, Profit calculation.
- ↩️ [**Return (Возвраты)**](docs/services/document-return.md) - Client returns handling.
- ⚖️ [**Adjustment (Инвентаризация)**](docs/services/document-adjustment.md) - Stock corrections.
- 🚚 [**Transfer (Перемещения)**](docs/services/document-transfer.md) - Inter-warehouse movements.

---

## ⚡ Quick Start

```bash
# 1. Install Dependencies
npm install

# 2. Database Setup
# Ensure PostgreSQL is running and .env is configured
npm run prisma:generate
npm run prisma:migrate

# 3. Seed Data (Optional)
npm run seed

# 4. Start Development Server
npm run start:dev
```

## 🧪 Testing

We use **Vitest** for a unified testing experience.

```bash
npm run test:e2e    # Run end-to-end integration tests
npm run test        # Run unit tests
```

---

_Trade3 Engineering Team — 2026_
