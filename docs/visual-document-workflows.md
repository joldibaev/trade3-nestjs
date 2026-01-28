# 📑 Visual Document Workflows

> **Visual Guide to Document Lifecycles & Methods**
> Detailed flowcharts explaining the logic inside key service methods (`create`, `addItems`, `updateStatus`).

---

## 📥 1. Document Purchase (Закупка)

### 🔹 `create` & `addItems` (Drafting)

This process builds the document. No stock changes happen here.

```mermaid
flowchart LR
    Start([User Request]) --> Create["**create()**<br/>Insert Header<br/>Status: DRAFT"]
    
    Create --> AddItems["**addItems()**"]
    
    subgraph "Transaction (ReadCommitted)"
        AddItems --> Loop{For Each Item}
        Loop -->|Calc| Total[RowTotal = Qty * Price]
        Total --> Insert[Insert DocumentPurchaseItem]
        Insert --> Sync[Sync with PriceChange Doc]
        Sync --> Log[Log: ITEM_ADDED]
    end
    
    Log --> Sum[Update Document Total]
    Sum --> End([Return Document])
```

### 🔶 `updateStatus` (DRAFT ➔ COMPLETED)

The critical method that increments stock and recalculates WAP.

```mermaid
flowchart TD
    Start(["**updateStatus(COMPLETED)**"]) --> Tx[Start Transaction<br/>Isolation: Serializable]
    
    Tx --> Locks[Lock Product Rows]
    
    Locks --> Loop{For Each Item}
    
    subgraph "Inventory Movement"
        Loop --> Fetch[Fetch Current Stock]
        Fetch --> Calcw["**Calculate New WAP**<br/>((OldQty*OldWAP) + (NewQty*Price)) / TotalQty"]
        Calcw --> UpdateStock["Update Stock<br/>(New Qty, New WAP)"]
        UpdateStock --> Ledger[Create StockLedger Entry]
    end
    
    Ledger -- Next Item --> Loop
    Loop -- Done --> UpdateDoc[Set Status = COMPLETED]
    
    UpdateDoc --> Repro{Date in Past?}
    Repro -- Yes --> Job[Create **Reprocessing Job**]
    Repro -- No --> Commit
    
    Job --> Commit[Commit Transaction]
    Commit --> End([Done])
```

---

## 📤 2. Document Sale (Продажа)

### 🔹 `addItems`

Fixes the estimated cost price at the moment of adding to cart.

```mermaid
flowchart LR
    Start([addItems]) --> Fetch[Fetch Product]
    Fetch --> Stock[Get Current WAP from Stock]
    Stock --> Save[Save Item with **costPrice = WAP**]
    Save --> End([Item Added])
```

### 🔶 `updateStatus` (DRAFT ➔ COMPLETED)

Updates cost price to actual and reduces stock.

```mermaid
flowchart TD
    Start(["**updateStatus(COMPLETED)**"]) --> Tx[Start Transaction]
    
    Tx --> Lock[Lock Products]
    Lock --> Refresh[**Refresh costPrice**<br/>Update items with LATEST WAP from Stock]
    
    Refresh --> Loop{For Each Item}
    
    subgraph "Inventory Deduction"
        Loop --> Check{Enough Stock?}
        Check -- No --> Error[Throw Error]
        Check -- Yes --> Decr["**Decrease Stock**<br/>(Qty - SoldQty)"]
        Decr --> Ledger[Create StockLedger Entry]
    end
    
    Ledger --> Loop
    Loop -- Done --> UpdateDoc[Set Status = COMPLETED]
    UpdateDoc --> Finish([Sale Conducted])
```

---

## 🚚 3. Document Transfer (Перемещение)

### 🔶 `updateStatus` (Dual-Store Logic)

Moves stock from Store A to Store B, carrying the WAP value with it.

```mermaid
flowchart TB
    Start(["**updateStatus(COMPLETED)**"]) --> Tx
    
    subgraph "Source Store (A)"
        Tx --> CheckA{Has Stock?}
        CheckA -- No --> Fail
        CheckA -- Yes --> DecrA[Decrease Stock A]
        DecrA --> LogA[Log TRANSFER_OUT]
    end
    
    subgraph "Destination Store (B)"
        LogA --> CalcB["**Calculate WAP B**<br/>Blend (StockB with StockA's WAP)"]
        CalcB --> IncrB[Increase Stock B]
        IncrB --> LogB[Log TRANSFER_IN]
    end
    
    LogB --> Valid{Both Success?}
    Valid -- Yes --> Commit
    Valid -- No --> Rollback
```

---

## ↩️ 4. Status Revert (COMPLETED ➔ DRAFT)

The "Undo" logic common to all documents.

```mermaid
flowchart TD
    Start(["**updateStatus(DRAFT)**"]) --> Check{Is COMPLETED?}
    Check -- Yes --> RevertGeneric
    
    subgraph "Generic Revert Logic"
        RevertGeneric --> ValidRev{Safe to Revert?<br/>(Check Negatives)}
        ValidRev -- No --> Error
        ValidRev -- Yes --> Inverse[**Apply Inverse Movement**<br/>Sale -> Add back<br/>Purchase -> Remove]
        Inverse --> Log[Log Revert Action]
        Log --> Job[**ALWAYS Trigger Reprocessing**]
    end
    
    Job --> Update[Set Status = DRAFT]
    Update --> End([Document Re-opened])
```
