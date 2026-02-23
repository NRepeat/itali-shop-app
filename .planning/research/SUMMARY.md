# Research Summary: Unified Sync & Update Logic

**Project:** Unified Sync & Update Logic (itali-shop-app)
**Domain:** Shopify Data Synchronization
**Researched:** 2025-02-23
**Overall confidence:** HIGH

## Executive Summary

The research focused on establishing a robust, standardized synchronization pattern between Shopify and the `itali-shop-app` local infrastructure. The core challenge is ensuring that Shopify remains the absolute "Source of Truth" while handling complex logic like brand-stripped handles and downstream syncs to KeyCRM and eSputnik.

The recommended approach centers on an **asynchronous, reconciliation-based architecture**. By leveraging BullMQ for background processing and strictly enforcing `updated_at` timestamp checks, the system can avoid common pitfalls such as race conditions, sync loops, and rate-limit exhaustion. Standardizing these patterns across Products, Orders, and Customers will significantly reduce technical debt and improve data consistency.

## Key Findings

### Recommended Stack
- **Core:** Remix (React Router 7) with Shopify GraphQL API for high-efficiency data fetching.
- **Background:** BullMQ (Redis) for all synchronization tasks to handle Shopify's leaky-bucket rate limits gracefully.
- **Logic:** `slugify` for handle sanitization and `lodash` for deep object comparison to prevent "phantom updates."

### Expected Features
- **Unified Sync Pattern:** A reusable service layer for entity reconciliation.
- **Brand-Stripped Handles:** SEO-friendly handle generation with built-in collision detection.
- **Bidirectional Lifecycle Sync:** Tracking orders and customers throughout their entire lifecycle in Shopify.

### Critical Pitfalls
1. **Webhook Race Conditions:** Avoided by checking `updated_at` before every local write.
2. **Handle Collisions:** Stripping brands increases collision risk; a unique suffix (SKU/ID) or collision check is mandatory.
3. **API Rate Limiting:** BullMQ must be configured with rate-limiting aware of Shopify's headers.

## Implications for Roadmap

Based on research, the suggested phase structure is:

### Phase 1: Foundation & Standardization
**Rationale:** Establishing the unified patterns first avoids refactoring later.
**Delivers:** Core Sync Service, Webhook Router, and BullMQ infrastructure.
**Addresses:** Unified Sync Pattern.
**Avoids:** Synchronous Webhook Processing pitfall.

### Phase 2: Product Sync & Handle Cleanup
**Rationale:** Product data is the most complex and involves the brand-stripping requirement.
**Delivers:** Handle sanitization logic, product update reconciliation, and initial bulk sync.
**Addresses:** Brand-Stripped Handles, Product Update Logic.
**Avoids:** Handle Collision pitfall.

### Phase 3: Order & Customer Lifecycle
**Rationale:** Builds on the product foundation but adds status-tracking complexities.
**Delivers:** Order status sync (Paid, Fulfilled, Cancelled) and Customer mapping.
**Addresses:** Order Sync, Customer Sync.
**Avoids:** Stale status updates.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Based on Shopify official best practices and existing project tech. |
| Features | HIGH | Directly aligns with requirements and industry standards. |
| Architecture | HIGH | Proven "Asynchronous Reconciliation" pattern. |
| Pitfalls | HIGH | Well-documented community issues with clear mitigations. |

## Gaps to Address
- **Handle Collision Strategy:** Need to decide if the collision suffix should be a random string, a numeric counter, or a SKU.
- **KeyCRM API Limits:** Research into KeyCRM's specific rate limits is needed to ensure the background workers don't overwhelm it.

## Sources
- [Shopify Dev Docs: Webhooks](https://shopify.dev/docs/apps/build/webhooks)
- [Shopify Dev Docs: Rate Limits](https://shopify.dev/docs/api/usage/rate-limits)
- [BullMQ Documentation](https://docs.bullmq.io/)
