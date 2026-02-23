---
phase: 01-sync-foundation-architecture
plan: 02
subsystem: Sync Infrastructure
tags:
  - sync
  - bullmq
  - worker
  - queue
dependency_graph:
  requires:
    - BaseSyncer abstract class
    - SyncAuditLog model and service
  provides:
    - BullMQ queues for entities
    - Sync registry for topic-to-queue mapping
    - Centralized webhook worker
  affects:
    - All webhook handlers
tech_stack:
  added:
    - bullmq
  patterns:
    - "Topic-based routing to queues"
    - "Centralized worker for multiple queues"
key_files:
  created:
    - app/service/sync/queues.ts
    - app/service/sync/sync.registry.ts
    - app/webhook.worker.ts
  modified:
    - app/routes/webhooks.orders.cancelled.tsx
    - app/routes/webhooks.orders.create.tsx
    - app/routes/webhooks.orders.fulfilled.tsx
    - app/routes/webhooks.orders.paid.tsx
    - app/routes/webhooks.products.update.tsx
decisions: []
metrics:
  duration_seconds: 1200
  completed_at: 2026-02-23T14:30:00Z
---

# Phase 01 Plan 02: Configure BullMQ Queues, Sync Registry, and Centralized Worker Summary

**Objective:** Configured BullMQ queues for entity-specific synchronization, established a sync registry for topic-to-queue mapping, and created a centralized BullMQ worker to process these jobs. This plan establishes the crucial BullMQ queue and worker infrastructure for reliable asynchronous processing.

## Accomplishments

-   **BullMQ Queues**: Created `app/service/sync/queues.ts` to define and export BullMQ queues for `product`, `order`, and `customer` synchronization.
-   **Sync Registry**: Created `app/service/sync/sync.registry.ts` which provides a `getSyncQueue` function that maps incoming webhook topics to the correct BullMQ queue.
-   **Centralized Webhook Worker**: Implemented `app/webhook.worker.ts` with a BullMQ `Worker` that listens to all entity-specific sync queues. The worker is responsible for processing jobs from the queues and uses the `AuditService` to log job status.
-   **Webhook Handlers**: Refactored the webhook handlers for orders and products to use the new queuing system.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

All success criteria from the plan were met:
- `app/service/sync/queues.ts` exists and exports configured BullMQ queues.
- `app/service/sync/sync.registry.ts` exists and maps webhook topics to queues.
- `app/webhook.worker.ts` exists, listens to the sync queues, and logs job processing attempts using `AuditService`.
- The webhook handlers now push jobs to the queues instead of processing them directly.

The core BullMQ queuing and worker infrastructure is now functional.
