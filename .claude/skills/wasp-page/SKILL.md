---
name: wasp-page
description: Scaffold a new Wasp route and page component
user-invocable: true
argument-hint: "[pageName] [urlPath]"
---

Scaffold a new route + page for RetailAnalytics.

## Steps

1. **Gather info** from arguments or ask the user:
   - Page name (PascalCase, e.g., `BrandDetailPage`)
   - URL path (e.g., `/brands/:brandId`)
   - Whether auth is required (default: true)
   - What data it needs (queries to use)

2. **Use CartoGopher** to understand existing patterns:
   - `search "Page"` to see existing page components
   - Check `main.wasp` for existing route patterns

3. **Add route + page declaration** to main.wasp:
   ```wasp
   route BrandDetailRoute { path: "/brands/:brandId", to: BrandDetailPage }
   page BrandDetailPage {
     authRequired: true,
     component: import { BrandDetailPage } from "@src/pages/BrandDetailPage"
   }
   ```

4. **Create the page component** at `src/pages/<PageName>.jsx`:
   ```jsx
   import { useQuery } from 'wasp/client/operations'
   import { useParams, Link } from 'react-router-dom'

   export function PageName() {
     const { paramId } = useParams()

     return (
       <div className="p-6 max-w-7xl mx-auto">
         <h1 className="text-2xl font-bold mb-4">Page Title</h1>
         {/* Page content using Radix UI components and Tailwind */}
       </div>
     )
   }
   ```

5. **Follow RetailAnalytics patterns**:
   - Use Radix UI components from `src/components/ui/` (button, card, dialog, table, etc.)
   - Use `lucide-react` for icons
   - Use `useQuery` for data fetching
   - Import from `react-router-dom`
   - If the page needs new operations, suggest using `/wasp-operation` first
