# Stack

## Primary Language
- TypeScript 5.9.3

## Runtime
- Node.js (>=20.19)

## Frameworks
- React Router 7 (Core)
- Shopify App React Router (Shopify Integration)

## Database
- Prisma ORM with dual clients:
  - PostgreSQL (Primary app DB)
  - MySQL (External integration DB)

## Background Jobs
- BullMQ (Redis-backed) with multiple dedicated workers (collection, price-notification, esputnik, keycrm).

## Frontend
- React 18
- Shopify Polaris
- Vite

## External Dependencies
- @sanity/client
- bullmq
- dotenv
