# 🎨 Visual Architecture & Algorithms

> **Visual Guide to Trade3's Core Logic**
> This document uses **Mermaid.js** diagrams to visualize the system structure, data flows, and critical inventory algorithms.

---

## 🏗 1. System Architecture (High Level)

The system is built as a high-performance Monolithic REST API using **NestJS** and **Fastify**.

```mermaid
graph TD
    Client[Web / Mobile Clients] -->|HTTPS| LoadBalancer
    LoadBalancer -->|TCP| API["NestJS API (Fastify)"]
    
    subgraph "Trade3 Backend"
        API -->|Validates| Zod[Zod Pipes]
        API -->|Auth| Guard[JwtAuthGuard]
        API -->|Business Logic| Services[Vertical Slice Services]
        
        Services -->|Query| Prisma[Prisma ORM]
        Services -->|Audit| Ledger[Stock/Price Ledger]
    end
    
    Prisma -->|SQL| DB[("PostgreSQL")]
    
    style API fill:#E0234E,stroke:#333,stroke-width:2px,color:white
    style DB fill:#336791,stroke:#333,stroke-width:2px,color:white
    style Prisma fill:#2D3748,stroke:#333,stroke-width:2px,color:white
```

---

## 🍰 2. Code Organization: Vertical Slices

We avoid "Layered Architecture" (Controllers/Services/Repositories folders). Instead, we group by **Feature**.

```mermaid
graph TB
    subgraph "src/ (Source Root)"
        direction TB
        
        subgraph "Shared Core (Horizontal)"
            Auth[Auth Module]
            PrismaSvc[Prisma Service]
            InventorySvc[Inventory Service]
        end
        
        subgraph "Feature Slices (Vertical)"
            Sale[Document Sale]
            Purchase[Document Purchase]
            Product[Product Catalog]
            Repo[Reporting]
        end
        
        Sale -->|Uses| InventorySvc
        Purchase -->|Uses| InventorySvc
        InventorySvc -->|Uses| PrismaSvc
    end
    
    style Sale fill:#D4EDDA,stroke:#155724
    style Purchase fill:#D4EDDA,stroke:#155724
    style Product fill:#D4EDDA,stroke:#155724
    style InventorySvc fill:#CCE5FF,stroke:#004085
```

---

## 🔄 3. Key Algorithms

### 3.1 WAP Calculation (Weighted Average Price)

How the system calculates the Cost Price of goods when a new Batch (Purchase/Transfer) arrives.

```mermaid
flowchart LR
    Start([New Goods Arrive]) --> Fetch[Fetch Current Stock]
    
    Fetch --> Check{Stock Exists?}
    Check -- No --> Init[WAP = New Price]
    Check -- Yes --> Calc[Calculate Weighted Average]
    
    Calc --> Formula["(OldQty * OldWAP) + (NewQty * NewPrice)
    -----------------------------------------
              (OldQty + NewQty)"]
              
    Formula --> Update[Update Stock Record]
    Update --> Ledger[Log in StockLedger]
    
    style Formula fill:#FFF3CD,stroke:#856404
```

### 3.2 "Time Travel" (Sequence Reprocessing)

What happens when a user edits a document **in the past** (e.g., changes a Purchase price from last month)?

```mermaid
sequenceDiagram
    actor User
    participant Service as PurchaseService
    participant Inv as InventoryService
    participant DB
    
    User->>Service: Update Price (Date: 01.01.2025)
    
    Service->>DB: Update Document (Transaction)
    Service->>Inv: triggerReprocessingIfNeeded()
    
    Inv->>DB: Check for FUTURE movements (Sales/Transfers > 01.01.2025)
    
    opt Future Movements Exist
        Service->>DB: Commit Transaction
        
        Note right of Inv: Async / Post-Transaction
        
        loop For Each Affected Product
            Inv->>DB: Fetch All Movements chronologically
            Inv->>Inv: Re-calculate WAP & Stock step-by-step
            Inv->>DB: Heal StockLedger (Add CORRECTIONs)
        end
    end
```

---

## 🚦 4. Document Lifecycle (State Machine)

The lifecycle of any document (Purchase, Sale, Transfer) ensures consistency.

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    
    DRAFT --> DRAFT: Edit Items / Header
    
    DRAFT --> COMPLETED: "Post/Conduct"
    note right of COMPLETED
        - Stock Updated
        - Ledger Entries Created
        - WAP Recalculated
    end note
    
    COMPLETED --> DRAFT: "Revert/Unpost"
    note left of DRAFT
        - Stock Reverted
        - History Reprocessing Triggered
    end note
    
    DRAFT --> CANCELLED: "Void"
    COMPLETED --> CANCELLED: "Void"
    
    CANCELLED --> DRAFT: "Revive"
```

---

## 🧮 5. Database Schema: Key Relations

A simplified view of how Documents connect to the Ledger and Inventory.

```mermaid
erDiagram
    STORE ||--o{ STOCK : contains
    PRODUCT ||--o{ STOCK : "stored in"
    
    DOCUMENT_PURCHASE ||--|{ PURCHASE_ITEM : contains
    DOCUMENT_SALE ||--|{ SALE_ITEM : contains
    
    STOCK_LEDGER }|--|| STORE : "happened at"
    STOCK_LEDGER }|--|| PRODUCT : "affected"
    
    DOCUMENT_PURCHASE ||--o{ STOCK_LEDGER : "generates"
    DOCUMENT_SALE ||--o{ STOCK_LEDGER : "generates"
    
    PRODUCT_PRICE ||--|| PRODUCT : "has current"
    PRICE_LEDGER }|--|| PRODUCT : "history"
```
