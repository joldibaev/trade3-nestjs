# 🛠 Document Adjustment Methods (Visual Architecture)

> **Complete Method Lifecycle** for Inventory Adjustments.

## 🟢 `create` (Initialization)

**Purpose**: initializes the document header. No changes to stock yet.

```mermaid
flowchart TD
    Start([User Request]) --> ValStore{Store Exists?}
    ValStore -- No --> Err[Error: Store Not Found]
    ValStore -- Yes --> ValDate["**Date Logic Check**<br/>If (Status=COMPLETED AND Date > Now)"]
    
    ValDate -- True --> ForceSched["Force Status = **SCHEDULED**"]
    ValDate -- False --> KeepStat[Keep Requested Status]
    
    ForceSched & KeepStat --> Code["**Generate Code**<br/>(e.g. INV-001)"]
    Code --> DB[**INSERT DocumentAdjustment**]
    DB --> Log[Log History: CREATED]
    Log --> Return[Return Document]
```

## 🟡 `update` (Header Editing)

**Purpose**: Modifies top-level fields (Notes, Date, Store).

```mermaid
flowchart TD
    Start(["update(id, dto)"]) --> Fetch[Fetch Document]
    Fetch --> CheckStat{"Status == DRAFT?"}
    
    CheckStat -- No --> Err[Error: Cannot edit active doc]
    CheckStat -- Yes --> Diff[Identify Changed Fields]
    
    Diff --> Update[**UPDATE DocumentAdjustment**]
    Update --> Log["Log History: UPDATED<br/>(Record which fields changed)"]
```

## 🔵 `addItems` (Append Logic)

**Purpose**: Adds new lines to the adjustment.
**Key Logic**: Calculates the "Delta" based on *current* stock at the moment of adding.

```mermaid
flowchart TD
    Start(["addItems(id, items)"]) --> Lock[Fetch Document & Lock]
    Lock --> Loop{For Each Item}
    
    Loop --> FetchStock[Fetch Current Stock Level]
    FetchStock --> Calc["**Calculate Delta**<br/>QtyBefore = CurrentStock<br/>QtyAfter = CurrentStock + InputDelta"]
    
    Calc --> Insert[**INSERT AdjustmentItem**]
    Insert --> Log[Log History: ITEM_ADDED]
    
    Log --> Next{Next?}
    Next -- Yes --> Loop
    Next -- No --> End([Done])
```

## 🔵 `updateItem` (Correction Logic)

**Purpose**: Modifies an existing line (e.g. user made a typo in the count).

```mermaid
flowchart TD
    Start(["updateItem(docId, itemId, dto)"]) --> Fetch[Fetch Item & Doc]
    Fetch --> CheckStat{"Status == DRAFT?"}
    
    CheckStat -- No --> Err[Error]
    CheckStat -- Yes --> Recalc["**Recalculate Totals**<br/>NewDelta -> NewQtyAfter"]
    
    Recalc --> Update[**UPDATE AdjustmentItem**]
    Update --> Log[Log History: ITEM_UPDATED]
```

## 🔴 `removeItems` (Deletion Logic)

**Purpose**: Removes a line from the draft.

```mermaid
flowchart TD
    Start([removeItems]) --> Fetch[Fetch Document]
    Fetch --> CheckStat{Draft?}
    CheckStat -- No --> Err
    CheckStat -- Yes --> Delete[**DELETE AdjustmentItem**]
    Delete --> Log[Log History: ITEM_REMOVED]
```

## 🌟 `updateStatus` (Commit: DRAFT ➔ COMPLETED)

**Purpose**: Applies the changes to the actual inventory.

```mermaid
flowchart TD
    Start(["**updateStatus(COMPLETED)**"]) --> Tx[Start Transaction]
    
    Tx --> Refresh["**Refresh Snapshots**<br/>CRITICAL: Re-read Stock for all items<br/>Update quantityBefore/After in Item"]
    
    Refresh --> Loop{For Each Item}
    
    subgraph "Inventory Logic"
        Loop --> CheckType{"Delta > 0?"}
        
        CheckType -- "Positive (+)" --> In["**Increase Stock**<br/>(Upsert Stock)"]
        In --> Wap[Recalculate WAP]
        
        CheckType -- "Negative (-)" --> Out["**Decrease Stock**<br/>(Update Stock)"]
        Out --> Cost[Preserve WAP]
        
        Wap & Cost --> Aud["**INSERT StockLedger**<br/>Type: ADJUSTMENT"]
    end
    
    Aud --> Next{More Items?}
    Next -- Yes --> Loop
    Next -- No --> Repro{"Date < Now?"}
    
    Repro -- Yes --> Job[**Trigger Reprocessing**]
    Repro -- No --> Commit
    
    Job --> Commit[Commit Transaction]
```

## ↩️ `updateStatus` (Revert: COMPLETED ➔ DRAFT)

**Purpose**: Undoes the adjustment.

```mermaid
flowchart TD
    Start(["**updateStatus(DRAFT)**"]) --> Tx[Start Transaction]
    
    Tx --> Loop{For Each Item}
    
    subgraph "Inversion"
        Loop --> Inv["**Invert Delta**<br/>(+5 becomes -5)<br/>(-3 becomes +3)"]
        
        Inv --> Check{"New Qty < 0?"}
        Check -- Yes --> Val["**Validate Stock**<br/>Ensure enough stock to remove"]
        Val -- Fail --> Err[Error: Stock too low]
        Val -- Pass --> Apply[Apply Stock Movement]
        
        Check -- No --> Apply
        Apply --> Log["**INSERT StockLedger**<br/>Type: ADJUSTMENT (Inverse)"]
    end
    
    Log --> Job[**ALWAYS** Trigger Reprocessing]
    Job --> Commit
```

## 🗑 `remove` (Hard Delete)

**Purpose**: Deletes the document entirely. Only allowed for Drafts.

```mermaid
flowchart LR
    Start(["remove(id)"]) --> Fetch
    Fetch --> Check{"Status == DRAFT?"}
    Check -- No --> Err[Error: Cannot delete]
    Check -- Yes --> Wipe["**DELETE DocumentAdjustment**<br/>(Cascades to Items & History)"]
    Wipe --> End([Deleted])
```
