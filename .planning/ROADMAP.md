# Roadmap: Unified Sync & Update Logic

## Summary
Standardize the synchronization flow between Shopify and the internal system to ensure data consistency, reliable background processing, and clean URL handles.

## Phases
- [x] **Phase 1: Sync Foundation & Architecture** - Establish the unified sync patterns and webhook-to-worker infrastructure. (completed 2026-02-23)
- [ ] **Phase 2: Product & Handle Reconciliation** - Implement robust product updates, brand-stripped handle logic, and bulk reconciliation.
- [ ] **Phase 3: Order & Customer Lifecycle** - Extend the sync pattern to handle order status updates and customer profiles.

## Phase Details

### Phase 1: Sync Foundation & Architecture
**Goal**: Establish the unified sync patterns and infrastructure.
**Depends on**: Initial project setup (completed)
**Requirements**: CORE-01, CORE-02
**Success Criteria**:
  1. All incoming Shopify webhooks are pushed to BullMQ queues without processing in the request handler.
  2. A shared "Sync Service" interface exists and is ready for entity-specific implementations.
**Plans**: 3 plans
- [x] 01-sync-foundation-architecture-01-PLAN.md — Implement BaseSyncer Abstract Class and Centralized Sync Audit Log
- [x] 01-sync-foundation-architecture-02-PLAN.md — Configure BullMQ Queues, Sync Registry, and Centralized Worker
- [x] 01-sync-foundation-architecture-03-PLAN.md — Refactor Webhook Handlers for Queuing

### Phase 2: Product & Handle Reconciliation
**Goal**: Implement robust product updates and handle sanitization.
**Depends on**: Phase 1
**Requirements**: PROD-01, PROD-02, PROD-03, SYNC-01
**Success Criteria**:
  1. Updating a product title or price in Shopify triggers a local update that preserves source-of-truth integrity.
  2. Product handles are automatically stripped of brands and sanitized for ASCII-only characters.
  3. Handle collisions are automatically resolved using a SKU or ID suffix.
  4. A background reconciliation job can identify and fix drift between Shopify and local data.
**Plans**: TBD

### Phase 3: Order & Customer Lifecycle
**Goal**: Extend the sync pattern to orders and customers.
**Depends on**: Phase 2 (for pattern stability)
**Requirements**: ORD-01, ORD-02, CUST-01
**Success Criteria**:
  1. Order status changes (Paid, Fulfilled, Cancelled) in Shopify are reflected locally and in KeyCRM.
  2. Customer profile updates in Shopify are synced to the local database profile.
  3. Order mapping between systems is verifiable, with a mechanism to re-map or fix orphans.
**Plans**: TBD

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1: Foundation | 3/3 | Completed | 2026-02-23 |
| 2: Products | 3/3 | Completed | 2026-02-23 |
| 3: Orders/Cust | 0/1 | Not started | - |
