---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
last_updated: "2026-03-04T13:25:22Z"
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 16
  completed_plans: 14
---

# Project State: Unified Sync & Update Logic

## Project Reference
**Core Value**: Reliable, bidirectional-aware synchronization where Shopify is the master.
**Current Focus**: Initializing project roadmap and state.

## Current Position
**Phase**: 05-email-improvements-and-frontend-fixes
**Plan**: 05-03 complete
**Status**: In Progress (3 of ~3 plans complete in phase 5)
**Progress**: [█████████████████░░░] Phase 5 in progress (14/16 plans)

## Performance Metrics
- **Requirements Mapped**: 9/9 (100%)
- **Phases Defined**: 4
- **Completed Phases**: 4

## Accumulated Context

### Key Decisions
- **Shopify as Master**: All sync logic must prioritize Shopify `updated_at` timestamps and data.
- **Asynchronous Processing**: All webhooks must be offloaded to BullMQ to avoid Shopify timeout issues.
- **Handle Collision Strategy**: SKU/ID suffix-based resolution implemented in Phase 2.
- **Metaobject Three-Step Lookup**: local DB -> Shopify -> create, with DB backfill on Shopify hit (quick-1).
- **Shopify-First Authority**: Removed local DB pre-check from ensureMetaobject; Shopify query is always first, local DB is write-through cache only (quick-2).
- **CAPABILITY_VIOLATION Strip-and-Retry**: productSet retries once with option-linked metafields removed when all userErrors are CAPABILITY_VIOLATION; mixed errors return null immediately (quick-3).
- **brandAliasMap for EA7**: cleanTitle strips both full manufacturer name and short alias (e.g. "EA7") via a static alias map, allowing "EA7 Emporio Armani" to remove both strings (quick-5).
- **Color-for-all Handles**: color slug insertion in buildHandle/buildNewHandle is unconditional; bc_product_related_article guard removed from updateProductHandles loop (quick-5).
- **Brand Slug Re-insertion**: buildHandle/buildNewHandle strip brand from seo_keyword then re-insert brand slug before model alongside color; handle format is now {category}-{brand}-{color}-{model} (quick-6).
- **Handle Insertion Guard**: brand+color insertion only fires when model slug IS found at end of handle; if model not in handle seo_keyword is left untouched to prevent appending (quick-7).
- **Brand Alias Deduplication**: buildHandle/buildNewHandle strip alias slugs (e.g. "ea7") from handle before inserting full brand slug, preventing ea7-ea7-emporio-armani duplicates (quick-8).
- **Parallel Handle Updates**: updateProductHandlesParallel splits all products into N batches and runs concurrently via Promise.all; dashboard button "Fix ALL Handles (10 parallel)" (quick-9).
- **Color Variant Stripping**: buildNewHandle strips all colorMapping values + variants (synij, bilyi, chornyi) before inserting canonical color, preventing synij+sinij duplicates (quick-10).
- **Parallel Title Updates**: updateProductTitlesParallel splits all products into N batches and runs concurrently via Promise.all; dashboard button "Fix ALL Titles (10 parallel)" mirrors the handles parallel pattern (quick-11).
- **Cyrillic EA7 and H'estia Aliases**: brandAliasMap extended with Cyrillic ЕА7 variants (U+0415 U+0410 7) for EA7 brands and three H'estia Venezia variants (no "di", straight + curly apostrophe) so cleanTitle strips brand noise from Cyrillic-script titles (quick-12).
- **Case-Insensitive Model Strip + SKU Double-Pass**: cleanTitle model regex uses "gi" flag (case-insensitive) to match uppercase article numbers stored as lowercase model; updateProductTitles adds a second cleanTitle pass using bc_product.sku when sku differs from model and contains digits (quick-13).
- **Feminine Color Slug Stripping**: buildNewHandle now strips both masculine (colorMapping values) and feminine adjective forms of Ukrainian color slugs before inserting canonical color, preventing duplicates like `fioletova-...-fioletovij` from women's seo_keywords (quick-14).
- **CONFIRMED vs INITIALIZED for keyCRM status 3**: keyCRM status 3 maps to CONFIRMED (not INITIALIZED) to prevent double-sending the order-created email that orders/create already fires as INITIALIZED (04-01).
- **OUT_OF_STOCK for keyCRM status 15**: keyCRM status 15 maps to OUT_OF_STOCK (not CANCELLED) so the out-of-stock case can have its own distinct email template (04-01).
- **EsputnikOrderStatus type import in keycrm.ts**: Using import type for Record annotation instead of inline string union ensures type stays in sync as the union grows (04-01).
- **Template 02 (confirmed) omits delivery/payment section**: Keeps confirmation email focused; delivery was already shown in template 01 (замовлення оформлено) (04-02).
- **Template 03 (shipped) uses single-column delivery + #if tracking guard**: Payment context is irrelevant after shipment; tracking number wrapped in #if guard for cases where it is absent (04-02).
- **Templates 04/06/07 section variants**: Template 04 omits delivery/payment (completed order summary only); template 06 omits totals (no purchase for out-of-stock); template 07 includes totals (order existed before cancellation) (04-03).
- **Recommendation block size() guard**: #if($data.get('recommendedItems') && $data.get('recommendedItems').size() > 0) guards recommendation section in templates 06 and 07 to handle empty engine response (04-03).
- **pickupAddress dynamic variable**: Template 05 uses $!data.get('pickupAddress') — store addresses are NOT hardcoded, passed dynamically from app event payload (04-03).
- **INITIALIZED fires on orders/create (not keyCRM)**: orders/create directly enqueues INITIALIZED, while keyCRM status 3 maps to CONFIRMED, preventing double order-created email (04-04).
- **PICKUP_ADDRESS_MAP intentionally empty at deploy**: keyCRM status IDs for READY_FOR_PICKUP stores are unknown until confirmed in admin panel; DEPLOYMENT BLOCKER comment documents all 4 store addresses to map (04-04).
- **Conditional spread for pickupAddress**: ...(pickupAddress && { pickupAddress }) omits the field entirely when map lookup returns undefined (04-04).
- **featuredImageUrl always used for email items**: variant images show incorrect product photo in email notification context; featured image is canonical (05-03).
- **trackingNumber in EsputnikOrderJobData alongside pickupAddress**: both are event-specific extras not in base Shopify order payload, passed through queue -> worker -> mapper extra param (05-03).

### Roadmap Evolution
- Phase 4 added: Create Sputnik email templates and update order event flows
- Phase 5 added: Email improvements and frontend fixes

### Todos & Blockers
None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | check metaobject upsert logic in productSet | 2026-02-23 | 118eeac | [1-check-metaobject-upsert-logic-in-product](./quick/1-check-metaobject-upsert-logic-in-product/) |
| 2 | make Shopify source of truth in ensureMetaobject | 2026-02-23 | 78c6f8d | [2-make-shopify-source-of-truth-in-ensureme](./quick/2-make-shopify-source-of-truth-in-ensureme/) |
| 3 | fix CAPABILITY_VIOLATION by stripping option-linked metafields | 2026-02-23 | d68788b | [3-fix-capability-violation-by-stripping-op](./quick/3-fix-capability-violation-by-stripping-op/) |
| 5 | fix EA7 title filtering and handle structure | 2026-02-25 | 68a4cc9 | [5-fix-ea7-title-filtering-and-handle-struc](./quick/5-fix-ea7-title-filtering-and-handle-struc/) |
| 6 | add manufacturer slug to product handles | 2026-02-25 | b608c2a | [6-add-manufacturer-slug-to-product-handles](./quick/6-add-manufacturer-slug-to-product-handles/) |
| 7 | fix handle insertion fallback when model slug not in handle | 2026-02-25 | 174ffb5 | [7-fix-handle-insertion-fallback-when-model](./quick/7-fix-handle-insertion-fallback-when-model/) |
| 8 | fix duplicate brand in handle when alias already in seo_keyword | 2026-02-25 | 54c20df | [8-fix-duplicate-brand-in-handle-when-alias](./quick/8-fix-duplicate-brand-in-handle-when-alias/) |
| 9 | run fix-handles in 10 parallel batches | 2026-02-25 | a8d4210 | [9-run-fix-handles-in-10-parallel-batches](./quick/9-run-fix-handles-in-10-parallel-batches/) |
| 10 | strip color slug variants from handle before canonical color insertion | 2026-02-25 | a4b15f4 | [10-strip-color-slug-variants-from-handle-be](./quick/10-strip-color-slug-variants-from-handle-be/) |
| 11 | add parallel 10-batch fix product titles | 2026-02-25 | eeb72fe | [11-add-parallel-10-batch-fix-product-titles](./quick/11-add-parallel-10-batch-fix-product-titles/) |
| 12 | fix cleanTitle — add Cyrillic EA7 and H'estia di Venezia aliases | 2026-02-25 | f69914b | [12-fix-cleantitle-add-cyrillic-ea7-aliases-](./quick/12-fix-cleantitle-add-cyrillic-ea7-aliases-/) |
| 13 | fix cleanTitle model SKU stripping: case-insensitive + sku double-pass | 2026-02-25 | 3fef875 | [13-fix-cleantitle-model-sku-stripping-make-](./quick/13-fix-cleantitle-model-sku-stripping-make-/) |
| 14 | fix handle duplicate colors add feminine Ukrainian color slug variants | 2026-02-25 | 205cb78 | [14-fix-handle-duplicate-colors-add-feminine](./quick/14-fix-handle-duplicate-colors-add-feminine/) |
## Session Continuity
- **Last Action**: 2026-03-04 - Executed plan 05-03: Fixed email domain (app.miomio.com.ua -> miomio.com.ua), switched to featuredImageUrl for email line-item images, added trackingNumber to queue interface and wired through worker to mapper
- **Stopped At**: Completed 05-03-PLAN.md
- **Next Step**: Phase 5 plans 01 and 02 remain (email template fixes, frontend fixes). DEPLOYMENT BLOCKER: populate PICKUP_ADDRESS_MAP in keycrm-shopify-sync.service.ts and configure Esputnik workflow automations before go-live.
