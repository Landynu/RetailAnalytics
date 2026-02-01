# RetailAnalytics Documentation

## Architecture

Technical documentation about system design and implementation patterns.

- [Summary Tables](architecture/summary-tables.md) - Pre-aggregated weekly summaries for fast analytics queries
- [Pagination](architecture/pagination.md) - Ordering dashboard pagination and lazy loading implementation
- [Ordering Components](architecture/ordering-components.md) - Drag-and-drop column reordering and component structure
- [Bundle Optimization](architecture/bundle-optimization.md) - React Query and Vite bundle optimization
- [Query Selection](architecture/query-selection.md) - Automatic daily vs weekly query selection based on date range

## Features

User-facing feature documentation and implementation details.

- [Distributor Mapping](features/distributor-mapping.md) - Brand-to-distributor mapping setup and usage
- [Ordering Filters](features/ordering-filters.md) - Apply/Cancel filter behavior and content-aware filtering
- [Date Range Filters](features/date-range-filters.md) - Relative vs fixed date range handling
- [Ordering Loading](features/ordering-loading.md) - Loading overlay and UX improvements

## Deployment

Production deployment and operations guides.

- [Connection Pool](deployment/connection-pool.md) - PostgreSQL connection pool configuration for Railway

## Roadmap

Future development plans and integration specifications.

- [Integration Roadmap](roadmap/integration-roadmap.md) - Greenline POS and Legacy Supply integration plan
- [Week 1 Testing](roadmap/week1-testing.md) - Error boundary and rate limiting testing guide

---

See [claude.md](../claude.md) in the project root for project context and conventions.
