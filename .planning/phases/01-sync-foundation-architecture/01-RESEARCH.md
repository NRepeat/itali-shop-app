# Phase 1: Sync Foundation & Architecture - Research

**Researched:** 2026-02-23
**Domain:** Shopify Sync Infrastructure & Patterns
**Confidence:** HIGH

## Summary
The project currently uses React Router 7 and has BullMQ installed, but lacks a unified synchronization pattern. Webhooks are currently processed synchronously in some handlers, risking Shopify timeout errors (5s limit). This phase will establish a robust, asynchronous architecture using a unified `BaseSyncer` abstract class and entity-specific BullMQ queues for Products, Orders, and Customers.

**Primary recommendation:** Transition all webhook handlers to a "receive and defer" pattern using BullMQ, and implement a `BaseSyncer` abstract class to enforce consistency across all entity types.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Strict Abstract Class:** Enforce a standardized structure across all syncers (e.g., `BaseSyncer` class) to ensure consistency in reconciliation, update logic, and error handling.
- **Entity-Specific Queues:** Utilize separate BullMQ queues for Products, Orders, and Customers to allow for independent scaling and failure isolation.
- **Scheduled Full Sync:** Implement a mechanism to run a bulk reconciliation for all entities on a fixed schedule (e.g., daily).
- **Centralized Audit Log:** Record sync attempts, successes, and detailed error messages in a dedicated database table.

### Claude's Discretion
- Determining the specific internal methods and state management within the `BaseSyncer` class.
- Configuring the optimal BullMQ retry backoff and concurrency settings.

### Deferred Ideas (OUT OF SCOPE)
- Sync Audit Log UI (Deferred to v2).
- Manual Drift Detection (Deferred to v2).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CORE-01 | Unified Sync Service | Identified Abstract Class pattern and directory structure for implementations. |
| CORE-02 | Webhook-to-Worker Pattern | Verified existing BullMQ setup and identified necessary changes to webhook routes. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| BullMQ | ^5.65.1 | Background job processing | High-performance, Redis-backed, supports retries and concurrency. |
| ioredis | Latest | Redis client | Required for BullMQ; handles connection pooling. |
| Prisma | ^6.16.3 | Database ORM | Already used in project for session storage; perfect for Audit Logs. |

## Architecture Patterns

### Recommended Project Structure
```
app/
├── service/
│   ├── sync/
│   │   ├── base.syncer.ts      # The Abstract Base Class
│   │   ├── sync.registry.ts    # Maps entity types to their syncers
│   │   ├── products/           # Product-specific implementation
│   │   ├── orders/             # Order-specific implementation
│   │   └── customers/          # Customer-specific implementation
├── workers/
│   ├── webhook.worker.ts       # Unified or split workers for BullMQ
```

### Pattern 1: BaseSyncer Abstract Class
**What:** A TypeScript abstract class defining the lifecycle of a sync operation.
**Example:**
```typescript
export abstract class BaseSyncer<TPayload> {
  abstract readonly queueName: string;
  
  async handleWebhook(payload: TPayload): Promise<void> {
    const timestamp = (payload as any).updated_at;
    if (await this.isStale(timestamp)) return;
    await this.process(payload);
  }

  abstract process(payload: TPayload): Promise<void>;
  abstract reconcile(): Promise<void>;
  protected abstract isStale(timestamp: string): Promise<boolean>;
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retries | Custom loop | BullMQ Retries | Handles exponential backoff and failed states automatically. |
| Concurrency | Manual semaphore | BullMQ Concurrency | Prevents hitting Shopify API rate limits (Leaky Bucket). |
| Scheduling | `setInterval` | BullMQ Repeatable Jobs | Persists across restarts; manageable via dashboard. |

## Common Pitfalls

### Pitfall 1: Webhook Timeout
**What goes wrong:** Shopify expects a 200 OK within 5 seconds. If sync logic takes longer, Shopify retries and eventually drops the webhook.
**How to avoid:** The webhook route MUST only validate the signature and push to BullMQ, then return `new Response(null, { status: 200 })` immediately.

### Pitfall 2: Race Conditions
**What goes wrong:** An old webhook arrives after a newer one, overwriting fresh data.
**How to avoid:** Always compare the `updated_at` timestamp in the payload with the local record's timestamp.

## Code Examples

### Webhook Route Pattern (Verified for RR7)
```typescript
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, payload, shop } = await authenticate.webhook(request);
  // PUSH TO QUEUE IMMEDIATELY
  await syncQueue.add(topic, { payload, shop });
  return new Response(null, { status: 200 });
};
```

## Validation Architecture
- **Framework:** Vitest (already present in extensions, should be used for core).
- **Test Type:** Unit tests for `BaseSyncer` logic and Integration tests for Queue-to-Worker flow.

## Sources
- **Official BullMQ Docs**: Queue and Worker configuration.
- **Shopify API Documentation**: Webhook timeout and retry policies.
- **Project Files**: `app/shopify.server.ts`, `app/worker.ts`, `package.json`.
