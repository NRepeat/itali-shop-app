# itali-shop-app

Shopify Remix backend app for italishop. Handles KeyCRM order sync, eSputnik email events, Google Merchant feed, NovaPay/NovaPoshta integration, product sync.

## Sister project: storefront

Next.js 15 storefront lives at `/Users/mnmac/Development/nnshop`.

When working on cross-cutting concerns (product data, availability, pricing, JSON-LD vs Merchant feed, structured data, SEO, cache revalidation webhooks), check both repos before changing logic in only one.

Known cross-repo invariants to keep aligned:
- **Availability**: feed (`app/service/google-merchant/*`) and storefront JSON-LD (`nnshop/src/shared/lib/seo/jsonld/product.ts`) must agree. Storefront uses `availableForSale` (no qty check); feed must match.
- **Discount**: `znizka` metafield drives sale price in both feed and storefront ProductCard.
- **Revalidation**: Shopify webhooks here trigger Next.js cache invalidation in nnshop.

## Production server

SSH: `ssh root@157.180.38.154` (hostname: `office`)

App lives at `/root/itali-shop-app` (cloned from origin/main). Compose stack via `docker-compose.yaml`:
- `itali-shop-app` — Remix app (port 3005→3000)
- `itali-worker-sync` — runs `app/worker.ts` (product sync + **google-merchant** worker)
- `itali-worker-keycrm-order`, `itali-worker-esputnik-order`, `itali-worker-webhook`, `itali-worker-collection`, `itali-worker-price-notification`, `itali-worker-liqpay-capture`
- `italy-db` (postgres:16-alpine), `itali-redis` (valkey:8-alpine)

### Deploy

```sh
ssh root@157.180.38.154 "cd /root/itali-shop-app && git pull && docker compose up -d --build"
```

Targeted rebuild (e.g. only app + sync worker after google-merchant change):
```sh
ssh root@157.180.38.154 "cd /root/itali-shop-app && git pull && docker compose up -d --build app worker-sync"
```

`make` targets exist on server: `make up-build`, `make logs`, `make logs-app`, `make logs-workers`.
