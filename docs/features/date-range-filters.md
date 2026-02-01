# Date Range Filter Fix - Relative vs Fixed Dates

## Problem
The dashboard was using **fixed date ranges** instead of **relative date ranges**. When users selected presets like "Last 14 Days", the component would:
1. Calculate actual dates at that moment (e.g., Feb 25 - Mar 11)
2. Store these fixed dates in localStorage
3. On reload, use the same fixed dates from storage
4. Never update the dates, even though the label said "Last 14 Days"

**Result**: If you selected "Last 14 Days" on March 1st, it stored "Feb 15 - Mar 1". On March 11th, it still showed "Feb 15 - Mar 1" instead of the current "Feb 25 - Mar 11".

## Solution Implemented

### 1. Dashboard.jsx Changes
- Added `getRelativeDateRange()` helper function that calculates dates based on preset identifier
- Modified filter initialization to check for stored preset and recalculate dates on mount
- Presets now include their identifier (e.g., `{ start, end, preset: 'last14' }`)
- On component load, if a preset exists, dates are dynamically recalculated

```javascript
// Recalculate relative date ranges on mount
if (loadedFilters.dateRange?.preset) {
  console.log('🔄 Recalculating relative date range for preset:', loadedFilters.dateRange.preset);
  loadedFilters.dateRange = getRelativeDateRange(loadedFilters.dateRange.preset);
}
```

### 2. DateRangeFilter.jsx Changes
- Already properly includes preset identifier when saving
- Custom date ranges do NOT include preset, so they remain fixed as intended
- Updated display to show year for custom ranges to make fixed dates more obvious
- Added clarifying comment about custom ranges not being recalculated

## Behavior After Fix

### Relative Presets (Automatically Updated)
- **Today**: Always shows current day
- **Last 7 Days**: Always shows last 7 days from today
- **Last 14 Days**: Always shows last 14 days from today
- **Last 30 Days**: Always shows last 30 days from today
- **Last 90 Days**: Always shows last 90 days from today
- **This Month**: Always shows current month start to today
- **Last Month**: Always shows previous month's full date range
- **This Year**: Always shows current year start to today

### Custom Date Ranges (Fixed)
When users manually select specific dates (e.g., "Jan 1, 2025 - Jan 31, 2025"):
- These dates remain fixed and never change
- No preset identifier is stored
- Perfect for historical analysis or specific time periods

## Testing Instructions

1. **Test Relative Date Ranges:**
   - Select "Last 14 Days" from the date filter
   - Note the data shown in charts/KPIs
   - Reload the page or come back tomorrow
   - Verify the date range has updated to still show "last 14 days from today"
   - Check browser console for log: `🔄 Recalculating relative date range for preset: last14`

2. **Test Custom Date Ranges:**
   - Select a specific date range (e.g., Jan 1 - Jan 31)
   - Note it displays as "Jan 1, 2025 - Jan 31, 2025" with years
   - Reload the page
   - Verify the same fixed dates are still shown

3. **Test Data Updates:**
   - Switch between different presets (Last 7, Last 14, Last 30 days)
   - Verify KPIs and charts update accordingly
   - Verify date range in browser console logs shows correct dates

## Technical Details

### Local Storage Structure
```javascript
// Relative preset (will be recalculated)
{
  dateRange: {
    start: "2025-02-25T06:00:00.000Z",
    end: "2025-03-11T05:59:59.999Z",
    preset: "last14"  // This triggers recalculation
  }
}

// Custom range (stays fixed)
{
  dateRange: {
    start: "2025-01-01T06:00:00.000Z",
    end: "2025-01-31T05:59:59.999Z"
    // No preset = stays fixed
  }
}
```

### React Query Integration
Wasp's React Query automatically refetches data when filter parameters change, so:
- When dates are recalculated on mount, queries automatically refetch with new dates
- No manual refetch needed
- Ensures data is always current with the active date range

## Benefits
1. ✅ Dashboard always shows current relative data
2. ✅ "Last 14 Days" truly means the last 14 days, not a fixed snapshot
3. ✅ Historical analysis still possible with custom date ranges
4. ✅ User intent is preserved in localStorage (via preset identifier)
5. ✅ No breaking changes to existing functionality

## Files Modified
- `src/pages/Dashboard.jsx` - Added relative date calculation and preset recalculation
- `src/components/DateRangeFilter.jsx` - Improved custom range display and documentation

## Date: March 11, 2025
