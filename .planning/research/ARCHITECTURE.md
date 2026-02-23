# Architecture Research: Shopify Sync Patterns

**Domain:** Data Synchronization Patterns
**Researched:** 2025-02-23
**Confidence:** HIGH

## Recommended Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       Shopify Admin                         │
└──────────────┬──────────────────────────────▲───────────────┘
               │ (Webhooks)                   │ (GraphQL API)
┌──────────────▼──────────────────────────────┴───────────────┐
│                      Shopify App (Remix)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────┐    ┌────────────────┐    ┌────────────┐ │
│  │ Webhook Routes │    │ API Client     │    │ Auth       │ │
│  └───────┬────────┘    └───────▲────────┘    └────────────┘ │
└──────────┼─────────────────────┼────────────────────────────┘
           │ (Push Job)          │ (Pull Data)
┌──────────▼─────────────────────┴────────────────────────────┐
│                      Background Workers                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   Sync Service Layer                │    │
│  │ (Validation, Handle Sanitization, Data Comparison)  │    │
│  └──────────────────────────┬──────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                        Data Storage                         │
│  ┌──────────┐         ┌──────────┐         ┌──────────┐     │
│  │ Postgres │         │  MySQL   │         │  Redis   │     │
│  │ (App DB) │         │(External)│         │ (Queue)  │     │
│  └──────────┘         └──────────┘         └──────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Webhook Routes** | Verify HMAC, extract payload, and enqueue BullMQ job. | Remix Resource Routes (`app/routes/webhooks.*.ts`). |
| **BullMQ Workers** | Execute the sync logic, handle retries, and rate limits. | Dedicated worker process (`app/worker.ts`). |
| **Sync Service** | The "Brain". Compares Shopify data to local DB, sanitizes handles, and performs the update. | `app/service/sync/` |
| **External Integrations** | Map unified data to KeyCRM/eSputnik schemas. | `app/service/keycrm/`, `app/service/esputnik/` |

## Architectural Patterns

### Pattern: Shopify as Master (Reconciliation)
**What:** The local database is a reflection of Shopify. Local changes are discouraged; Shopify is the source of truth.
**When to use:** All Shopify app integrations where Shopify handles the checkout/inventory.
**Trade-offs:** 
- (+) Simplifies conflict resolution (Shopify wins).
- (-) Requires robust webhook handling to avoid lag.

### Pattern: Handle Generation Service
**What:** A dedicated utility that takes a title and brand, strips the brand, and generates a valid Shopify handle.
**When to use:** When SEO or internal mapping requires specific handle formats.
**Example:**
```typescript
function sanitizeHandle(title: string, brand: string): string {
  const cleanTitle = title.replace(new RegExp(brand, 'gi'), '').trim();
  return slugify(cleanTitle, { lower: true, strict: true });
}
```

## Data Flow

### Update Request Flow
1. **User Edit**: Merchant changes product in Shopify.
2. **Webhook**: Shopify sends `products/update`.
3. **Queue**: Remix app validates HMAC and puts job in BullMQ.
4. **Worker**: Worker pulls job, fetches latest state from Shopify (to avoid stale webhook data).
5. **Reconcile**: Compare `updated_at`. If newer, proceed.
6. **Sanitize**: Clean handles, map fields.
7. **Local Write**: Prisma update call.
8. **Downstream**: Trigger KeyCRM/eSputnik updates if necessary.

## Anti-Patterns

### 1. Direct DB Write in Webhook Route
**What people do:** Updating the database directly inside the webhook HTTP handler.
**Why it's wrong:** If the DB update is slow, Shopify times out (5s) and retries the webhook, leading to duplicate processing.
**Instead:** Enqueue a background job and return `200 OK` immediately.

### 2. Missing `updated_at` Check
**What people do:** Blindly overwriting local data with the latest incoming webhook payload.
**Why it's wrong:** Out-of-order webhooks can cause a state from 5 minutes ago to overwrite a state from 1 minute ago.
**Instead:** Check if `incoming.updated_at > local.updated_at`.

---
*Architecture research for: Unified Sync*
