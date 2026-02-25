---
phase: quick-11
plan: 11
type: execute
wave: 1
depends_on: []
files_modified:
  - app/service/sync/products/update-product-titles.ts
  - app/routes/app._index.tsx
autonomous: true
requirements: [QUICK-11]

must_haves:
  truths:
    - "updateProductTitlesParallel splits all active products into N batches and runs updateProductTitles concurrently"
    - "Dashboard Fix Product Titles section has a 'Fix ALL Titles (10 parallel)' button"
    - "Clicking the button submits action 'fix-titles-parallel' with batches: '10'"
    - "action handler routes 'fix-titles-parallel' to updateProductTitlesParallel and returns logs"
  artifacts:
    - path: "app/service/sync/products/update-product-titles.ts"
      provides: "updateProductTitlesParallel export"
      exports: ["updateProductTitles", "updateProductTitlesParallel"]
    - path: "app/routes/app._index.tsx"
      provides: "fix-titles-parallel action branch and dashboard button"
      contains: "fix-titles-parallel"
  key_links:
    - from: "app/routes/app._index.tsx"
      to: "updateProductTitlesParallel"
      via: "import and action branch"
      pattern: "updateProductTitlesParallel"
---

<objective>
Add `updateProductTitlesParallel` to `update-product-titles.ts` mirroring the existing `updateProductHandlesParallel` pattern, wire a new action branch in the dashboard, and add a "Fix ALL Titles (10 parallel)" button next to the existing title buttons.

Purpose: Titles fix is slow when run sequentially over thousands of products; 10-batch parallel execution matches the already-proven handles approach.
Output: New exported function + dashboard button that triggers it.
</objective>

<execution_context>
@/Users/mnmac/.claude/get-shit-done/workflows/execute-plan.md
@/Users/mnmac/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@app/service/sync/products/update-product-titles.ts
@app/service/sync/products/update-product-handles.ts
@app/routes/app._index.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add updateProductTitlesParallel to update-product-titles.ts</name>
  <files>app/service/sync/products/update-product-titles.ts</files>
  <action>
    Append `updateProductTitlesParallel` to the end of `app/service/sync/products/update-product-titles.ts`.
    Model it exactly after `updateProductHandlesParallel` in `update-product-handles.ts`:

    ```ts
    export async function updateProductTitlesParallel(
      accessToken: string,
      shopDomain: string,
      batchCount = 10,
    ): Promise<{ logs: string[]; updated: number; skipped: number; errors: number }> {
      const total = await externalDB.bc_product.count({ where: { status: true } });
      const batchSize = Math.ceil(total / batchCount);

      const batches = Array.from({ length: batchCount }, (_, i) => ({
        offset: i * batchSize,
        limit: batchSize,
      }));

      const results = await Promise.all(
        batches.map(({ offset, limit }) =>
          updateProductTitles(accessToken, shopDomain, limit, offset),
        ),
      );

      const allLogs: string[] = [`Running ${batchCount} parallel batches over ${total} products (${batchSize} each)`];
      let updated = 0;
      let skipped = 0;
      let errors = 0;

      for (const [i, result] of results.entries()) {
        allLogs.push(`\n--- Batch ${i + 1} ---`);
        allLogs.push(...result.logs);
        updated += result.updated;
        skipped += result.skipped;
        errors += result.errors;
      }

      allLogs.push(`\n=== Total (${batchCount} parallel batches) ===`);
      allLogs.push(`Updated: ${updated}`);
      allLogs.push(`Skipped: ${skipped}`);
      allLogs.push(`Errors: ${errors}`);

      return { logs: allLogs, updated, skipped, errors };
    }
    ```

    The `externalDB` import already exists at the top of the file. No other changes.
  </action>
  <verify>
    <automated>cd /Users/mnmac/Development/itali-shop-app && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>updateProductTitlesParallel is exported from update-product-titles.ts and TypeScript compiles without errors.</done>
</task>

<task type="auto">
  <name>Task 2: Wire action branch and dashboard button in app._index.tsx</name>
  <files>app/routes/app._index.tsx</files>
  <action>
    Two changes to `app/routes/app._index.tsx`:

    **1. Import** — update the existing import line for `updateProductTitles` to also import `updateProductTitlesParallel`:
    ```ts
    import { updateProductTitles, updateProductTitlesParallel } from "@/service/sync/products/update-product-titles";
    ```

    **2. Action branch** — add a new `else if` branch immediately after the existing `"fix-titles"` branch (around line 123):
    ```ts
    } else if (body.action === "fix-titles-parallel") {
      const batches = body.batches ? Number(body.batches) : 10;
      const result = await updateProductTitlesParallel(
        session.accessToken!,
        session.shop,
        batches,
      );
      logs = result.logs;
    }
    ```

    **3. Dashboard button** — inside the `<s-section heading="Fix Product Titles (Remove Brand)">` JSX block, add a third button after the existing "Fix ALL Titles" button:
    ```tsx
    <s-button
      variant="primary"
      tone="critical"
      onClick={() => fetcher.submit({ action: "fix-titles-parallel", batches: "10" }, { method: "post", encType: "application/json" })}
      disabled={isLoading || undefined}
    >
      {isLoading && fetcher.json?.action === "fix-titles-parallel"
        ? "Fixing (10 workers)..."
        : "Fix ALL Titles (10 parallel)"}
    </s-button>
    ```

    No other changes. Follow the exact same pattern as the existing "Fix ALL Handles (10 parallel)" button.
  </action>
  <verify>
    <automated>cd /Users/mnmac/Development/itali-shop-app && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    - `updateProductTitlesParallel` imported in app._index.tsx
    - `fix-titles-parallel` action branch present in the action function
    - "Fix ALL Titles (10 parallel)" button rendered in the Fix Product Titles section
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
After both tasks:
- `grep -n "fix-titles-parallel" /Users/mnmac/Development/itali-shop-app/app/routes/app._index.tsx` shows 3 hits (import area, action branch, button onClick)
- `grep -n "updateProductTitlesParallel" /Users/mnmac/Development/itali-shop-app/app/service/sync/products/update-product-titles.ts` shows the export
- `npx tsc --noEmit` exits 0
</verification>

<success_criteria>
- `updateProductTitlesParallel` exported from `update-product-titles.ts`, splits all active products into `batchCount` batches, runs concurrently via `Promise.all`, aggregates logs/counts
- Dashboard "Fix Product Titles" section has the new parallel button alongside the existing sequential buttons
- All TypeScript types check clean
</success_criteria>

<output>
After completion, create `.planning/quick/11-add-parallel-10-batch-fix-product-titles/11-SUMMARY.md`
</output>
