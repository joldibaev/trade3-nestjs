# 🔙 Document Return Methods (Visual Architecture)

> **Complete Method Lifecycle** for Returns.

## 🟢 `create` (Initialization)

**Purpose**: Create Return Header (link to Client).

```mermaid
flowchart LR
    Start([User Input]) --> Valid[Validate Client/Store]
    Valid --> Gen[Generate Code]
    Gen --> DB[**INSERT DocumentReturn**]
    DB --> Log[Log: CREATED]
```

## 🟡 `update` (Edit)

**Purpose**: Modify return metadata.

```mermaid
flowchart TD
    Start([update]) --> Fetch[Fetch Document]
    Fetch --> CheckStat{Draft?}
    CheckStat -- No --> Err[Error: Cannot edit]
    CheckStat -- Yes --> Upd[**UPDATE DocumentReturn**]
    Upd --> Log[Log: UPDATED]
```

## 🔵 `addItems` (Refund Logic)

**Purpose**: Queue items for return. Calculates refund amount (total).

```mermaid
flowchart TD
    Start([addItems]) --> Loop{For Each Item}
    
    Loop --> Calc["**Calc Total Refund**<br/>Qty * RefundPrice"]
    Calc --> Insert[**INSERT ReturnItem**]
    Insert --> UpdDoc["**Update Doc Total**"]
    UpdDoc --> Log[Log: ITEM_ADDED]
```

## 🔵 `updateItem` (Correction)

**Purpose**: Change qty or refund price.

```mermaid
flowchart TD
    Start([updateItem]) --> Check{Draft?}
    Check -- Yes --> Recalc["**Recalc Item Total**"]
    Recalc --> Diff["**Calc Diff**"]
    Diff --> UpdItem[**UPDATE ReturnItem**]
    UpdItem --> UpdDoc[**UPDATE DocumentReturn**]
    UpdDoc --> Log[Log: ITEM_UPDATED]
```

## 🔴 `removeItems` (Deletion)

**Purpose**: Remove line.

```mermaid
flowchart TD
    Start([removeItems]) --> Check{Draft?}
    Check -- Yes --> Del[**DELETE ReturnItem**]
    Del --> UpdDoc[**Decrease Doc Total**]
    UpdDoc --> Log[Log: ITEM_REMOVED]
```

## 🌟 `updateStatus` (Commit: DRAFT ➔ COMPLETED)

**Purpose**: Put items back into inventory constraints.

```mermaid
flowchart TD
    Start(["**Execute Return**"]) --> Tx[Start Transaction]
    
    Tx --> Loop{For Each Item}
    
    subgraph "Safe Restocking"
        Loop --> GetWap["**Fetch Fallback WAP**<br/>(Use current or catalog price to prevent averaging down/up)"]
        
        GetWap --> Incr["**Increase Stock**<br/>Stock.quantity += Qty"]
        
        Incr --> Calc["**Recalculate WAP**<br/>Using Return Price as cost"]
        
        Calc --> Log["**INSERT StockLedger**<br/>Type: RETURN"]
    end
    
    Log --> Commit
```

## ↩️ `updateStatus` (Undo Return)

**Purpose**: Cancel the return logic.

```mermaid
flowchart TD
    Start(["**Undo Return**"]) --> Val["**Validate Stock**<br/>Is the returned item still there?"]
    
    Val -- No --> Err[Error: Already Sold]
    Val -- Yes --> Decr[**Decrease Stock**]
    
    Decr --> Job[**Trigger Reprocessing**]
    Job --> Commit
```

## 🗑 `remove`

```mermaid
flowchart LR
    Check{Draft?} -- Yes --> Del[**DELETE DocumentReturn**]
```
