# Project State: Unified Sync & Update Logic

## Project Reference
**Core Value**: Reliable, bidirectional-aware synchronization where Shopify is the master.
**Current Focus**: Initializing project roadmap and state.

## Current Position
**Phase**: Phase 0 (Initialization)
**Plan**: N/A
**Status**: Roadmap Created
**Progress**: [░░░░░░░░░░░░░░░░░░░░] 0%

## Performance Metrics
- **Requirements Mapped**: 9/9 (100%)
- **Phases Defined**: 3
- **Completed Phases**: 0

## Accumulated Context

### Key Decisions
- **Shopify as Master**: All sync logic must prioritize Shopify `updated_at` timestamps and data.
- **Asynchronous Processing**: All webhooks must be offloaded to BullMQ to avoid Shopify timeout issues.

### Todos & Blockers
- [ ] Approve Phase 1 plan (Next step)
- [ ] Determine collision strategy for handles (SKU-based vs Counter-based)

## Session Continuity
- **Last Action**: Created ROADMAP.md and STATE.md.
- **Next Step**: Start Planning Phase 1.
