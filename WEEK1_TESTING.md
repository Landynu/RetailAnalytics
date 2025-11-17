# Week 1 Testing Guide

This guide explains how to test the Week 1 implementations: Error Boundaries and Rate Limiting.

## Prerequisites

Ensure the Wasp development server is running:
```bash
wasp start
```

The server should be available at:
- **Client**: http://localhost:3000/
- **Server**: http://localhost:3001/

---

## Test 1: Error Boundary Testing

The ErrorBoundary component catches JavaScript errors and displays a user-friendly fallback UI instead of a white screen.

### Manual Testing Steps:

1. **Navigate to the error test page:**
   ```
   http://localhost:3000/error-test
   ```

2. **You should see:**
   - A card titled "Error Boundary Test"
   - A description explaining the test
   - A red button labeled "Throw Test Error"

3. **Click the "Throw Test Error" button**

4. **Expected Result:**
   - The app should NOT crash with a white screen
   - Instead, you should see the ErrorFallback component with:
     - ❌ Error icon
     - "Oops! Something went wrong" message
     - Error details (in development mode)
     - Three action buttons:
       - "Try Again" (resets the error boundary)
       - "Reload Page" (full page reload)
       - "Go Home" (navigates to /)

5. **Test the recovery buttons:**
   - Click "Try Again" → Should reset the error boundary and show the original test page
   - Click the button again to trigger the error
   - Click "Reload Page" → Should reload the entire page
   - Click the button again, then "Go Home" → Should navigate to the dashboard

### Development vs Production Behavior:

- **Development Mode** (`NODE_ENV !== 'production'`):
  - Shows detailed error message
  - Displays component stack trace
  - Error details are collapsible

- **Production Mode**:
  - Shows generic error message only
  - No technical details exposed to users
  - Maintains professional appearance

### Success Criteria:
✅ No white screen crashes
✅ Error fallback UI displays correctly
✅ Error details visible in dev mode
✅ All three recovery buttons work
✅ Can recover from errors without full page reload

---

## Test 2: Rate Limiting Testing

Two rate limiters have been implemented:

1. **Upload Rate Limiter**: 10 uploads per 15 minutes
2. **API Rate Limiter**: 100 requests per minute

### Important Note:
Rate limiting is **DISABLED in development mode** by default. To test it properly, you need to temporarily enable it in production mode or modify the skip logic.

### Option A: Automated Test Script

Run the provided test script:
```bash
./test-rate-limiting.sh
```

**Expected Output:**
```
=== Testing Rate Limiting ===

Testing API Rate Limiter (100 req/min)...
Sending 105 requests to /api/...

✓ Request 1: Success
✓ Request 50: Success
✓ Request 100: Success
✗ Request 101: Rate limited (429)

Results:
  Success: 100
  Rate Limited: 5

✅ API Rate Limiter is working correctly!

=== Test Complete ===
```

**In Development Mode:**
```
⚠️  Note: Rate limiting is disabled in development mode
```

### Option B: Manual Testing with curl

#### Test API Rate Limiter:

```bash
# Send 105 rapid requests
for i in {1..105}; do
  curl -s -w "\nStatus: %{http_code}\n" \
    http://localhost:3001/api/images/proxy?url=test
done
```

**Expected in Production:**
- Requests 1-100: HTTP 200 or 400 (success)
- Requests 101-105: HTTP 429 (rate limited)

**Expected Response (after limit exceeded):**
```json
{
  "error": "Too many requests from this IP, please try again later",
  "code": "RATE_LIMIT_EXCEEDED"
}
```

#### Test Upload Rate Limiter:

```bash
# Send 12 rapid upload requests
for i in {1..12}; do
  curl -s -X POST -w "\nStatus: %{http_code}\n" \
    -H "Content-Type: application/json" \
    http://localhost:3001/operations/upload
done
```

**Expected in Production:**
- Requests 1-10: Success (or auth error)
- Requests 11-12: HTTP 429 (rate limited)

### Option C: Enable Rate Limiting in Development

To test rate limiting in development, temporarily modify `src/serverSetup.js`:

**Line 26-31 (uploadLimiter):**
```javascript
skip: (req) => {
  // if (process.env.NODE_ENV !== 'production') {
  //   return true; // Skip in development
  // }
  return false;  // Enable in development for testing
}
```

**Line 55-60 (apiLimiter):**
```javascript
skip: (req) => {
  // if (process.env.NODE_ENV !== 'production') {
  //   return true; // Skip in development
  // }
  return false;  // Enable in development for testing
}
```

Then restart the Wasp server and re-run the tests.

### Rate Limiter Headers:

When rate limiting is active, responses include these headers:
```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1699999999
```

You can inspect them with:
```bash
curl -I http://localhost:3001/api/images/proxy?url=test
```

### Success Criteria:
✅ Upload limiter blocks after 10 requests in 15 minutes
✅ API limiter blocks after 100 requests in 1 minute
✅ Rate limit headers are present in responses
✅ Error messages are clear and include error codes
✅ Rate limiting is disabled in development by default
✅ Rate limiting works correctly in production mode

---

## Test 3: Security Headers (Helmet)

Verify that Helmet security headers are being set:

```bash
curl -I http://localhost:3000/
```

**Expected Headers:**
```
X-DNS-Prefetch-Control: off
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-Download-Options: noopen
X-XSS-Protection: 0
```

**Note:** `Content-Security-Policy` is managed separately (not by Helmet in this setup).

### Success Criteria:
✅ Helmet headers are present in responses
✅ Security headers are set correctly
✅ CSP is managed by custom middleware

---

## Testing Checklist

- [ ] Error Boundary displays fallback UI on errors
- [ ] Error details shown in development mode only
- [ ] All three recovery buttons work (Try Again, Reload, Go Home)
- [ ] Rate limiting test script runs successfully
- [ ] Rate limiting can be enabled/disabled based on environment
- [ ] Rate limit error messages are clear
- [ ] Security headers are present (Helmet)
- [ ] No console errors or warnings
- [ ] No unused parameter warnings in actions.js

---

## Production Testing

To fully test rate limiting in a production-like environment:

1. **Set environment to production:**
   ```bash
   NODE_ENV=production wasp start
   ```

2. **Run the rate limiting tests**

3. **Verify rate limiting is active:**
   - Upload limiter should block after 10 uploads
   - API limiter should block after 100 requests

4. **Test error boundaries don't expose sensitive info:**
   - Error details should be hidden
   - Only generic error message shown

---

## Cleanup

After testing, you can:

1. **Remove the error test page** (optional, can keep for future debugging):
   - Delete `/src/pages/ErrorTestPage.jsx`
   - Delete `/src/components/errors/ErrorTest.jsx`
   - Remove the route from `main.wasp` (lines 454-458)

2. **Keep the rate limiting test script** for future regression testing

---

## Next Steps

Once all tests pass:
- ✅ Week 1 Task 7: Test error boundaries work
- ✅ Week 1 Task 8: Test rate limiting works
- Move on to Week 2: Testing Infrastructure Setup
