# 🛒 Document Purchase Methods (Visual Architecture)

> **Complete Method Lifecycle** for Purchases.

## 🟢 `create` (Initialization)

**Purpose**: Creates the purchase header.

```mermaid
flowchart LR
    Start([User Input]) --> ValVendor{Validate Vendor}
    ValVendor --> ValStore{Validate Store}
    
    ValStore --> CheckDate{"Date > Now?"}
    CheckDate -- Yes --> Sched[Status = SCHEDULED]
    CheckDate -- No --> Norm[Status = User Choice]
    
    Sched & Norm --> Gen[Generate Code]
    Gen --> DB[**INSERT DocumentPurchase**]
    DB --> Log[Log: CREATED]
```

## 🟡 `update` (Edit Header)

**Purpose**: Changes Vendor, Date, or Notes.

```mermaid
flowchart TD
    Start([update]) --> Check{"Status == DRAFT?"}
    Check -- No --> Err
    Check -- Yes --> Update[**UPDATE DocumentPurchase**]
    Update --> Log[Log: UPDATED]
```

## 🔵 `addItems` (Append & Sync)

**Purpose**: Adds items to purchase. Handles **Price Change synchronization**.

```mermaid
flowchart TD
    Start([addItems]) --> Loop{For Each Item}
    
    Loop --> CalcTotals["**Calc Item Total**<br/>Qty * Price"]
    CalcTotals --> DB[**INSERT PurchaseItem**]
    
    DB --> SyncCheck{New Retail Prices?}
    
    subgraph "Price Change Sync"
        SyncCheck -- Yes --> PC_Fetch[Find/Create DocumentPriceChange]
        PC_Fetch --> PC_Add["**Add Item to PriceChange**<br/>(Link to Purchase)"]
    end
    
    SyncCheck -- No --> Sum
    PC_Add --> Sum["**Update Doc Total**<br/>Increment Purchase.total"]
    
    Sum --> Log[Log: ITEM_ADDED]
```

## 🔵 `updateItem` (Modify Line)

**Purpose**: Corrects quantity or buying price.

```mermaid
flowchart TD
    Start([updateItem]) --> Fetch
    Fetch --> Old["Fetch Old Total"]
    
    Old --> Calc["**Calc New Total**<br/>NewQty * NewPrice"]
    Calc --> Diff["**Calc Diff**<br/>NewTotal - OldTotal"]
    
    Diff --> DB_Item[**UPDATE PurchaseItem**]
    DB_Item --> DB_Doc["**UPDATE DocumentPurchase**<br/>Total += Diff"]
    
    DB_Doc --> Sync{Has Price Change?}
    Sync -- Yes --> SyncUpd[Update Linked PriceChange Item]
    Sync -- No --> Log[Log: ITEM_CHANGED]
```

## 🔴 `removeItems` (Delete Line)

**Purpose**: Removes item from purchase (and potential linked price change).

```mermaid
flowchart TD
    Start([removeItems]) --> Fetch
    Fetch --> Delete[**DELETE PurchaseItem**]
    
    Delete --> Decr["**Decrement Total**<br/>Doc.total -= Item.total"]
    
    Decr --> Sync{Linked PriceChange?}
    Sync -- Yes --> DelPC[Remove Item from PriceChange Doc]
    
    DelPC --> Log[Log: ITEM_REMOVED]
```

## 🌟 `updateStatus` (Commit: DRAFT ➔ COMPLETED)

**Purpose**: Stocks items and calculates WAP.

```mermaid
flowchart TD
    Start(["**updateStatus(COMPLETED)**"]) --> Tx[Start Transaction]
    
    Tx --> Loop{For Each Item}
    
    subgraph "Core Inventory Logic"
        Loop --> GetStock[Fetch Current Stock]
        GetStock --> CalcWAP["**Calculate New WAP**<br/>Formula: ((CurrQty * CurrWAP) + (NewQty * Price)) / TotalQty"]
        
        CalcWAP --> Upsert["**UPSERT Stock**<br/>Set New Qty & New WAP"]
        Upsert --> Ledger["**INSERT StockLedger**<br/>Type: PURCHASE"]
    end
    
    Ledger --> Next{More?}
    Next -- Yes --> Loop
    Next -- No --> CheckPC{Linked PriceChange?}
    
    CheckPC -- Yes --> ExecPC["**Commit PriceChange**<br/>(Trigger PriceChange.updateStatus)"]
    
    ExecPC --> Repro{"Date < Now?"}
    CheckPC -- No --> Repro
    
    Repro -- Yes --> Job[**Trigger Reprocessing**]
    Repro -- No --> Commit
```

## ↩️ `updateStatus` (Revert: COMPLETED ➔ DRAFT)

**Purpose**: Refunds the purchase (removes stock).

```mermaid
flowchart TD
    Start(["**Revert Purchase**"]) --> Tx
    
    Tx --> Val["**Validate Stock**<br/>Ensure we have enough stock to remove"]
    Val -- Fail --> Err[Error: Already Sold]
    
    Val -- Pass --> Loop{For Each Item}
    
    subgraph "Rollback"
        Loop --> Decr[**Decrease Stock**]
        Decr --> Ledger["**INSERT StockLedger**<br/>Type: PURCHASE (Inverse)<br/>Reason: REVERSAL"]
        Ledger --> RevPC["**Revert PriceChange**<br/>(If linked)"]
    end
    
    RevPC --> Job[**ALWAYS** Trigger Reprocessing]
    Job --> Commit
```

## 🗑 `remove` (Hard Delete)

**Purpose**: Deletes purchase draft.

```mermaid
flowchart LR
    Check{"Status == DRAFT?"} -- Yes --> Del[**DELETE DocumentPurchase**]
    Del --> DelLink["**Cascade Delete**<br/>Linked PriceChange also deleted"]
    DelLink --> End([Gone])
```
