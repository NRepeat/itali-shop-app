# Quality

## Conventions
- **Naming:** camelCase for functions/variables, PascalCase for React components, and dot-notation for route filenames (e.g., `app.customers.tsx`).
- **Linting:** ESLint with `eslint:recommended`, `@typescript-eslint/recommended`, and `react` plugins.
- **Path Aliases:** Uses `@shared/*` for internal library references.

## Testing
- **Framework:** Vitest is used for Shopify extensions.
- **Organization:** Tests are located in `extensions/*/tests/`.
- **Patterns:** Uses fixtures and unit tests for discount functions and logic.
