# Project State: Unified Sync & Update Logic

## Project Reference
**Core Value**: Reliable, bidirectional-aware synchronization where Shopify is the master.
**Current Focus**: Initializing project roadmap and state.

## Current Position
**Phase**: All phases complete (3/3)
**Plan**: N/A
**Status**: Milestone Complete
**Progress**: [████████████████████] 100%

## Performance Metrics
- **Requirements Mapped**: 9/9 (100%)
- **Phases Defined**: 3
- **Completed Phases**: 3

## Accumulated Context

### Key Decisions
- **Shopify as Master**: All sync logic must prioritize Shopify `updated_at` timestamps and data.
- **Asynchronous Processing**: All webhooks must be offloaded to BullMQ to avoid Shopify timeout issues.
- **Handle Collision Strategy**: SKU/ID suffix-based resolution implemented in Phase 2.
- **Metaobject Three-Step Lookup**: local DB -> Shopify -> create, with DB backfill on Shopify hit (quick-1).
- **Shopify-First Authority**: Removed local DB pre-check from ensureMetaobject; Shopify query is always first, local DB is write-through cache only (quick-2).

### Todos & Blockers
None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | check metaobject upsert logic in productSet | 2026-02-23 | 118eeac | [1-check-metaobject-upsert-logic-in-product](./quick/1-check-metaobject-upsert-logic-in-product/) |
| 2 | make Shopify source of truth in ensureMetaobject | 2026-02-23 | 78c6f8d | [2-make-shopify-source-of-truth-in-ensureme](./quick/2-make-shopify-source-of-truth-in-ensureme/) |

## Session Continuity
- **Last Action**: 2026-02-23 - Completed quick task 2: make Shopify source of truth in ensureMetaobject
- **Next Step**: Audit milestone or start new milestone.
