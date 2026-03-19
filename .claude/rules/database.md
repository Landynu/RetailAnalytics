---
description: Database operations, schema, and migration patterns for RetailAnalytics
globs: ["**/*.prisma", "**/queries/*.js", "**/actions/*.js"]
alwaysApply: false
---

# Database & Operations

## Schema (schema.prisma)
- Models defined in `schema.prisma` at project root, NOT in main.wasp
- PostgreSQL provider (supports enums, jsonb, PgBoss jobs)
- After schema changes: run `wasp db migrate-dev "description"` or `/db-migrate`
- All IDs: `String @id @default(uuid())`

## Key Models
- Store, Product, InventorySnapshot, WeeklySalesSummary
- Brand, Distributor, BrandDistributor (purchasing relationships)
- CategoryDefinition, Subcategory (product classification)
- User, Invitation (multi-tenant auth)
- POSAccount, POSCredential (scraper integration)

## Operations (Queries & Actions)
- Declared in main.wasp, queries in `src/queries/{domain}.js`, actions in `src/actions/{domain}.js`
- All required entities must be listed in `entities: [...]` in main.wasp
- Use `context.entities.Model` for database access (Prisma client)

## Performance Patterns
- Pre-aggregated `WeeklySalesSummary` for fast analytics queries
- Compound indexes on common query patterns (storeId + date combinations)
- Redis caching layer in `src/cache/` for expensive analytics queries
- Cache pattern: `getCached(key) → timedQuery() on miss → setCached(key, data, ttl)`

## Error Handling
- 401 for unauthenticated: `if (!context.user) throw new HttpError(401)`
- `import { HttpError } from 'wasp/server'`

## Client Usage
- Queries: `const { data, isLoading } = useQuery(myQuery, args)`
- Actions: `await myAction(args)` (direct call, no hook needed)
