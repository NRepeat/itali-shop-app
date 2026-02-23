# Architecture

## Pattern
Layered Service Architecture with Background Workers.

## Layers
- **Routes (`app/routes/`):** Handles UI views, API endpoints, and Shopify webhooks.
- **Services (`app/service/`):** Contains domain logic for Shopify, KeyCRM, eSputnik, and Italy-specific integrations.
- **Workers (`app/` and `app/service/`):** Asynchronous processing for orders and price tracking using BullMQ.
- **Data Access:** Shared Prisma clients (`app/shared/lib/prisma/prisma.server.ts`) for primary and external databases.

## Key Flow
Shopify Webhooks -> Route Handlers -> Service Logic -> BullMQ Job -> Worker Processing -> Database/External API Update.
