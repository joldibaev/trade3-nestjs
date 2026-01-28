# 🏷 Document Price Change Methods (Visual Architecture)

> **Complete Method Lifecycle** for Price Changes.

## 🟢 `create` (Initialization)

**Purpose**: Prepare new prices.

```mermaid
flowchart TD
    Start([User Input]) --> Loop{For Each Item}
    
    Loop --> Fetch["**Fetch Old Price**<br/>(Current Value in Price Table)"]
    Fetch --> Prep["**Prepare Item**<br/>OldValue = Current<br/>NewValue = Input"]
    
    Prep --> Insert[**INSERT PriceChangeItem**]
    Insert --> Doc[**INSERT DocumentPriceChange**]
```

## 🟡 `update` (Start Over)

**Purpose**: Full refresh of items.

```mermaid
flowchart TD
    Start([update]) --> Wipe[**DELETE All Items**]
    Wipe --> Loop["**Re-create Items**<br/>(Re-fetch current prices)"]
    Loop --> UpdateHeader
```

## 🌟 `updateStatus` (Commit: DRAFT ➔ COMPLETED)

**Purpose**: Updates the **ProductPrice** table and writes to **PriceLedger**.

```mermaid
flowchart TD
    Start(["**Apply Prices**"]) --> CheckManaged{Is Managed by Purchase?}
    
    CheckManaged -- Yes --> Err[Error: Cannot update manually]
    CheckManaged -- No --> Tx[Start Transaction]
    
    Tx --> Loop{For Each Item}
    
    subgraph "Blockchain Logic"
        Loop --> Ledger["**INSERT PriceLedger**<br/>ValueBefore -> ValueAfter"]
        Ledger --> Update["**UPSERT ProductPrice**<br/>Value = NewValue"]
    end
    
    Update --> Commit
```

## ↩️ `updateStatus` (Revert: COMPLETED ➔ DRAFT)

**Purpose**: Restores old prices.

```mermaid
flowchart TD
    Start(["**Revert Prices**"]) --> Tx
    
    Tx --> Loop{For Each Item}
    
    subgraph "Compensating Logic"
        Loop --> Ledger["**INSERT PriceLedger**<br/>Value = OldValue<br/>(Restoration Entry)"]
        Ledger --> Update["**UPSERT ProductPrice**<br/>Value = OldValue"]
    end
    
    Update --> Commit
```
