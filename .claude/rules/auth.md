---
description: Authentication and authorization patterns for RetailAnalytics
globs: ["**/auth/**", "**/invitation/**"]
alwaysApply: false
---

# Authentication

## Config
Auth is configured in main.wasp under `app.auth`. RetailAnalytics uses email/password authentication with an invitation system.

## User Model
- Wasp manages auth fields (email, password hash) internally
- Your User model in schema.prisma only needs `id` plus custom fields
- Do NOT add email/password fields to User model unless you need them queryable

## AuthUser Object
- `useAuth()` returns `AuthUser` (not the Prisma User)
- Auth fields are nested: `user.identities.email?.email`
- Use helpers: `import { getEmail } from 'wasp/auth'`

## Server-Side Auth Check
Every query and action must check auth:
```javascript
if (!context.user) {
  throw new HttpError(401)
}
```

## Invitation System
- Users are invited by existing users via email
- Invitation creates a pending record; user completes signup via link
- Multi-tenant: users belong to stores, shared data model
- See `src/actions/invitation.js` and `src/queries/invitation.js`

## Client-Side
```javascript
import { useAuth } from 'wasp/client/auth'
import { LoginForm, SignupForm } from 'wasp/client/auth'
```

## Protected Pages
Set `authRequired: true` on page declarations in main.wasp.
