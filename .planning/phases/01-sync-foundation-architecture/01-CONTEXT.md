# Phase 01: Sync Foundation & Architecture - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary
Establish the core infrastructure and standardized patterns for bidirectional-aware synchronization between Shopify and the internal system. This phase delivers the "plumbing" and the "blueprints" that subsequent entity-specific phases (Products, Orders, Customers) will follow.
</domain>

<decisions>
## Implementation Decisions

### Core Sync Interface
- **Strict Abstract Class:** Enforce a standardized structure across all syncers (e.g., `BaseSyncer` class) to ensure consistency in reconciliation, update logic, and error handling.

### Webhook Processing Pattern
- **Entity-Specific Queues:** Utilize separate BullMQ queues for Products, Orders, and Customers to allow for independent scaling, rate-limiting, and isolation of failures.

### Background Reconciliation
- **Scheduled Full Sync:** Implement a mechanism to run a bulk reconciliation for all entities on a fixed schedule (e.g., daily) to catch missed webhooks and ensure long-term data integrity.

### Error & Visibility Strategy
- **Centralized Audit Log:** Record sync attempts, successes, and detailed error messages in a dedicated database table for visibility and troubleshooting.

### Claude's Discretion
- Determining the specific internal methods and state management within the `BaseSyncer` class.
- Configuring the optimal BullMQ retry backoff and concurrency settings based on Shopify's API limits.
</decisions>

<specifics>
## Specific Ideas
- No specific external references provided — follow standard patterns for Shopify App development with React Router 7 and BullMQ.
</specifics>

<deferred>
## Deferred Ideas
- None — discussion stayed within the architectural foundation of the phase.
</deferred>

---

*Phase: 01-sync-foundation-architecture*
*Context gathered: 2026-02-23*
