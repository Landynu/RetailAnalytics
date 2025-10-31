# Testing Instructions - Performance Fixes

## Changes Made

### 1. ✅ localStorage Version Check (v2.0)
- Old filters will be automatically cleared
- 14-day default will apply on first load
- Console message: "🔄 Filters reset due to version update"

### 2. ✅ Debug Logging Added
- Query now logs to server console
- Shows date filter application
- Shows row counts and aggregation results

### 3. ✅ Date Filter Working
- Query properly filters `weekStart` field
- Should only load 2 weeks of data (not 3 years)

---

## Testing Steps

### Step 1: Clear Browser Data
1. Open browser DevTools (F12)
2. Go to Console tab
3. Type: `localStorage.clear()`
4. Press Enter
5. **Refresh page** (F5 or Ctrl+R)

### Step 2: Check Browser Console
Look for this message:
```
🔄 Filters reset due to version update
```

This confirms old filters were cleared.

### Step 3: Check Server Logs
Watch the terminal running `wasp start` for these log messages:

**Should see:**
```
📅 Date filter applied: {
  start: '2025-10-17',
  end: '2025-10-31',
  whereClause: { gte: '2025-10-17...', lte: '2025-10-31...' }
}

📊 Query results: {
  summariesFetched: 1234,  <-- Should be ~1000-5000 (not 267K!)
  dateRange: '2025-10-17 to 2025-10-31',
  storeFilter: 'all stores'
}

💰 Sales analytics summary: {
  totalRevenue: 45678.50,  <-- Should be a number, not NaN
  unitsSold: 234,
  avgTransaction: 195.12,
  topProducts: 10,
  hasData: true
}
```

**Should NOT see:**
```
⚠️ No date range filter - loading all data!
```

### Step 4: Check Network Tab
1. Open DevTools → Network tab
2. Filter by "XHR" or "Fetch"
3. Look for `get-global-sales-analytics`

**Expected Results:**
- **Payload**: 50-150KB (was 422KB-1MB before)
- **Time**: <1 second (was 4-11 seconds before)
- **Status**: 200 OK

### Step 5: Check Dashboard
1. **Date Filter** should show "Last 14 Days" (default)
2. **Total Revenue** should show a $ amount (NOT "$NaN")
3. **Units Sold** should show a number
4. **Charts** should render with data

### Step 6: Test Date Range Changes
1. Click date range picker
2. Select "Last 30 Days"
3. **Verify**: Only ONE query in Network tab (no repeated queries)
4. **Check Server Logs**: Should see new date range applied
5. Try "This Year" - may be slower but should work

---

## Expected Results Summary

| Metric | Target | How to Verify |
|--------|--------|---------------|
| **Initial Load** | <2 seconds | Page renders quickly |
| **Payload** | 50-150KB | Network tab → XHR filter |
| **No Polling** | 1 query only | Network tab shows single request |
| **Date Filter** | "Last 14 Days" | Visible in UI |
| **No NaN** | Real numbers | KPI cards show values |
| **Server Logs** | Date filter applied | Terminal shows emoji logs |

---

## Troubleshooting

### If you see "$NaN":
1. Check browser console for JavaScript errors
2. Check server logs - look for the 💰 log with values
3. If `totalRevenue: 0`, there might be no sales in the 14-day window
   - Try selecting a longer date range
   - Check if summary tables have recent data

### If payload is still >400KB:
1. Check server logs for "⚠️ No date range filter"
2. If you see this warning, the filter isn't being passed
3. Clear localStorage again and hard refresh (Ctrl+Shift+R)

### If multiple repeated queries appear:
1. Verify React Query isn't stuck in a refetch loop
2. Check browser console for errors causing remounts
3. Close any duplicate browser tabs

### If date filter shows wrong dates:
1. Clear localStorage: `localStorage.clear()`
2. Hard refresh: Ctrl+Shift+R
3. Should default to last 14 days

---

## Success Criteria ✅

- [ ] localStorage cleared automatically on first load
- [ ] Date filter defaults to "Last 14 Days"
- [ ] Dashboard loads in <2 seconds
- [ ] No "$NaN" values visible
- [ ] Network payload <150KB
- [ ] Server logs show date filter being applied
- [ ] Only 1 query per interaction (no polling)
- [ ] Charts render with actual data

---

## Next Steps After Testing

If all tests pass:
1. Report actual load time and payload size
2. Confirm no NaN issues
3. We can then add the 30-day product activity filter

If issues remain:
1. Copy server log output
2. Copy any browser console errors
3. Screenshot of Network tab
4. We'll debug further

---

## Quick Reference: Key Indicators

**Good Signs:**
- ✅ "🔄 Filters reset" in browser console
- ✅ "📅 Date filter applied" in server logs
- ✅ Payload ~50-150KB
- ✅ "$X,XXX.XX" (real numbers) in KPIs

**Bad Signs:**
- ❌ "$NaN" in dashboard
- ❌ "⚠️ No date range filter" warning
- ❌ Payload >400KB
- ❌ Multiple identical queries
- ❌ Load time >5 seconds
