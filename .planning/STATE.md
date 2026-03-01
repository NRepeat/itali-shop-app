# Project State: Unified Sync & Update Logic

## Project Reference
**Core Value**: Reliable, bidirectional-aware synchronization where Shopify is the master.
**Current Focus**: Initializing project roadmap and state.

## Current Position
**Phase**: All phases complete (3/3)
**Plan**: N/A
**Status**: Milestone Complete
**Progress**: [████████████████████] 100%

## Performance Metrics
- **Requirements Mapped**: 9/9 (100%)
- **Phases Defined**: 3
- **Completed Phases**: 3

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

### Roadmap Evolution
- Phase 4 added: Create Sputnik email templates and update order event flows

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
- **Last Action**: 2026-02-25 - Executed quick task 14: fix handle duplicate colors — add feminine Ukrainian color slug variants
- **Next Step**: Ready for next task.
