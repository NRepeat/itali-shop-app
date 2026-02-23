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

### Todos & Blockers
None.

## Session Continuity
- **Last Action**: Completed Phase 3 (Order & Customer Lifecycle) on 2026-02-23.
- **Next Step**: Audit milestone or start new milestone.
