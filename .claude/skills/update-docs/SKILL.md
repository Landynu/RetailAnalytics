---
name: update-docs
description: Create, update, or audit RetailAnalytics project documentation
user-invocable: true
argument-hint: "[feature-or-topic] [create|update|audit]"
---

Create, update, or audit documentation for the RetailAnalytics project.

## Modes

### Create (`/update-docs "feature-name" create`)
1. Use CartoGopher to explore the feature's code and understand its implementation
2. Determine the correct docs directory:
   - Feature docs → `docs/features/`
   - Architecture → `docs/architecture/`
   - Deployment → `docs/deployment/`
   - Roadmap → `docs/roadmap/`
3. Create the document with the standard template:
   ```markdown
   # Feature Name

   Brief overview of what this feature does and why.

   ## Overview
   - Key purpose
   - User-facing behavior

   ## Architecture
   - Key files and their roles
   - Data flow

   ## Key Components
   - Components with file paths

   ## Configuration
   - Environment variables / settings

   ## Related
   - Links to related docs/features
   ```
4. Update `docs/README.md` index with a link to the new document

### Update (`/update-docs "feature-name" update`)
1. Find existing docs related to the topic in `docs/`
2. Use CartoGopher to check current codebase state
3. Identify discrepancies between docs and code
4. Update the documentation to match current implementation
5. Check if `.claude/rules/` files need corresponding updates

### Audit (`/update-docs "" audit`)
1. List all docs in `docs/`
2. For each doc, spot-check key claims against the codebase using CartoGopher
3. Flag outdated or inaccurate documentation
4. Suggest which docs need updating
5. Check for undocumented features that should have docs
6. Present a checklist:
   ```
   Documentation Audit:
   - [ ] docs/features/FEATURE.md: [status]
   ...
   ```
