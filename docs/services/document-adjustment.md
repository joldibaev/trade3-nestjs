# DocumentAdjustmentService (Корректировки/Инвентаризация)

Сервис для ручного изменения остатков товаров.

## Методы

### `create(dto: CreateDocumentAdjustmentDto)`

Позволяет создать корректировку (только заголовок).

- **Items**: Теперь добавляются отдельно через `addItems`.
- **Status**: По умолчанию `DRAFT`. Остатки не меняются до проведения.
- **Code**: Генерируется автоматически с префиксом `A-` (например, `A-1`).

### `update(id: string, dto: CreateDocumentAdjustmentDto)`

Обновление заголовка документа.

- **Ограничение**: Только для статуса **DRAFT**.

### `addItems(id: string, dto: CreateDocumentAdjustmentItemsDto)`

Добавляет позиции в документ. Рассчитывает `quantityBefore` и `quantityAfter` на основе текущего остатка для каждой позиции.

### `updateItem(id: string, itemId: string, dto: CreateDocumentAdjustmentItemDto)`

Обновляет количество в существующей позиции.

### `removeItems(id: string, dto: RemoveDocumentAdjustmentItemsDto)`

Удаляет позиции из документа.

### `updateStatus(id: string, newStatus: 'DRAFT' | 'COMPLETED' | 'CANCELLED')`

Управление статусом.

- **DRAFT -> COMPLETED**: Проводит документ. Применяет изменения к остаткам (приход/списание). Фиксирует снимки `quantityBefore`/`quantityAfter`. Запускает пересчет истории, если дата в прошлом.
- **COMPLETED -> DRAFT / CANCELLED**: Отменяет проведение. Инвертирует движение и всегда запускает пересчет истории.
  - **Откат**: Возвращает остатки в исходное состояние (инвертирует движение).
  - **Snapshot**: Снимки `quantityBefore` и `quantityAfter` фиксируются именно в момент проведения.

## Особенности

- **Гибкость**: Количество в позициях может быть как положительным (приход), так и отрицательным (списание).
- **Snapshot**: Этот сервис единственный, кто хранит `quantityBefore` прямо в позициях документа для удобства сверки актов инвентаризации.
- **Reprocessing**: Инвентаризация часто проводится задним числом. Сервис автоматически создает записи в `InventoryReprocessing` для синхронизации всех последующих движений товара.
