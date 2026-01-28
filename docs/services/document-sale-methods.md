# 🏷 Document Sale Methods (Visual Architecture)

> **Complete Method Lifecycle** for Sales.

## 🟢 `create` (Initialization)

**Purpose**: Creates sale header.

```mermaid
flowchart LR
    Start([User Input]) --> Check[Validate Client & Store]
    Check --> Gen[Generate Code]
    Gen --> DB[**INSERT DocumentSale**]
    DB --> Log[Log: CREATED]
```

## 🟡 `update` (Edit Header)

**Purpose**: Change Client, Date, or Cashbox.

```mermaid
flowchart TD
    Start([update]) --> Draft{Is Draft?}
    Draft -- No --> Err
    Draft -- Yes --> Upd[**UPDATE DocumentSale**]
    Upd --> Log[Log: UPDATED]
```

## 🔵 `addItems` (Smart Add)

**Purpose**: Adds item and **Snapshots Cost Price**.

```mermaid
flowchart TD
    Start([addItems]) --> Loop{For Each Item}
    
    Loop --> Price{Price Provided?}
    Price -- No --> FindPrice["**Fetch Retail Price**<br/>From ProductPrice table"]
    Price -- Yes --> UsePrice[Use Input Price]
    
    FindPrice & UsePrice --> Cost["**Fetch Cost Price**<br/>(Read Stock.averagePurchasePrice)<br/>Snapshot for Margin Calc"]
    
    Cost --> Insert[**INSERT SaleItem**]
    Insert --> UpdTot["**Update Doc Total**<br/>Sale.total += (Qty * Price)"]
    
    UpdTot --> Log[Log: ITEM_ADDED]
```

## 🔵 `updateItem` (Modify Line)

**Purpose**: Change Qty or Price (Discount).

```mermaid
flowchart TD
    Start([updateItem]) --> Draft{Is Draft?}
    Draft -- Yes --> Calc["**Recalc Total**<br/>NewQty * NewPrice"]
    
    Calc --> Diff["**Calc Diff**<br/>NewTotal - OldTotal"]
    Draft --> Snapshot["**Re-fetch Cost Price**<br/>(Update snapshot to current reality)"]
    
    Diff & Snapshot --> Update[**UPDATE SaleItem & Doc**]
    Update --> Log[Log: ITEM_CHANGED]
```

## 🔴 `removeItems` (Delete Line)

```mermaid
flowchart TD
    Draft{Is Draft?} -- Yes --> Del[**DELETE SaleItem**]
    Del --> Decr["**Update Doc Total**"]
    Decr --> Log[Log: ITEM_REMOVED]
```

## 🌟 `updateStatus` (Commit: DRAFT ➔ COMPLETED)

**Purpose**: Finalizes sale, deducts inventory.

```mermaid
flowchart TD
    Start(["**updateStatus(COMPLETED)**"]) --> Tx[Start Transaction]
    
    Tx --> Lock[**LOCK Inventory Rows**]
    Lock --> Refresh["**Refresh Snapshots**<br/>Update Item.costPrice with LIVE WAP"]
    
    Refresh --> Loop{For Each Item}
    
    subgraph "Deduction Logic"
        Loop --> Stock{"Stock >= Qty?"}
        Stock -- No --> Err[Error: Insufficient Stock]
        Stock -- Yes --> Decr["**Decrease Stock**<br/>Stock.quantity -= Qty"]
        
        Decr --> Ledger["**INSERT StockLedger**<br/>Type: SALE"]
    end
    
    Ledger --> Repro{"Date < Now?"}
    Repro -- Yes --> Job[**Trigger Reprocessing**]
    Repro -- No --> Commit
```

## ↩️ `updateStatus` (Void: COMPLETED ➔ DRAFT)

**Purpose**: Voids the sale, returns items to shelf.

```mermaid
flowchart TD
    Start(["**Void Sale**"]) --> Tx
    
    Tx --> Loop{For Each Item}
    
    subgraph "Restocking"
        Loop --> Incr["**Increase Stock**<br/>Stock.quantity += Qty"]
        Incr --> Ledger["**INSERT StockLedger**<br/>Type: SALE (Inverse)"]
    end
    
    Ledger --> Job[**ALWAYS** Trigger Reprocessing]
    Job --> Commit
```

## 🗑 `remove` (Hard Delete)

```mermaid
flowchart LR
    Draft{Is Draft?} -- Yes --> Del[**DELETE DocumentSale**]
    Del --> End([Terminated])
```
