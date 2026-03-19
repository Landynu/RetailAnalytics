---
description: RetailAnalytics project conventions for imports, file organization, code patterns, and tooling
globs:
alwaysApply: true
---

# Project Conventions

## Code Exploration — MANDATORY CartoGopher First

**ALWAYS use CartoGopher MCP tools as the primary code exploration method.** Do NOT use Grep, Glob, or Read for code discovery. CartoGopher saves 95-98% tokens vs reading files directly.

**Required workflow:**
1. `mcp__cartogopher__search` — find code by keyword/concept (replaces Grep)
2. `mcp__cartogopher__symbol` — look up functions, models by name (replaces Grep for definitions)
3. `mcp__cartogopher__related_to` — find code related to a symbol/file (replaces exploratory Glob)
4. `mcp__cartogopher__file_functions` — list functions in a file (replaces reading a whole file)
5. `mcp__cartogopher__slice` — read a specific function body (replaces Read with offset/limit)

**Only fall back to Read/Grep/Glob when:**
- Editing a file (need exact content for Edit tool)
- Reading non-code files (markdown, config, migrations)
- CartoGopher returns no results after trying multiple queries
- You need the full file content, not just a function or symbol

**Never use Grep/Glob for:** finding function definitions, understanding code flow, looking up imports, checking what a function does, or exploring relationships between files.

## File Organization
- App config in `main.wasp`, schema in `schema.prisma` (both at project root)
- Queries: `src/queries/{domain}.js` (14 modules: analytics, ordering, dailySalesAnalytics, globalSalesAnalytics, outOfStock, inventory, brandDistributor, pos, productCatalog, store, invitation, orderingHelpers, helpers, productAction)
- Actions: `src/actions/{domain}.js` (16 modules: analytics, brandDistributor, category, classification, inventory, inventoryLogs, invitation, menu, orderWorksheet, pos, product, productAction, productSync, s3, store, weeklySummary)
- Pages in `src/pages/` as PascalCase components
- Shared components in `src/components/`, base UI in `src/components/ui/`
- Cache layer in `src/cache/` (redis.js, utils.js, warmCache.js, index.js)
- Server-only code in `src/server/` (scraper, encryption)
- Services in `src/services/`, utilities in `src/lib/`

## Import Rules

### In .js/.jsx files:
- Wasp imports use `wasp/...` prefix (NOT `@wasp/...`)
  - `import { useQuery } from 'wasp/client/operations'`
  - `import { HttpError } from 'wasp/server'`
- Non-Wasp imports use relative paths (NOT `@src/...`)

### In main.wasp:
- Imports MUST use `@src/` prefix
  - `fn: import { getStoreAnalytics } from "@src/queries/analytics"`

## Client-Side Patterns
- Use `useQuery` for reactive data fetching
- Call actions directly with async/await
- Root component renders `<Outlet />` from react-router-dom

## Dependencies
- Install via `npm install`
- JavaScript project — use `.js` and `.jsx` extensions, no TypeScript
- Radix UI for accessible primitives, Tailwind CSS for styling
