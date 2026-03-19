# Invite Users to Shared Single-Tenant Dataset

## Context
Currently, all data (stores, products, inventory, actions) is scoped to a single user via `userId` checks in every query. The user wants to invite other people to see and interact with the same data — full access, not view-only. This is a single-tenant app (one shared dataset), so we don't need workspaces or multi-tenancy.

**Approach**: Remove per-user data scoping (everyone sees everything), switch to email-based auth via Postmark, and add an invitation system so only explicitly invited users can sign up.

---

## 1. Switch auth from username/password to email (Postmark)

Wasp has built-in email auth with verification, password reset, and SMTP support.

### main.wasp changes
```wasp
app RetailAnalytics {
  ...
  auth: {
    userEntity: User,
    methods: {
      email: {
        fromField: {
          name: "RetailAnalytics",
          email: "noreply@yourdomain.com"  // Postmark verified sender
        },
        emailVerification: {
          clientRoute: EmailVerificationRoute
        },
        passwordReset: {
          clientRoute: PasswordResetRoute
        }
      }
    },
    onAuthFailedRedirectTo: "/login",
    onAuthSucceededRedirectTo: "/"
  },
  emailSender: {
    provider: SMTP,
    defaultFrom: {
      name: "RetailAnalytics",
      email: "noreply@yourdomain.com"
    }
  }
}
```

### .env.server additions
```
SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_USERNAME=<postmark-server-api-token>
SMTP_PASSWORD=<postmark-server-api-token>
```

### New routes/pages needed
- `EmailVerificationRoute` → `/email-verification` → simple page showing verification status
- `PasswordResetRoute` → `/password-reset` → form to enter new password
- Update Login page to use `LoginForm` with email method
- Update Signup page to use `SignupForm` with email method

### Files to modify
- [main.wasp](main.wasp) — auth config, emailSender, new routes/pages
- [.env.server](.env.server) — SMTP credentials
- [src/pages/auth/Login.jsx](src/pages/auth/Login.jsx) — swap to email login form
- [src/pages/auth/Signup.jsx](src/pages/auth/Signup.jsx) — swap to email signup form
- New: `src/pages/auth/EmailVerification.jsx`
- New: `src/pages/auth/PasswordReset.jsx`

---

## 2. Add invitation system

### Data model (schema.prisma)
```prisma
model Invitation {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  token     String   @unique @default(uuid())
  invitedBy Int
  inviter   User     @relation("InvitedBy", fields: [invitedBy], references: [id])
  status    String   @default("PENDING")  // PENDING, ACCEPTED, EXPIRED
  createdAt DateTime @default(now())
  expiresAt DateTime
}
```

### Invite flow
1. Admin enters email on an "Invite User" UI
2. Backend creates Invitation record + sends Postmark email with link: `/signup?token=<uuid>`
3. Recipient clicks link → signup page pre-fills email, validates token
4. On successful signup, mark invitation as ACCEPTED
5. Reject signups without a valid invitation token

### Actions & queries
- `sendInvitation` action — creates Invitation, sends email via Wasp's `emailSender`
- `getInvitations` query — lists all invitations (for admin UI)
- `validateInvitationToken` query — checks if token is valid (used by signup page)

### Signup guard
Use Wasp's `userSignupFields` to validate the invitation token during signup. If no valid token exists for the email, reject the signup.

### Files to create/modify
- [schema.prisma](schema.prisma) — add Invitation model
- [main.wasp](main.wasp) — add Invitation entity, actions, queries
- New: `src/actions/invitation.js` — sendInvitation action
- New: `src/queries/invitation.js` — getInvitations, validateInvitationToken
- New: `src/components/InviteUserForm.jsx` — simple email input + send button
- Add invite UI to settings page or nav bar (somewhere accessible to admin)

---

## 3. Remove per-user data scoping

Since all authenticated users should see the same data, remove `userId` filtering from queries. Keep the `userId` foreign keys for audit trail (who created what).

### Pattern change
```javascript
// Before:
const stores = await context.entities.Store.findMany({
  where: { userId: context.user.id, isActive: true }
});

// After:
const stores = await context.entities.Store.findMany({
  where: { isActive: true }
});
```

### Files to modify (queries — remove userId filters)
- [src/queries/inventory.js](src/queries/inventory.js) — `getUserStores`, `getStoreById`, etc.
- [src/queries/ordering.js](src/queries/ordering.js) — store fetching
- [src/queries/analytics.js](src/queries/analytics.js) — store fetching
- [src/queries/globalSalesAnalytics.js](src/queries/globalSalesAnalytics.js)
- [src/queries/dailySalesAnalytics.js](src/queries/dailySalesAnalytics.js)
- [src/queries/outOfStock.js](src/queries/outOfStock.js)
- [src/queries/orderingHelpers.js](src/queries/orderingHelpers.js)

### Files to modify (actions — remove userId ownership checks)
- [src/actions/inventory.js](src/actions/inventory.js) — upload actions (remove `store.userId !== context.user.id` checks)
- [src/actions/inventoryLogs.js](src/actions/inventoryLogs.js)
- [src/actions/productCatalog.js](src/actions/productCatalog.js)
- [src/actions/orderWorksheet.js](src/actions/orderWorksheet.js) — shared worksheets or keep per-user
- [src/actions/productAction.js](src/actions/productAction.js) — remove userId filter on queries
- [src/actions/weeklySummary.js](src/actions/weeklySummary.js) — already fixed for cron

### Decision: OrderWorksheet → Shared
Order worksheets will be shared across all users. Remove `userId` scoping from `getOrCreateOrderWorksheet` — use a single shared worksheet (e.g., find the first one or create one without a userId). The `addToOrderWorksheet`, `exportOrderWorksheet`, and `clearOrderWorksheet` actions all operate on the shared worksheet.

---

## 4. Migration strategy

Since you're the only current user, migration is straightforward:
1. Add Invitation model, run `wasp db migrate-dev`
2. Switch auth method from usernameAndPassword to email
3. You'll need to re-register with your email (Wasp email auth uses a different identity table)
4. Existing data stays intact — stores/products/inventory don't change
5. Remove userId filters from queries
6. Auto-create an invitation for your own email (marked as ACCEPTED)

---

## Verification
1. Configure Postmark SMTP in `.env.server`
2. Run `wasp db migrate-dev` for the Invitation model
3. Sign up with email → verify via email link → confirm you see all existing data
4. From the invite UI, send an invitation to a test email
5. Open the invite link → sign up → verify the new user sees the same stores/data
6. Test password reset flow
7. Confirm signup without a valid invitation token is rejected
