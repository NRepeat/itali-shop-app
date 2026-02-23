# Feature Research: Unified Sync & Update Logic

**Domain:** Shopify Data Synchronization
**Researched:** 2025-02-23
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Initial Bulk Sync** | Hydrate local DB with existing Shopify data. | MEDIUM | Needs to handle pagination and rate limits. |
| **Real-time Webhook Sync** | Local DB stays updated as Shopify changes. | MEDIUM | Must handle out-of-order delivery. |
| **Manual Sync Trigger** | Ability for admin to force a refresh of a specific entity. | LOW | Useful for debugging or manual reconciliation. |
| **Error Logging** | Visibility into why a sync job failed. | LOW | Essential for support. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Brand-Stripped Handles** | Cleaner SEO and consistent internal mapping. | MEDIUM | Risk of collisions must be managed. |
| **Unified Sync Pattern** | Identical logic for Products, Orders, and Customers. | HIGH | Improves maintainability and reduces bugs. |
| **Bidirectional Awareness** | Correctly handling "Shopify as Master" vs local edits. | MEDIUM | Prevents data loss from accidental overwrites. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Instant Sync-Back** | Want local edits to instantly push to Shopify. | Creates sync loops and breaks "Shopify as Master" rule. | Shopify should always be edited directly; App should react to changes. |
| **Full Entity Overwrite** | Simple "replace all" logic. | Destroys local-only metadata (e.g. tracking IDs from KeyCRM). | **Partial Patching**: Only update fields that changed in Shopify. |

## Feature Dependencies

```
[Initial Bulk Sync]
    └──requires──> [Rate-Limited API Client]

[Real-time Webhook Sync]
    └──requires──> [Background Job Queue (BullMQ)]

[Brand-Stripped Handles]
    └──requires──> [Collision Detection Logic]
```

## MVP Definition

### Launch With (v1 - Standardization)
- [ ] **Core Sync Service**: Unified interface for syncing entities.
- [ ] **Product Update Logic**: Handle `products/update` with `updated_at` checks.
- [ ] **Handle Sanitizer**: Logic to remove brands and clean ASCII.

### Add After Validation (v1.1 - Extended Entities)
- [ ] **Order Lifecycle Sync**: Tracking orders from created -> paid -> fulfilled.
- [ ] **Customer Reconciliation**: Mapping Shopify customers to local records reliably.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Product Sync Updates | HIGH | MEDIUM | P1 |
| Handle Sanitization | MEDIUM | MEDIUM | P1 |
| Unified Sync Pattern | HIGH | HIGH | P1 |
| Order Sync Updates | HIGH | MEDIUM | P2 |
| Customer Sync Updates | MEDIUM | MEDIUM | P2 |

---
*Feature research for: Unified Sync*
