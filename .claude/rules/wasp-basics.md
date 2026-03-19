---
description: Wasp 0.21 framework core concepts for RetailAnalytics
globs:
alwaysApply: true
---

# Wasp Framework Basics

Wasp is a declarative DSL that generates React (frontend), Node.js (backend), and Prisma (database) code.

## Key Files
- `main.wasp` — Central config (~607 lines)
- `schema.prisma` — Database models (~480 lines, ~25 models, PostgreSQL)
- `src/` — Application source

## Config Structure (main.wasp)
- `app` declaration: version, title, auth config, db seeds, email sending
- `route`/`page` pairs for each view
- `query`/`action` for operations (reference entities for data access)
- `job` for PgBoss background jobs
- `api`/`apiNamespace` for custom HTTP endpoints

## Operations Pattern
- Declare in main.wasp with `entities: [...]` listing ALL models the operation accesses
- Implement queries in `src/queries/{domain}.js`, actions in `src/actions/{domain}.js`
- Error handling: `import { HttpError } from 'wasp/server'`
- Auth guard: `if (!context.user) { throw new HttpError(401) }`

## IDs
All Prisma models use `String @id @default(uuid())`. Never use Int autoincrement.

## Type Resolution
If imports break after changing main.wasp or schema.prisma, restart `wasp start`.

## Scheduled Jobs
- `scrapeAllPOSAccounts` — Daily POS data scraping (2 AM)
- `backfillWeeklySummaries` — Weekly summary aggregation
