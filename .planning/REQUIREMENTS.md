# Requirements: Unified Sync & Update Logic

## v1 Requirements

### Core Architecture (CORE)
- [ ] **CORE-01**: Unified Sync Service — Define a standardized interface/pattern for all sync operations (Products, Orders, Customers).
- [ ] **CORE-02**: Webhook-to-Worker Pattern — Ensure all incoming webhooks are offloaded to BullMQ for reliable processing.
- [ ] **SYNC-01**: Background Reconciliation — Implement a periodic "Bulk Sync" or reconciliation job to ensure 100% data consistency and catch missed webhooks.

### Product Synchronization (PROD)
- [ ] **PROD-01**: Product Update Logic — Implement robust update/upsert logic where Shopify is the absolute master, using `updated_at` timestamps to avoid race conditions.
- [ ] **PROD-02**: Handle Sanitization — Automatically remove brand names from handles and sanitize ASCII characters (spaces, ampersands, etc.).
- [ ] **PROD-03**: Handle Collision Detection — Implement a strategy (e.g., SKU suffix) to resolve handle collisions created by brand stripping.

### Order Synchronization (ORD)
- [x] **ORD-01**: Order Lifecycle Sync — Ensure orders are updated through all status changes (Created, Paid, Fulfilled, Cancelled) in the local system and downstream integrations.
- [ ] **ORD-02**: Mapping Reconciliation — Verify and fix order mapping between Shopify, local DB, and KeyCRM.

### Customer Synchronization (CUST)
- [ ] **CUST-01**: Customer Sync & Update — Ensure customer profiles are updated based on Shopify changes.

## v2 Requirements (Deferred)
- [ ] **Sync Audit Log UI**: A dashboard within the Shopify app to view sync history and errors.
- [ ] **Manual Drift Detection**: A tool to manually compare a specific entity between Shopify and local DB.
- [ ] **Automated URL Redirects**: Automatically creating Shopify redirects when handles are sanitized/changed.

## Out of Scope
- Real-time "Sync-Back" from local to Shopify (Shopify remains the master; edits should happen there).
- Full database migration or structural redesign.

## Traceability Matrix

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 1 | Pending |
| CORE-02 | Phase 1 | Pending |
| SYNC-01 | Phase 2 | Pending |
| PROD-01 | Phase 2 | Pending |
| PROD-02 | Phase 2 | Pending |
| PROD-03 | Phase 2 | Pending |
| ORD-01 | Phase 3 | Complete |
| ORD-02 | Phase 3 | Pending |
| CUST-01 | Phase 3 | Pending |

---
*Last updated: 2026-02-23*
