# База данных: Описание сущностей

Документация по структуре моделей данных приложения на основе `prisma/schema.prisma`.

---

## Общие типы и перечисления

### DocumentStatus (Enum)
Статус проведения документа.
- `DRAFT`: Черновик (не влияет на остатки).
- `COMPLETED`: Проведен (влияет на остатки).
- `CANCELLED`: Отменен.

---

## Базовые сущности

### User
Пользователи системы.
- `id` (UUID v7): Идентификатор.
- `username` (String, Unique): Имя пользователя.
- `createdAt`, `updatedAt`: Временные метки.

### Store
Склады или торговые точки.
- `id` (UUID v7): Идентификатор.
- `name` (String, Unique): Название склада.
- `cashboxes`: Связанные кассы.
- `stocks`: Остатки товаров на этом складе.

### Cashbox
Кассовые аппараты.
- `id` (UUID v7): Идентификатор.
- `name`: Название.
- `storeId`: Привязка к складу.
- `@@unique([name, storeId])`: Уникальность названия внутри одного склада.

---

## Продукты и Цены

### Product
Карточка товара.
- `id` (UUID v7): Идентификатор.
- `name`: Название.
- `article` (String, Optional): Артикул.
- `categoryId`: Категория товара.
- `prices`: История или типы цен.
- `barcodes`: Список штрих-кодов.
- `@@unique([categoryId, name])`: Уникальность названия внутри одной категории.

### Category
Категории товаров.
- `id` (UUID v7): Идентификатор.
- `name` (String, Unique): Название.

### Barcode
Штрих-коды товара.
- `id` (UUID v7): Идентификатор.
- `value`: Значение штрих-кода.
- `productId`: Ссылка на товар.
- `@@unique([productId, value])`: Уникальность штрих-кода для конкретного товара.

### PriceType
Типы цен (например, "Оптовая", "Розница").
- `id` (UUID v7): Идентификатор.
- `name` (String, Unique): Название типа цены.

### Price
Значения цен для товаров.
- `id` (UUID v7): Идентификатор.
- `value` (Decimal): Значение цены.
- `productId`: Ссылка на товар.
- `priceTypeId`: Ссылка на тип цены.
- `@@unique([productId, priceTypeId])`: Одна цена одного типа для одного товара.

---

## Складской учет

### Stock
Текущие остатки товаров на складах.
- `id` (UUID v7): Идентификатор.
- `productId`: Ссылка на товар.
- `storeId`: Ссылка на склад.
- `quantity` (Decimal): Текущее количество.
- `averagePurchasePrice` (Decimal): Средневзвешенная цена закупки (WAP).
- `@@unique([productId, storeId])`: Один товар на одном складе.

---

## Контрагенты

### Vendor
Поставщики.
- `id` (UUID v7): Идентификатор.
- `name` (String, Unique): Название.

### Client
Клиенты (покупатели).
- `id` (UUID v7): Идентификатор.
- `name` (String, Unique): Имя/Название.

---

## Документы

Все документы имеют общие поля: `id`, `date`, `status`, `createdAt`, `updatedAt`.

### DocumentSale (Продажа)
- `storeId`: Склад отгрузки.
- `cashboxId`: Касса.
- `clientId`: Покупатель.
- `priceTypeId`: Тип цены, по которой совершена продажа.
- `totalAmount`: Общая сумма.
- `items`: Позиции продажи.

### DocumentPurchase (Закупка)
- `vendorId`: Поставщик.
- `storeId`: Склад поступления.
- `totalAmount`: Общая сумма.
- `items`: Позиции закупки.

### DocumentReturn (Возврат от клиента)
- `storeId`: Склад поступления.
- `clientId`: Кто вернул.
- `totalAmount`: Сумма возврата.
- `items`: Позиции возврата.

### DocumentAdjustment (Списание / Оприходование / Ревизия)
- `storeId`: Склад.
- `items`: Позиции корректировки.

### DocumentTransfer (Перемещение)
- `sourceStoreId`: Склад-отправитель.
- `destinationStoreId`: Склад-получатель.
- `items`: Позиции перемещения.

---

## Позиции документов (Items)

Все позиции содержат `productId`, `quantity` и ссылки на родительский документ.

- **DocumentSaleItem**: Содержит `price`, `costPrice` (себестоимость на момент продажи) и `total`.
- **DocumentPurchaseItem**: Содержит `price` и `total`.
- **DocumentReturnItem**: Содержит `price` и `total`.
- **DocumentAdjustmentItem**: Содержит дополнительные поля:
    - `quantityBefore`: Остаток до корректировки.
    - `quantityAfter`: Остаток после корректировки.
- **DocumentTransferItem**: Только количество и товар.
