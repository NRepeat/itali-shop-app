# Stack Research: Shopify Data Synchronization

**Domain:** Shopify App Integration & Background Data Sync
**Researched:** 2025-02-23
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Remix (React Router 7)** | Latest | App Core | Standard for Shopify apps, excellent for both UI and API endpoints (webhooks). |
| **Prisma ORM** | Latest | Database Access | Already in use. Supports both PostgreSQL (App DB) and MySQL (External integration). |
| **BullMQ** | Latest | Background Processing | Reliable Redis-based queue. Essential for handling rate-limited Shopify API calls and long-running sync tasks. |
| **Shopify GraphQL API** | 2025-01 | Data Fetching/Updates | More efficient than REST for syncing large datasets; better rate limit management. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **slugify** | Latest | Handle Generation | Use for sanitizing product handles to ensure consistency with Shopify's expectations. |
| **lodash** | Latest | Data Comparison | Use `_.isEqual` or similar to detect "Phantom Updates" before processing. |
| **p-retry** | Latest | API Resilience | Exponential backoff for Shopify API calls when encountering 429s. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Shopify CLI** | Local Dev | Used for tunnel generation and app management. |
| **Redis** | Job Queue | Required backend for BullMQ. |

## Installation

```bash
# Core
npm install @shopify/shopify-api @shopify/app-bridge-react bullmq prisma

# Supporting
npm install slugify lodash p-retry

# Dev dependencies
npm install -D @types/lodash
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **BullMQ** | In-memory Queue | Never for Shopify sync. Webhooks need persistent storage to handle retries and crashes. |
| **GraphQL API** | REST Admin API | Use REST only for specific endpoints not yet available in GraphQL (rare in 2025). |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Synchronous Webhook Processing** | Shopify times out after 5s; slow processing causes missed webhooks. | **BullMQ / Background Workers** |
| **Local-first state** | Creates "Split Brain" issues where Shopify and DB disagree. | **Shopify-first (Master) state** |

## Sources

- [Shopify Dev Docs: Rate Limits](https://shopify.dev/docs/api/usage/rate-limits)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Context7: @shopify/shopify-api]
