# RetailAnalytics

A full-stack retail inventory and analytics platform for multi-store dispensary chains built with the Wasp framework. Enables inventory management, sales tracking, purchase ordering, and advanced analytics.

## Tech Stack

- **Framework**: Wasp 0.20.1 (full-stack DSL for React/Node.js/Prisma)
- **Frontend**: React 19, Vite, TanStack React Table, Recharts, Radix UI, Tailwind CSS
- **Backend**: Node.js/Express
- **Database**: PostgreSQL with Prisma ORM
- **Caching**: Redis (ioredis)
- **Storage**: S3-compatible object storage (Railway)
- **Hosting**: Railway (PostgreSQL, Redis, S3, Node.js server)
- **Browser Automation**: Playwright (POS scraping)

## Project Structure

```
/src/
├── pages/              # React page components (auth-protected routes)
├── components/         # Reusable React components
│   └── ui/             # Base UI components (button, input, dialog, etc.)
├── server/             # Server-only code (scraper, encryption)
├── services/           # Business logic services
├── lib/                # Utility functions and hooks
├── apis/               # Custom HTTP API endpoints
├── middleware/         # Express middleware
├── actions.js          # Server-side write operations
├── queries.js          # Server-side read operations
├── cache.js            # Redis caching layer
├── queryClient.js      # TanStack Query config
├── serverSetup.js      # Express middleware setup
└── Layout.jsx          # Root layout component

/main.wasp              # Wasp app configuration (routes, queries, actions, jobs)
/schema.prisma          # Database schema (25 models)
```

## Key Features

- **Multi-store inventory management** with CSV upload support
- **POS integration** via Playwright scraping (Greenline, Dutchie, Cova)
- **Analytics dashboards** with sales trends, category breakdowns, temporal analysis
- **Smart ordering** with advanced filtering and order worksheets
- **Product enrichment** (categories, cannabinoid profiles, strain types)
- **Brand-distributor mapping** for purchasing workflows

## Architecture Patterns

### Data Flow
- **CQRS-style**: Queries for reads, Actions for writes (defined in main.wasp)
- **Automatic cache invalidation**: Wasp invalidates queries when actions modify entities
- **Redis caching**: Custom cache layer in `cache.js` for expensive queries

### Database
- PostgreSQL with Prisma relation mode
- Pre-aggregated weekly summaries for performance (WeeklySalesSummary, etc.)
- Compound indexes on common query patterns
- Cascade deletes for referential integrity

### Frontend
- TanStack Query for server state management
- localStorage for UI preferences (column ordering, visibility)
- Radix UI + Tailwind CSS for consistent styling
- Feature-based component organization

## Development

```bash
# Start development server (client + server)
wasp start

# Run database migrations
wasp db migrate-dev

# Open Prisma Studio
wasp db studio

# Local PostgreSQL (optional)
docker-compose up -d
```

## Environment Variables

Required in `.env.server`:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET` - Object storage
- `ENCRYPTION_KEY` - AES-256-GCM key for POS credential encryption

## Deployment (Railway)

The app is deployed on Railway with:
- PostgreSQL database
- Redis cache
- S3-compatible object storage
- Node.js server (Wasp build output)

Build command: `wasp build` generates full-stack app in `.wasp/build/`

## Scheduled Jobs

Defined in main.wasp using PgBoss:
- **scrapeAllPOSAccounts**: Daily POS data scraping (2 AM)
- **backfillWeeklySummaries**: Weekly summary aggregation

## Key Files

- [main.wasp](main.wasp) - App configuration, routes, queries, actions, jobs
- [schema.prisma](schema.prisma) - Database models (25 models)
- [src/actions.js](src/actions.js) - Server-side write operations (~4,100 lines)
- [src/queries.js](src/queries.js) - Server-side read operations (~3,400 lines)
- [src/cache.js](src/cache.js) - Redis caching layer with performance logging
- [src/server/scraper.js](src/server/scraper.js) - Playwright-based POS scraping
- [src/server/encryption.js](src/server/encryption.js) - AES-256-GCM encryption

## Conventions

- **Naming**: camelCase for JS, PascalCase for components/models, UPPERCASE for constants
- **Imports**: Wasp auto-generates imports from `wasp/client/operations` and `wasp/server`
- **Error handling**: Use `HttpError` from `wasp/server` with proper status codes
- **File organization**: Pages in `/pages`, reusable components in `/components/ui`
