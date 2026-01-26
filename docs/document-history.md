# DocumentHistory (Аудит документов)

`DocumentHistory` — это централизованный механизм логирования всех действий, совершаемых с документами в системе. Он обеспечивает полную прослеживаемость правок, изменений статусов и состава товаров в документах.

## Назначение

Механизм предназначен для:

1.  **Аудита**: Кто, когда и какое действие совершил.
2.  **Отладки**: Понимание того, как менялось состояние документа во времени.
3.  **Истории изменений**: Отображение пользователю ленты событий по конкретному документу.

## Структура данных (Prisma)

Лог хранится в таблице `DocumentHistory` и связан с основными типами документов через опциональные внешние ключи:

```prisma
model DocumentHistory {
  id      String @id @default(uuid(7))
  action  String // Тип действия (CREATED, UPDATED, ITEM_ADDED и т.д.)
  details Json? // Детальная информация в формате JSON

  // Связи с документами
  documentPurchaseId    String?
  documentSaleId        String?
  documentReturnId      String?
  documentAdjustmentId  String?
  documentTransferId    String?
  documentPriceChangeId String?

  date      DateTime @default(now())
  createdAt DateTime @default(now())
}
```

## Типы действий (Action Types)

Система поддерживает следующие типы действий:

- `CREATED`: Первичное создание документа.
- `UPDATED`: Изменение основных полей документа (заметки, даты и т.д.).
- `STATUS_CHANGED`: Переход документа между состояниями (Draft -> Completed).
- `ITEM_ADDED`: Добавление новой позиции (товара) в документ.
- `ITEM_REMOVED`: Удаление позиции из документа.
- `ITEM_CHANGED`: Изменение параметров существующей позиции (количество, цена).
- `DELETED`: Удаление самого документа.

## DocumentHistoryService

Сервис `DocumentHistoryService` предоставляет два основных метода для работы:

### 1. `logAction`

Используется для ручной фиксации простого действия.

```typescript
await this.ledgerService.logAction(tx, {
  documentId: id,
  documentType: 'documentPurchase',
  action: 'STATUS_CHANGED',
  details: { from: 'DRAFT', to: 'COMPLETED' },
});
```

### 2. `logDiff`

Мощный инструмент для автоматического сравнения двух состояний списка товаров. Он вычисляет разницу и сам создает записи `ITEM_ADDED`, `ITEM_REMOVED` или `ITEM_CHANGED`.

```typescript
await this.ledgerService.logDiff(
  tx,
  { documentId: id, documentType: 'documentSale' },
  oldItems, // Старый список товаров
  newItems, // Новый список товаров
  ['quantity', 'price'], // Поля для сравнения
);
```

### Сравнение значений

Сервис умеет корректно сравнивать:

- Простые типы (string, number, boolean).
- Объекты `Decimal` (Prisma), используя метод `.equals()`.
- Объекты с методом `.toString()` (например, даты).

## Интеграция

`DocumentHistory` интегрирован во все основные сервисы:

- `DocumentPurchaseService`
- `DocumentSaleService`
- `DocumentReturnService`
- `DocumentAdjustmentService`
- `DocumentTransferService`
- `DocumentPriceChangeService`

Любое изменение данных в этих сервисах должно сопровождаться вызовом `DocumentHistoryService` внутри той же транзакции базы данных.
