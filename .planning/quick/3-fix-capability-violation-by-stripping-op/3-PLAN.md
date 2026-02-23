---
phase: quick-3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/service/shopify/products/api/create-shopify-product.ts
autonomous: true
requirements: [QUICK-3]

must_haves:
  truths:
    - "productSet succeeds on first attempt when no option-linked metafields are present"
    - "productSet auto-retries with offending metafields stripped when CAPABILITY_VIOLATION errors are present"
    - "If retry also fails, null is returned and the error is logged"
  artifacts:
    - path: "app/service/shopify/products/api/create-shopify-product.ts"
      provides: "CAPABILITY_VIOLATION retry logic in createProductAsynchronous"
      contains: "CAPABILITY_VIOLATION"
  key_links:
    - from: "createProductAsynchronous"
      to: "variables.productSet.metafields"
      via: "filter on parsed namespace+key from error messages"
      pattern: "Metafield Namespace.*Metafield Key"
---

<objective>
Auto-retry `productSet` after stripping option-linked metafields that trigger `CAPABILITY_VIOLATION`.

Purpose: Shopify rejects the entire `productSet` call when any metafield in the input is option-linked (e.g. `custom.rozmir`). The fix detects these errors, removes the offending metafields, and retries once so sync succeeds without manual intervention.
Output: Updated `createProductAsynchronous` with retry logic. No other files change.
</objective>

<execution_context>
@/Users/mnmac/.claude/get-shit-done/workflows/execute-plan.md
@/Users/mnmac/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@app/service/shopify/products/api/create-shopify-product.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add CAPABILITY_VIOLATION retry to createProductAsynchronous</name>
  <files>app/service/shopify/products/api/create-shopify-product.ts</files>
  <action>
After the first `client.request` call, where `userErrors.length > 0` currently logs and returns null, add the following logic BEFORE returning null:

1. Check if every error in `userErrors` has `code === "CAPABILITY_VIOLATION"` AND its `message` matches the pattern `Metafield Namespace: (\S+),\s*Metafield Key: (\S+)`.

2. If yes (all errors are option-linked metafield violations):
   - Parse each error message with the regex to extract `{ namespace, key }` pairs.
   - Build a Set of offending keys using the string `"${namespace}.${key}"` as the identifier.
   - Create a cleaned copy of `variables` where `variables.productSet.metafields` has those pairs filtered out. Do NOT mutate the original `variables` object.
   - Log: `[productSet] CAPABILITY_VIOLATION on option-linked metafields, stripping and retrying: ${JSON.stringify(offendingPairs)}`
   - Make a second `client.request` call with the cleaned variables using the same `accessToken` and `shopDomain`.
   - Log the retry response.
   - If the retry has no `userErrors`, return `retryRes.productSet?.product`.
   - If the retry also has `userErrors`, log them and fall through to return null.

3. If NOT all errors are CAPABILITY_VIOLATION (mixed errors), skip retry and return null as before.

The regex for parsing: `/Metafield Namespace: (\S+),\s*Metafield Key: (\S+)/`

Keep the existing try/catch wrapper intact. The retry call should be inside the same try block.

Comparison for filtering metafields: match on both `namespace` and `key` fields of `MetafieldInput`.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -20</automated>
    <manual>Trigger a sync on a product that has option-linked metafields (e.g. custom.rozmir). Confirm log shows "[productSet] CAPABILITY_VIOLATION on option-linked metafields, stripping and retrying" followed by a successful product set response (no userErrors on retry).</manual>
  </verify>
  <done>TypeScript compiles without errors. createProductAsynchronous retries once with option-linked metafields removed when all userErrors are CAPABILITY_VIOLATION. Mixed-error responses still return null immediately.</done>
</task>

</tasks>

<verification>
`npx tsc --noEmit` passes with no new errors.
The retry path is only taken when ALL userErrors are CAPABILITY_VIOLATION with a parseable namespace/key — mixed errors fall through unchanged.
</verification>

<success_criteria>
- `createProductAsynchronous` compiles cleanly
- On an all-CAPABILITY_VIOLATION response, offending metafields are stripped and the call is retried once
- On a successful retry, the product is returned (not null)
- On a failed retry or mixed errors, null is returned and errors are logged
</success_criteria>

<output>
After completion, create `.planning/quick/3-fix-capability-violation-by-stripping-op/3-SUMMARY.md` with what was changed, the retry logic pattern used, and any notable decisions.
</output>
