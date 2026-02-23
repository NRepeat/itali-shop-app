# Project State: Unified Sync & Update Logic

## Project Reference
**Core Value**: Reliable, bidirectional-aware synchronization where Shopify is the master.
**Current Focus**: Initializing project roadmap and state.

## Current Position
**Phase**: Phase 1 (Sync Foundation & Architecture)
**Plan**: N/A
**Status**: Phase Complete
**Progress**: [████████████░░░░░░░░] 66%

## Performance Metrics
- **Requirements Mapped**: 9/9 (100%)
- **Phases Defined**: 3
- **Completed Phases**: 1

## Accumulated Context

### Key Decisions
- **Shopify as Master**: All sync logic must prioritize Shopify `updated_at` timestamps and data.
- **Asynchronous Processing**: All webhooks must be offloaded to BullMQ to avoid Shopify timeout issues.

### Todos & Blockers
- [ ] Approve Phase 2 plan (Next step)
- [ ] Determine collision strategy for handles (SKU-based vs Counter-based)

## Session Continuity
- **Last Action**: Completed Phase 1.
- **Next Step**: Start Planning Phase 2.
