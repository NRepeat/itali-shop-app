# Project: Unified Sync & Update Logic

## Vision
Refine and standardize the synchronization logic between Shopify and the internal system (including external integrations like KeyCRM and eSputnik). Ensure that Shopify remains the absolute source of truth and that all entities (Products, Orders, Customers) are correctly updated when changed in Shopify, rather than just being created initially.

## Core Value
Reliable, bidirectional-aware synchronization where Shopify is the master, ensuring data consistency across all integrated platforms.

## Requirements

### Validated (Existing)
- ✓ **Shopify App Integration:** Built on React Router 7 (Remix core) with Shopify App Bridge.
- ✓ **Dual Database Support:** Prisma ORM managing both PostgreSQL (Primary) and MySQL (External).
- ✓ **Background Processing:** BullMQ system for handling asynchronous jobs (Orders, Collections, Prices).
- ✓ **External Integrations:** Existing service layers for KeyCRM and eSputnik.

### Active (Hypotheses)
- [ ] **Unified Sync Pattern:** Define and implement a standardized sync flow that can be applied to Products, Orders, and Customers.
- [ ] **Product Sync Update Logic:** Implement logic to update existing products based on Shopify changes, ensuring Shopify is the source of truth.
- [ ] **Product Handle Sanitization:** Update handle generation to remove brand names and sanitize ASCII characters (spaces, ampersands, etc.).
- [ ] **Order Sync & Update Logic:** Ensure orders are updated throughout their lifecycle (not just on creation).
- [ ] **Customer Sync & Update Logic:** Ensure customer data remains in sync with Shopify Master records.

### Out of Scope
- Migrating to a different framework or ORM.
- Redesigning the core UI/UX of the Shopify App (unless required for sync visibility).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Shopify Master | The user explicitly requested that Shopify data should always take precedence over local data. | Pending |
| Product Handle Cleanup | Branding in handles and non-ASCII characters cause issues in downstream systems or SEO. | Pending |
| Unified vs. Separate Flows | User is open to unification if it improves maintainability, otherwise separation is fine. | Pending |

## Context
The project is a brownfield Shopify App integration. It currently handles creation of various entities but lacks robust update/reconciliation logic. The system uses a service-based architecture with BullMQ for background tasks.

---
*Last updated: 2026-02-23 after initialization*
