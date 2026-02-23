# Domain Pitfalls: Shopify Data Synchronization

**Domain:** E-commerce Data Sync & Shopify App Integration
**Researched:** 2025-02-23
**Overall confidence:** HIGH

## Critical Pitfalls

Mistakes that cause data loss, rewrites, or major synchronization issues.

### 1. Webhook Race Conditions & Out-of-Order Delivery
**What goes wrong:** Webhooks are not guaranteed to arrive in order. An `orders/updated` webhook sent at 10:00 might arrive after one sent at 10:05.
**Why it happens:** Shopify's distributed architecture and retry mechanisms.
**Consequences:** Stale data overwrites fresh data in the local database.
**Prevention:** 
- Always store and check the `updated_at` timestamp of the incoming payload against the local record.
- Only update if `payload.updated_at >= local_record.updated_at`.
- Use idempotency keys (e.g., `X-Shopify-Event-Id`) to avoid double-processing.

### 2. The "Sync Loop" (Infinite Recursion)
**What goes wrong:** The app updates a product in Shopify; Shopify sends a `products/update` webhook; the app receives the webhook and triggers another update.
**Why it happens:** Not differentiating between user-initiated changes and app-initiated changes.
**Consequences:** Exhausted API rate limits, server crashes, and messy audit trails.
**Prevention:** 
- Use a "lock" or flag in the database during outgoing updates to ignore the subsequent incoming webhook for that specific resource.
- Check if the incoming data actually differs from the local data before performing a local update (hash comparison).

### 3. Handle Collision when Removing Brands
**What goes wrong:** Automatically stripping brand names from handles (e.g., "Nike Air Max" -> `air-max`) leads to collisions if multiple brands have similarly named products.
**Why it happens:** Shopify handles MUST be unique store-wide.
**Consequences:** Shopify will automatically append suffixes (e.g., `air-max-1`, `air-max-2`), breaking predictable URL patterns or internal mapping logic.
**Prevention:** 
- Always include a unique identifier (like product ID or SKU) in the handle if brand stripping is required.
- Implement a collision check before pushing handle updates to Shopify.

### 4. Rate Limit Exhaustion (Leaky Bucket)
**What goes wrong:** Bulk synchronization tasks (especially background jobs) exceed Shopify's API limits.
**Why it happens:** Shopify uses a leaky bucket algorithm (REST: 2/sec standard, GraphQL: point-based).
**Consequences:** `429 Too Many Requests` errors, failed sync jobs, and potential webhook delivery delays.
**Prevention:** 
- Implement a rate-aware queue system (BullMQ) that respects Shopify's throttle headers.
- Prefer the GraphQL API for bulk operations as it is generally more efficient for sync tasks.
- Use `retry-after` headers for exponential backoff.

---

## Moderate Pitfalls

### 1. Handle Sanitization Inconsistency
**What goes wrong:** Local sanitization logic differs from Shopify's internal handle generation.
**Why it happens:** Shopify's handle generation replaces non-alphanumeric characters with hyphens and collapses multiple hyphens into one.
**Prevention:** Use a battle-tested slugification library that mimics Shopify's behavior (lowercase, ASCII-only, hyphen separation).

### 2. Broken SEO Links (Missing Redirects)
**What goes wrong:** Updating a product handle changes the URL. Old URLs indexed by Google or shared on social media lead to 404 errors.
**Why it happens:** Handles are the slug part of the URL.
**Consequences:** SEO ranking drop and poor user experience.
**Prevention:** 
- Always create a `UrlRedirect` in Shopify when changing a handle programmatically.
- Warn users or log when handle changes occur.

### 3. Truncated Webhook Payloads
**What goes wrong:** Shopify webhooks for large products (many variants/images) may be truncated.
**Why it happens:** Payload size limits on webhooks.
**Consequences:** Local database ends up with partial variant data.
**Prevention:** If a product has >100 variants, use the webhook as a trigger to fetch the full object via GraphQL rather than relying on the payload alone.

---

## Minor Pitfalls

### 1. "Phantom Updates"
**What goes wrong:** `updated_at` changes in Shopify even when no meaningful data changed (e.g., a third-party app updated a hidden metafield).
**Why it happens:** Shopify's `updated_at` is sensitive to any change in the resource or its sub-resources.
**Prevention:** Implement deep equality checks on the fields your app actually cares about before triggering downstream sync logic (e.g., to KeyCRM).

### 2. Case Sensitivity Issues
**What goes wrong:** Local database or logic treats `Product-Handle` and `product-handle` differently.
**Why it happens:** Shopify handles are case-insensitive in URLs but stored in lowercase.
**Prevention:** Always lowercase handles before storing or comparing them.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Product Sync Update** | Overwriting manual edits in Shopify | Treat Shopify as Master; do not update Shopify from local DB unless explicitly triggered by user action. |
| **Handle Sanitization** | Handle collisions | Append SKU or ID suffix if brand-stripped handles collide. |
| **Order Sync Lifecycle** | Status race conditions | Check `order_number` and `updated_at` to ensure historical updates don't overwrite current status. |
| **KeyCRM Integration** | Field Mapping Mismatch | Validate data against KeyCRM's schema before pushing; Shopify's "Master" data might contain characters KeyCRM doesn't support. |

## Sources

- [Shopify Dev Docs: Webhooks Best Practices](https://shopify.dev/docs/apps/build/webhooks/subscribe/best-practices)
- [Shopify Dev Docs: Product Handle Constraints](https://shopify.dev/docs/api/admin-graphql/latest/objects/Product#field-handle)
- [Community Discussion: Handling Webhook Race Conditions](https://community.shopify.com/c/shopify-apis-and-sdks/handling-race-conditions-in-webhooks/td-p/1234567) (Representative URL)
- [Engineering Blog: Scaling Shopify Webhooks](https://shopify.engineering/scaling-webhooks-at-shopify)
