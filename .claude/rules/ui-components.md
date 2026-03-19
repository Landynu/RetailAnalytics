---
description: UI component library, styling patterns, and frontend conventions for RetailAnalytics
globs: ["**/*.jsx", "**/components/**"]
alwaysApply: false
---

# UI Components

## Tailwind CSS
- Standard Tailwind CSS with `tailwind.config.js` configuration
- Utility-first approach with standard Tailwind classes

## Component Library (src/components/ui/)
Radix UI primitives with Tailwind styling:
- `alert-dialog` — confirmation dialogs
- `badge` — status indicators
- `button` — action buttons with variants
- `card` — content containers
- `dialog` — modal overlays
- `input` — form inputs
- `label` — form labels
- `separator` — visual dividers
- `table` — base table styling

## Data Display
- **TanStack React Table** for all data tables (column sorting, filtering, visibility, localStorage persistence)
- **Recharts** for charts, sparklines, and analytics visualizations

## Page Component Pattern
```jsx
import { useQuery } from 'wasp/client/operations'

export function MyPage() {
  const { data, isLoading } = useQuery(myQuery)
  if (isLoading) return <div className="p-6">Loading...</div>
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Title</h1>
      {/* content */}
    </div>
  )
}
```

## Icons
- Use `lucide-react` for all icons

## Routing
- `react-router-dom` for navigation (`Link`, `useParams`, `useNavigate`)
- `useQuery` from `wasp/client/operations` for data fetching
