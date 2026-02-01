# Cannabis Supply Chain Integration Roadmap
## Greenline → RetailAnalytics → Legacy Supply

**Version:** 1.0
**Last Updated:** November 17, 2025
**Author:** Development Team
**Status:** Planning Phase

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Phase-by-Phase Implementation](#phase-by-phase-implementation)
5. [Technical Specifications](#technical-specifications)
6. [Resource Requirements](#resource-requirements)
7. [Risk Assessment](#risk-assessment)
8. [Success Metrics](#success-metrics)
9. [Timeline & Milestones](#timeline--milestones)
10. [Appendix](#appendix)

---

## 🎯 Executive Summary

### Vision
Create a fully integrated cannabis supply chain ecosystem that connects retail POS systems (Greenline) with analytics intelligence (RetailAnalytics) and wholesale distribution (Legacy Supply), enabling automated ordering, compliance reporting, and market intelligence.

### Business Objectives
- **Reduce ordering time** from 2-4 hours/week to <15 minutes/week (90% reduction)
- **Eliminate stockouts** through intelligent reorder automation
- **Increase profit margins** by 15-25% through better pricing intelligence
- **Automate compliance** reporting, saving 20+ hours/month
- **Generate new revenue** streams through data monetization ($1k-$5k/month per customer)

### Value Proposition
**For Retailers:**
- Seamless ordering directly from Greenline POS interface
- Automated reorder intelligence prevents stockouts
- Advanced analytics improve decision-making
- Compliance automation reduces audit risk

**For Legacy Supply:**
- Increased order volume and frequency
- Better demand forecasting
- Reduced friction in ordering process
- Market intelligence from aggregated data

### Expected Outcomes (12 Months)
- **25-50 retail customers** using the integrated system
- **$5,000-$25,000 MRR** from SaaS subscriptions
- **$50,000-$200,000/month** in wholesale order volume
- **Comprehensive market intelligence** database
- **Platform for future expansion** to other POS systems

---

## 🏗️ System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    GREENLINE POS SYSTEM                         │
│                  (Existing Retail Operations)                   │
│                                                                 │
│  • Point of Sale Transactions                                  │
│  • Inventory Management                                        │
│  • Customer Data                                               │
│  • Sales Reports & CSV Exports                                 │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     │ Browser Extension Intercepts
                     │ ├─ CSV Downloads
                     │ ├─ Product Data
                     │ └─ UI Injection
                     │
┌────────────────────▼───────────────────────────────────────────┐
│               BROWSER EXTENSION (Bridge Layer)                  │
│                                                                 │
│  Content Scripts:                                              │
│  • Download interception                                       │
│  • Product data extraction                                     │
│  • UI injection ("Order" buttons)                              │
│                                                                 │
│  Background Service:                                           │
│  • CSV processing                                              │
│  • API communication                                           │
│  • Product matching                                            │
│  • Notifications                                               │
└─────────────┬────────────────────────────┬─────────────────────┘
              │                            │
              │ Data Upload                │ Order Requests
              │                            │
┌─────────────▼──────────────┐  ┌─────────▼────────────────────┐
│     RETAILANALYTICS        │  │      LEGACY SUPPLY           │
│   (Analytics Platform)     │  │  (Wholesale Distribution)    │
│                            │  │                              │
│  API Endpoints:            │  │  API Endpoints:              │
│  • /extension/upload       │  │  • /products/search          │
│  • /products/match         │  │  • /products/availability    │
│  • /reorder/analyze        │  │  • /purchase-orders          │
│  • /webhooks/trigger       │  │  • /inventory/sync           │
│                            │  │                              │
│  Intelligence Engine:      │  │  Distribution Features:      │
│  • Sales velocity analysis │  │  • Product catalog           │
│  • Stockout prediction     │  │  • Inventory management      │
│  • Reorder recommendations │  │  • Order fulfillment         │
│  • Compliance automation   │  │  • Supplier management       │
│                            │  │                              │
│  Database:                 │  │  Database:                   │
│  • PostgreSQL (Railway)    │  │  • PostgreSQL                │
│  • Redis (Cache)           │  │  • Product catalog           │
│  • S3 (Images/Docs)        │  │  • Purchase orders           │
│                            │  │                              │
│  Triggers n8n Webhook ────┼──┼─▶ Creates Purchase Order     │
│                            │  │                              │
└────────────┬───────────────┘  └──────────────────────────────┘
             │                            │
             │                            │
             └──────────┬─────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │     N8N WORKFLOW      │
            │  (Automation Engine)  │
            │                       │
            │  Trigger:             │
            │  • Webhook from       │
            │    RetailAnalytics    │
            │                       │
            │  Steps:               │
            │  1. Parse reorder     │
            │     recommendation    │
            │  2. Verify products   │
            │     in Legacy Supply  │
            │  3. Create draft PO   │
            │  4. Send notification │
            │  5. Update status     │
            │                       │
            │  Self-hosted on       │
            │  existing infra       │
            └───────────────────────┘
```

### Data Flow Diagram

```
User Action (Greenline)
    │
    ├─► Daily Operations
    │   ├─ Sales transactions
    │   ├─ Inventory movements
    │   └─ Export reports
    │
    ▼
Browser Extension Intercepts
    │
    ├─► Automatic
    │   ├─ Download CSV
    │   ├─ Parse data
    │   └─ Upload to RetailAnalytics
    │
    └─► Manual
        ├─ Click "Order" button
        └─ Direct order to Legacy Supply
    │
    ▼
RetailAnalytics Processing
    │
    ├─► Data Storage
    │   ├─ Store transaction data
    │   ├─ Update inventory levels
    │   └─ Calculate analytics
    │
    ├─► Intelligence Analysis
    │   ├─ Calculate sales velocity
    │   ├─ Predict stockouts (7-day window)
    │   ├─ Generate reorder recommendations
    │   └─ Check Legacy Supply availability
    │
    └─► Action Trigger
        ├─ If reorder needed → Webhook to n8n
        └─ If urgent → Email notification
    │
    ▼
N8N Automation
    │
    ├─► Webhook Received
    │   └─ Parse reorder data
    │
    ├─► Validate
    │   ├─ Check Legacy Supply inventory
    │   ├─ Verify pricing
    │   └─ Confirm availability
    │
    ├─► Create Order
    │   ├─ Generate draft PO in Legacy Supply
    │   ├─ Calculate totals
    │   └─ Add order notes
    │
    └─► Notify
        ├─ Email retailer with approval link
        ├─ Update RetailAnalytics status
        └─ Log to audit trail
    │
    ▼
Retailer Approval
    │
    ├─► Reviews draft PO
    ├─► Approves or modifies
    └─► Confirms order
    │
    ▼
Legacy Supply Fulfillment
    │
    ├─► Order confirmed
    ├─► Pick and pack
    ├─► Ship to retailer
    └─► Update inventory
    │
    ▼
Feedback Loop
    │
    └─► Delivery confirmation
        ├─ Update RetailAnalytics
        ├─ Sync inventory levels
        └─ Improve future predictions
```

---

## 💻 Technology Stack

### RetailAnalytics (Existing)

**Frontend:**
- React 18.2.0
- React Router 6.26.2
- TanStack React Table 8.21.3
- Recharts 3.3.0 (data visualization)
- shadcn/ui + Radix UI (component library)
- Tailwind CSS 3.2.7
- Lucide React (icons)

**Backend:**
- Wasp Framework 0.18.1 (full-stack framework)
- Node.js/Express (API server)
- Prisma 5.19.1 (ORM)
- PostgreSQL (primary database)

**Infrastructure:**
- Railway (hosting)
  - PostgreSQL (managed)
  - Redis 5.3.2 (caching)
  - Railway S3/Wasabi (object storage)
- Sharp 0.33.5 (image processing)
- AWS SDK S3 Client 3.717.0

**Performance:**
- Redis caching (15-min TTL)
- Pre-aggregated weekly summaries
- Progressive loading
- In-memory filtering

### Browser Extension (New)

**Core:**
- Manifest V3 (Chrome/Edge)
- WebExtensions API (Firefox)
- TypeScript 5.8.2 (gradual migration)
- React 18.2.0 (popup UI)

**Build Tools:**
- Vite 7.0.6 (bundler)
- Rollup (extension packaging)
- ESLint + Prettier (code quality)

**APIs:**
- Chrome Storage API (settings)
- Chrome Downloads API (interception)
- Chrome Notifications API (alerts)
- Fetch API (RetailAnalytics communication)

**Styling:**
- Tailwind CSS (consistent with main app)
- Inline CSS for content scripts

### N8N Automation (Existing)

**Platform:**
- n8n (self-hosted)
- Version: Latest stable
- Node.js runtime

**Integrations:**
- HTTP Request nodes (API calls)
- Webhook trigger node
- Email notification node (SMTP)
- PostgreSQL node (direct DB access if needed)
- Function nodes (custom logic)

**Deployment:**
- Self-hosted on existing infrastructure
- Docker container (likely)
- Persistent storage for workflows

### Legacy Supply (Existing + New APIs)

**Backend:**
- Node.js/Express (assumed)
- PostgreSQL database
- Product catalog management
- Purchase order system
- Inventory tracking

**New Requirements:**
- REST API endpoints for integration
- Product search/matching API
- Purchase order creation API
- Inventory sync API
- Webhook endpoints for status updates

---

## 📅 Phase-by-Phase Implementation

### Phase 0: Pre-Work & Planning (Week 0)

**Objectives:**
- Finalize requirements
- Set up development environment
- Create project repositories
- Establish communication protocols

**Tasks:**
- [ ] Review and approve this roadmap
- [ ] Set up extension repository
- [ ] Configure development databases
- [ ] Set up staging environment
- [ ] Create API documentation template
- [ ] Schedule weekly sync meetings

**Deliverables:**
- Approved roadmap document
- Development environment ready
- Project kickoff complete

**Timeline:** 1 week
**Effort:** 8 hours
**Owner:** Dev Lead

---

### Phase 1: Foundation & Stabilization (Weeks 1-4)

**Objective:** Prepare RetailAnalytics for external integration

#### Week 1: Safety & Security

**Tasks:**
1. **Error Boundaries**
   - Create ErrorBoundary component
   - Create ErrorFallback UI
   - Wrap all pages in Layout.jsx
   - Test error scenarios

2. **Rate Limiting**
   - Install express-rate-limit and helmet
   - Add rate limiting middleware
   - Configure security headers
   - Apply to upload endpoints

3. **Code Cleanup**
   - Fix unused parameter warnings (16 instances in actions.js)
   - Run ESLint and fix issues
   - Update .gitignore if needed

**Deliverables:**
- Error boundaries implemented ✓
- Rate limiting active ✓
- Clean diagnostic report ✓

**Effort:** 8 hours
**Tests Required:**
- Error boundary catches crashes
- Rate limiting blocks excessive requests
- No TypeScript/ESLint warnings

---

#### Week 2: Testing Infrastructure

**Tasks:**
1. **Setup Vitest**
   - Install vitest and testing libraries
   - Create vitest.config.js
   - Set up test utilities
   - Configure coverage reporting

2. **Write Critical Tests**
   - Cache key generation tests
   - Week boundary calculation tests
   - CSV parsing tests
   - Format extraction tests
   - Product matching logic tests

3. **CI/CD Preparation**
   - Add test script to package.json
   - Document test commands
   - Set up test coverage thresholds

**Deliverables:**
- Testing framework configured ✓
- 20+ unit tests written ✓
- >70% code coverage on critical functions ✓

**Effort:** 12 hours
**Tests Required:**
- All tests pass
- Coverage report generated
- No flaky tests

---

#### Week 3: Configuration & Monitoring

**Tasks:**
1. **Configuration Management**
   - Create src/config.js
   - Move all magic numbers to config
   - Add environment variable validation
   - Document all config options

2. **Sentry Integration**
   - Sign up for Sentry
   - Install @sentry/react and @sentry/node
   - Configure error tracking
   - Set up source maps
   - Test error reporting

3. **Health Check Endpoint**
   - Create src/apis/healthCheck.js
   - Check database connectivity
   - Check Redis availability
   - Check S3 connectivity
   - Add to main.wasp

**Deliverables:**
- Configuration externalized ✓
- Sentry tracking errors ✓
- Health check endpoint operational ✓

**Effort:** 8 hours
**Tests Required:**
- Health check returns 200 when healthy
- Health check returns 503 when unhealthy
- Sentry captures test errors

---

#### Week 4: Extension API Preparation

**Tasks:**
1. **API Token System**
   - Add apiToken and apiTokenCreatedAt to User model
   - Run Prisma migration
   - Create generateApiToken action
   - Create revokeApiToken action
   - Add to main.wasp

2. **Extension Upload Endpoint**
   - Create src/apis/extensionUpload.js
   - Implement token authentication
   - Route to appropriate upload action based on exportType
   - Add error handling and logging
   - Add to main.wasp

3. **Product Matching Endpoint**
   - Create src/actions/products/matchProduct.js
   - Implement fuzzy matching algorithm
   - Add caching for matched products
   - Return confidence scores
   - Add to main.wasp

4. **Webhook Infrastructure**
   - Create src/apis/webhooks/reorderTrigger.js
   - Implement webhook signature verification
   - Add retry logic
   - Log all webhook calls
   - Add to main.wasp

**Deliverables:**
- API token system functional ✓
- Extension endpoints ready ✓
- Product matching working ✓
- Webhook infrastructure tested ✓

**Effort:** 12 hours
**Tests Required:**
- Token generation creates unique tokens
- Extension upload accepts CSV data
- Product matching returns results
- Webhooks trigger successfully

---

**Phase 1 Summary:**
- **Total Time:** 4 weeks
- **Total Effort:** 40 hours
- **Key Milestone:** RetailAnalytics is production-ready and extension-ready
- **Risk Level:** Low (building on existing stable platform)

---

### Phase 2: Browser Extension MVP (Weeks 5-8)

**Objective:** Create functional browser extension that connects Greenline to RetailAnalytics

#### Week 5: Extension Scaffold & Basic UI

**Tasks:**
1. **Project Setup**
   ```bash
   mkdir greenline-connector
   cd greenline-connector
   npm init -y
   npm install react react-dom
   npm install -D @vitejs/plugin-react vite rollup
   ```

2. **Manifest Files**
   - Create manifest.json (Chrome - Manifest V3)
   - Create manifest.firefox.json (Firefox - WebExtensions)
   - Configure permissions
   - Set up host permissions for Greenline and RetailAnalytics

3. **Basic Extension Structure**
   ```
   greenline-connector/
   ├── manifest.json
   ├── manifest.firefox.json
   ├── package.json
   ├── vite.config.js
   ├── src/
   │   ├── background/
   │   │   └── service-worker.js
   │   ├── content-scripts/
   │   │   ├── greenline.js
   │   │   └── platform-detector.js
   │   ├── popup/
   │   │   ├── App.jsx
   │   │   ├── index.html
   │   │   └── index.jsx
   │   ├── options/
   │   │   ├── Options.jsx
   │   │   ├── index.html
   │   │   └── index.jsx
   │   ├── utils/
   │   │   ├── api.js
   │   │   ├── storage.js
   │   │   └── auth.js
   │   └── styles/
   │       └── global.css
   └── public/
       └── icons/
           ├── icon16.png
           ├── icon48.png
           └── icon128.png
   ```

4. **Popup UI (React)**
   - Login/authentication screen
   - Settings/configuration panel
   - Status dashboard (last sync, connection status)
   - Manual upload interface
   - Build with Tailwind CSS

5. **Options Page**
   - API URL configuration
   - API token input
   - Store selection
   - Auto-upload toggle
   - Test connection button

**Deliverables:**
- Extension loads in Chrome ✓
- Extension loads in Firefox ✓
- Popup UI functional ✓
- Settings page working ✓

**Effort:** 16 hours
**Tests Required:**
- Extension installs without errors
- Popup opens and displays correctly
- Settings save and persist

---

#### Week 6: CSV Upload & Authentication

**Tasks:**
1. **Authentication System**
   - Implement API token storage (Chrome Storage API)
   - Create login flow in popup
   - Add token validation
   - Handle token refresh/expiration
   - Show authentication status

2. **Manual CSV Upload**
   - Create drag-and-drop file upload component
   - Implement CSV file reading (FileReader API)
   - Add CSV validation
   - Show upload progress
   - Display success/error messages

3. **CSV Processing**
   - Parse CSV on client-side (csv-parser)
   - Detect export type from headers/content
   - Validate required fields
   - Handle malformed CSVs gracefully

4. **API Communication**
   - Create API client (src/utils/api.js)
   - Implement uploadCSV function
   - Add error handling and retry logic
   - Handle network failures
   - Add timeout handling

**Deliverables:**
- Users can authenticate ✓
- Manual CSV upload works ✓
- Data reaches RetailAnalytics ✓
- Error handling functional ✓

**Effort:** 16 hours
**Tests Required:**
- Valid tokens authenticate successfully
- Invalid tokens are rejected
- CSV files upload correctly
- Network errors handled gracefully

---

#### Week 7: Download Interception & Automation

**Tasks:**
1. **Download Monitoring**
   ```javascript
   // background/service-worker.js
   chrome.downloads.onCreated.addListener((download) => {
     if (download.url.includes('greenline') &&
         download.filename.endsWith('.csv')) {
       handleGreenlineDownload(download);
     }
   });
   ```

2. **File Access Strategy**
   - **Option A:** Prompt user to re-upload via popup (SIMPLEST)
   - **Option B:** Use chrome.downloads.download() to re-download
   - **Option C:** Intercept at network level (COMPLEX)
   - **Decision:** Start with Option A for MVP

3. **Export Type Detection**
   - Implement detectExportType function
   - Check filename patterns
   - Analyze CSV headers
   - Return type: INVENTORY_LOG | PRODUCT_CATALOG | INVENTORY_EXPORT

4. **Automatic Upload Flow**
   - Show notification when download detected
   - Prompt user to confirm upload (via popup)
   - Upload to RetailAnalytics
   - Show success notification
   - Log upload history

5. **Settings Integration**
   - Add "Auto-upload" toggle in options
   - Save preference to storage
   - Respect user preference
   - Add "Always ask" option

**Deliverables:**
- Downloads detected automatically ✓
- Export type identified correctly ✓
- Automatic upload works ✓
- User preferences respected ✓

**Effort:** 20 hours
**Tests Required:**
- Greenline CSV downloads trigger notification
- Non-Greenline downloads ignored
- Auto-upload respects user settings
- Upload history tracked correctly

---

#### Week 8: Product Matching & UI Injection

**Tasks:**
1. **Product Matching Service**
   ```javascript
   // utils/product-matcher.js
   async function matchProduct(productData) {
     const response = await apiClient.post('/products/match', {
       name: productData.name,
       brand: productData.brand,
       gtin: productData.gtin,
       thc: productData.thc,
       category: productData.category
     });
     return response.match;
   }
   ```

2. **Content Script for Greenline**
   ```javascript
   // content-scripts/greenline.js
   // Inject into Greenline pages
   // Find product rows
   // Extract product data
   // Check if available in Legacy Supply
   // Inject "Order" button
   ```

3. **UI Injection**
   - Detect product listing pages
   - Extract product information from DOM
   - Query RetailAnalytics for matches
   - Inject "Order from Legacy Supply" buttons
   - Style to match Greenline UI

4. **Order Button Functionality**
   - Click handler
   - Open ordering modal or redirect
   - Pre-fill order form with product data
   - Handle authentication
   - Submit order to Legacy Supply

5. **Notifications**
   - Download detected
   - Upload successful/failed
   - Product matched
   - Order created
   - Low stock alerts

**Deliverables:**
- Product matching accurate (>90%) ✓
- UI injection works on Greenline ✓
- Order buttons functional ✓
- Notifications working ✓

**Effort:** 16 hours
**Tests Required:**
- Products match correctly
- Buttons appear on product pages
- Buttons open correct order flow
- Notifications display properly

---

**Phase 2 Summary:**
- **Total Time:** 4 weeks
- **Total Effort:** 68 hours
- **Key Milestone:** Working browser extension with manual and automatic upload
- **Risk Level:** Medium (browser API complexities, DOM manipulation fragility)

---

### Phase 3: N8N Automation Layer (Weeks 9-10)

**Objective:** Automate reorder workflow from RetailAnalytics to Legacy Supply

#### Week 9: Reorder Intelligence Engine

**Tasks:**
1. **Sales Velocity Calculation**
   ```javascript
   // src/services/reorderIntelligence.js
   async function calculateSalesVelocity(productId, storeId, days = 30) {
     // Query InventoryMovement for sales
     // Calculate average daily sales
     // Account for weekends vs weekdays
     // Return sales per day
   }
   ```

2. **Stockout Prediction**
   ```javascript
   async function predictStockout(productId, storeId) {
     const currentStock = await getStockLevel(productId, storeId);
     const velocity = await calculateSalesVelocity(productId, storeId);
     const daysUntilStockout = currentStock / velocity;
     return { daysRemaining: daysUntilStockout, urgency: getUrgency(daysUntilStockout) };
   }
   ```

3. **Reorder Recommendations**
   ```javascript
   async function generateReorderRecommendations(storeId) {
     // Get all products for store
     // Calculate stockout predictions
     // Check Legacy Supply availability
     // Calculate optimal order quantities
     // Return prioritized list
   }
   ```

4. **Integration Points**
   - Hook into CSV upload processing
   - Trigger analysis after each upload
   - Check reorder thresholds
   - Generate recommendations

5. **Webhook Trigger Logic**
   ```javascript
   // src/services/webhookTrigger.js
   async function triggerReorderWebhook(recommendations) {
     if (recommendations.length === 0) return;

     const webhookUrl = process.env.N8N_WEBHOOK_URL;
     await fetch(webhookUrl, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         event: 'reorder_needed',
         urgency: calculateUrgency(recommendations),
         products: recommendations,
         timestamp: new Date().toISOString()
       })
     });
   }
   ```

**Deliverables:**
- Sales velocity calculated accurately ✓
- Stockout predictions generated ✓
- Reorder recommendations produced ✓
- Webhooks triggered correctly ✓

**Effort:** 12 hours
**Tests Required:**
- Velocity calculations are accurate
- Stockout predictions within 10% error
- Recommendations only for stocked-out items
- Webhooks send correct payload

---

#### Week 10: N8N Workflow Configuration

**Tasks:**
1. **Webhook Trigger Node**
   - Create new workflow in n8n
   - Add webhook trigger
   - Configure URL endpoint
   - Set up authentication (optional)
   - Test webhook reception

2. **Data Parsing Node**
   ```javascript
   // n8n Function Node
   const payload = $json;
   const products = payload.products;
   const urgency = payload.urgency;

   return products.map(product => ({
     productId: product.productId,
     productName: product.name,
     quantity: product.recommendedOrderQty,
     legacySupplyProductId: product.legacySupplyProduct.id,
     wholesalePrice: product.legacySupplyProduct.wholesalePrice
   }));
   ```

3. **Legacy Supply API Calls**
   - **HTTP Request Node 1:** Check product availability
     - Endpoint: POST /api/products/availability
     - Input: Product IDs
     - Output: Stock status, pricing

   - **HTTP Request Node 2:** Create purchase order
     - Endpoint: POST /api/purchase-orders
     - Input: Order data
     - Output: PO ID, status

   - **HTTP Request Node 3:** Update RetailAnalytics
     - Endpoint: POST /api/webhooks/order-created
     - Input: PO details
     - Output: Confirmation

4. **Conditional Logic**
   - IF node: Check if all products available
   - TRUE: Create PO
   - FALSE: Send notification about unavailable items

5. **Notification Nodes**
   - **Email Node:** Send order notification to retailer
     - Template: Order approval email
     - Include: Product list, total cost, approval link
     - Format: HTML email with branding

   - **Slack/Discord Node (Optional):** Alert team

6. **Error Handling**
   - Try/Catch nodes
   - Retry logic for API failures
   - Error notification to admin
   - Log failures to database

**Deliverables:**
- N8N workflow functional ✓
- End-to-end automation working ✓
- Error handling robust ✓
- Notifications sent correctly ✓

**Effort:** 12 hours
**Tests Required:**
- Webhook triggers workflow
- API calls succeed
- PO created in Legacy Supply
- Email sent to retailer
- Errors handled gracefully

---

**Phase 3 Summary:**
- **Total Time:** 2 weeks
- **Total Effort:** 24 hours
- **Key Milestone:** Automated reordering from RetailAnalytics to Legacy Supply
- **Risk Level:** Low (leveraging existing n8n infrastructure)

---

### Phase 4: Legacy Supply API Development (Weeks 9-10, Parallel)

**Objective:** Build necessary API endpoints in Legacy Supply for integration

**Note:** This phase runs in parallel with Phase 3 (n8n workflow)

#### Week 9: API Design & Product Endpoints

**Tasks:**
1. **API Architecture Planning**
   - Design RESTful API structure
   - Define authentication (API keys, JWT)
   - Plan rate limiting strategy
   - Document endpoints

2. **Product Search API**
   ```javascript
   // POST /api/products/search
   // Request:
   {
     name: "Product Name",
     brand: "Brand Name",
     category: "Flower",
     thc: 20.5,
     cbd: 0.5
   }

   // Response:
   {
     matches: [
       {
         id: 123,
         sku: "LS-12345",
         name: "Exact Match",
         brand: "Brand Name",
         matchScore: 0.95,
         availability: "in_stock",
         wholesalePrice: 25.00
       }
     ]
   }
   ```

3. **Product Availability API**
   ```javascript
   // POST /api/products/availability
   // Request:
   {
     productIds: [123, 456, 789]
   }

   // Response:
   {
     products: [
       {
         id: 123,
         inStock: true,
         quantity: 500,
         wholesalePrice: 25.00,
         caseSize: 12,
         estimatedRestockDate: null
       },
       {
         id: 456,
         inStock: false,
         quantity: 0,
         estimatedRestockDate: "2025-11-25"
       }
     ]
   }
   ```

4. **Database Queries**
   - Optimize product search queries
   - Add indexes for performance
   - Implement fuzzy matching
   - Cache frequently searched products

**Deliverables:**
- Product search API functional ✓
- Availability check working ✓
- API documentation created ✓
- Performance optimized ✓

**Effort:** 8 hours
**Tests Required:**
- Search returns accurate results
- Availability reflects real inventory
- Response time <200ms
- API handles 100 req/min

---

#### Week 10: Purchase Order & Sync APIs

**Tasks:**
1. **Purchase Order Creation API**
   ```javascript
   // POST /api/purchase-orders
   // Request:
   {
     companyId: 456,
     storeId: 789,
     status: "draft",
     items: [
       {
         productId: 123,
         quantity: 24,
         priceAtPo: 25.00
       }
     ],
     notes: "Auto-generated from RetailAnalytics",
     source: "retailanalytics"
   }

   // Response:
   {
     purchaseOrderId: 999,
     orderNumber: "PO-2025-001",
     status: "draft",
     total: 600.00,
     createdAt: "2025-11-17T10:00:00Z",
     approvalUrl: "https://legacysupply.com/po/999/approve"
   }
   ```

2. **Purchase Order Status API**
   ```javascript
   // GET /api/purchase-orders/:id
   // Response:
   {
     id: 999,
     orderNumber: "PO-2025-001",
     status: "approved",
     items: [...],
     total: 600.00,
     createdAt: "2025-11-17T10:00:00Z",
     approvedAt: "2025-11-17T11:30:00Z",
     estimatedDelivery: "2025-11-20"
   }
   ```

3. **Inventory Sync API**
   ```javascript
   // POST /api/inventory/sync
   // Request:
   {
     storeId: 789,
     products: [
       {
         legacySupplyProductId: 123,
         currentRetailStock: 15,
         lastSaleDate: "2025-11-16",
         averageDailySales: 2.5
       }
     ],
     timestamp: "2025-11-17T10:00:00Z"
   }

   // Response:
   {
     synced: true,
     productsUpdated: 50,
     timestamp: "2025-11-17T10:00:15Z"
   }
   ```

4. **Webhook Endpoints**
   ```javascript
   // POST /api/webhooks/order-status
   // Notify RetailAnalytics of order status changes
   ```

5. **Authentication & Security**
   - Implement API key authentication
   - Add rate limiting
   - Log all API requests
   - Add IP whitelisting (optional)

**Deliverables:**
- PO creation API working ✓
- PO status API functional ✓
- Inventory sync operational ✓
- Authentication secure ✓

**Effort:** 8 hours
**Tests Required:**
- PO created successfully
- Status updates reflected
- Sync updates inventory
- Unauthorized requests blocked

---

**Phase 4 Summary:**
- **Total Time:** 2 weeks (parallel with Phase 3)
- **Total Effort:** 16 hours
- **Key Milestone:** Legacy Supply APIs ready for integration
- **Risk Level:** Medium (depends on existing codebase architecture)

---

### Phase 5: Data Collection & Analytics (Weeks 11-12)

**Objective:** Build intelligence layer for compliance, analytics, and market insights

#### Week 11: Automated Data Collection & Consent

**Tasks:**
1. **Consent Management System**
   ```javascript
   // src/services/consentManager.js
   class ConsentManager {
     async requestConsent(userId, consentType) {
       // Present value proposition
       // Show what data will be collected
       // Explain benefits
       // Get explicit consent
       // Store consent record
     }

     async hasConsent(userId, consentType) {
       // Check if user has granted consent
       // Check if consent is still valid (not expired)
       // Return boolean
     }
   }
   ```

2. **Consent UI in RetailAnalytics**
   - Modal dialog explaining data collection
   - Clearly list benefits:
     - Free advanced analytics
     - Automated compliance reporting
     - Market intelligence access
     - Competitive pricing insights
   - Opt-in checkbox
   - "Learn More" details
   - Easy revocation process

3. **Data Collection Pipeline**
   ```javascript
   // src/services/dataCollector.js
   async function collectExportData(exportData, userId) {
     // Check consent
     if (!await consentManager.hasConsent(userId, 'analytics_data')) {
       return;
     }

     // Anonymize sensitive data
     const anonymized = anonymizeData(exportData);

     // Extract insights
     const insights = {
       salesMetrics: extractSalesMetrics(anonymized),
       productPerformance: extractProductPerformance(anonymized),
       inventoryMetrics: extractInventoryMetrics(anonymized),
       complianceData: extractComplianceData(anonymized)
     };

     // Store for aggregation
     await storeAggregatedData(insights);
   }
   ```

4. **Anonymization Functions**
   - Remove customer PII
   - Hash store identifiers
   - Generalize location data (city-level)
   - Preserve statistical significance

5. **Data Storage Strategy**
   - Separate aggregated data tables
   - Time-series data for trends
   - Category-level aggregations
   - Regional aggregations

**Deliverables:**
- Consent system operational ✓
- Data collection automated ✓
- Anonymization working ✓
- Data stored securely ✓

**Effort:** 16 hours
**Tests Required:**
- Consent required before collection
- No collection without consent
- Anonymization removes PII
- Data queryable for insights

---

#### Week 12: Advanced Analytics & Compliance Automation

**Tasks:**
1. **Compliance Report Generator**
   ```javascript
   // src/services/complianceGenerator.js
   async function generateSLGAReport(storeId, dateRange) {
     // Query transaction data
     const transactions = await getTransactions(storeId, dateRange);

     // Generate required reports
     const report = {
       transactionLog: formatTransactionLog(transactions),
       inventoryMovements: formatInventoryMovements(transactions),
       taxCalculations: calculateTaxes(transactions),
       auditTrail: generateAuditTrail(transactions)
     };

     // Export to required format (PDF, CSV, etc.)
     return exportReport(report, 'SLGA_Transaction_Log');
   }
   ```

2. **Automated Report Generation**
   - Daily transaction logs
   - Weekly inventory reports
   - Monthly tax summaries
   - Quarterly regulatory submissions
   - Schedule generation via n8n

3. **Advanced Analytics Dashboard**
   ```javascript
   // Add new page: src/pages/AdvancedAnalytics.jsx
   // Features:
   // - Predictive analytics
   // - Demand forecasting
   // - Product recommendations
   // - Pricing optimization
   // - Customer segmentation
   // - Seasonal trend analysis
   ```

4. **Market Intelligence Features**
   - Competitive pricing analysis (from aggregated data)
   - Category performance benchmarks
   - Regional demand patterns
   - Product popularity rankings
   - Supplier performance metrics

5. **Premium Features Setup**
   - Feature flagging system
   - Subscription tier logic
   - Payment integration (Stripe)
   - Usage tracking
   - Billing automation

**Deliverables:**
- Compliance reports generated automatically ✓
- Advanced analytics functional ✓
- Market intelligence available ✓
- Premium features ready ✓

**Effort:** 16 hours
**Tests Required:**
- Reports generate correctly
- Analytics calculations accurate
- Market data anonymized
- Premium features gate-kept

---

**Phase 5 Summary:**
- **Total Time:** 2 weeks
- **Total Effort:** 32 hours
- **Key Milestone:** Intelligence layer operational, premium features ready
- **Risk Level:** Low (building on existing data infrastructure)

---

### Phase 6: Polish, Testing & Launch (Weeks 13-14)

**Objective:** Production-ready system with documentation and beta customers

#### Week 13: Performance, Security & Documentation

**Tasks:**
1. **Performance Optimization**
   - Run performance profiling
   - Optimize slow database queries
   - Add missing indexes
   - Implement connection pooling
   - Enable gzip compression
   - Optimize bundle sizes
   - Add service worker caching (PWA)

2. **Security Audit**
   - Review authentication flows
   - Check for SQL injection vulnerabilities
   - Verify input validation
   - Test rate limiting
   - Review API token security
   - Check CORS configuration
   - Test file upload security
   - Review error messages (no info leakage)

3. **Browser Extension Polish**
   - Icon and branding
   - Smooth animations
   - Loading states
   - Empty states
   - Error messages user-friendly
   - Offline handling
   - Chrome Web Store listing prep

4. **Documentation**
   - User guide for retailers
   - Installation instructions
   - Troubleshooting guide
   - API documentation
   - N8N workflow documentation
   - Admin guide
   - FAQ

5. **Monitoring Setup**
   - Sentry error tracking configured
   - Uptime monitoring (UptimeRobot or Pingdom)
   - Performance monitoring (New Relic or DataDog)
   - Analytics (PostHog or Mixpanel)
   - Log aggregation (if needed)

**Deliverables:**
- System optimized ✓
- Security audit passed ✓
- Documentation complete ✓
- Monitoring active ✓

**Effort:** 16 hours
**Tests Required:**
- Page load times <2s
- No security vulnerabilities
- All documentation reviewed
- Monitoring capturing events

---

#### Week 14: Beta Testing & Launch

**Tasks:**
1. **Beta Customer Recruitment**
   - Identify 5 friendly retail customers
   - Reach out and explain value proposition
   - Offer free beta access
   - Schedule onboarding calls
   - Create feedback forms

2. **Beta Onboarding**
   - Install browser extension
   - Configure API tokens
   - Connect to Legacy Supply
   - Test first CSV upload
   - Verify data flow
   - Create first automated order

3. **Beta Testing**
   - Monitor usage closely
   - Collect feedback daily
   - Fix critical bugs immediately
   - Track key metrics:
     - Time to first upload
     - Upload success rate
     - Order creation rate
     - User satisfaction
   - Iterate based on feedback

4. **Launch Preparation**
   - Chrome Web Store submission
   - Firefox Add-ons submission
   - Marketing materials (landing page, demo video)
   - Pricing page
   - Support email setup
   - Knowledge base setup

5. **Soft Launch**
   - Announce to beta customers
   - Share with close network
   - Post on relevant forums/communities
   - Email existing Legacy Supply customers
   - Monitor for issues

**Deliverables:**
- 5 beta customers onboarded ✓
- Feedback collected and acted on ✓
- Critical bugs fixed ✓
- Extension published ✓

**Effort:** 16 hours
**Tests Required:**
- All beta customers successfully onboarded
- No critical bugs reported
- >80% customer satisfaction
- Extension approved by stores

---

**Phase 6 Summary:**
- **Total Time:** 2 weeks
- **Total Effort:** 32 hours
- **Key Milestone:** Production launch with paying customers
- **Risk Level:** Medium (user adoption uncertainty)

---

## 🎯 Technical Specifications

### API Specifications

#### RetailAnalytics Extension API

**Base URL:** `https://analytics.yourdomain.com/api`

##### Authentication
```http
Authorization: Bearer {apiToken}
Content-Type: application/json
```

##### POST /extension/upload
Upload CSV data from browser extension.

**Request:**
```json
{
  "csvData": "string (CSV content)",
  "exportType": "INVENTORY_LOG | PRODUCT_CATALOG | INVENTORY_EXPORT",
  "timestamp": "ISO 8601 timestamp",
  "metadata": {
    "source": "greenline",
    "filename": "inventory_export_2025-11-17.csv",
    "storeId": "optional - if known"
  }
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "uploadId": "uuid",
  "processedRows": 1234,
  "skippedRows": 5,
  "newProducts": 10,
  "updatedProducts": 1224,
  "reorderAnalysis": {
    "triggeredReorder": true,
    "productsToReorder": 15,
    "urgency": "normal | urgent",
    "estimatedOrderValue": 5000.00
  },
  "timestamp": "ISO 8601 timestamp"
}
```

**Response (Error - 400/401/500):**
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

---

##### POST /products/match
Match a product from Greenline to Legacy Supply catalog.

**Request:**
```json
{
  "name": "Product Name",
  "brand": "Brand Name",
  "gtin": "1234567890123",
  "category": "Flower",
  "thc": 20.5,
  "cbd": 0.5,
  "size": "3.5g"
}
```

**Response:**
```json
{
  "matched": true,
  "confidence": 0.95,
  "legacySupplyProduct": {
    "id": 123,
    "sku": "LS-12345",
    "name": "Matched Product Name",
    "brand": "Brand Name",
    "wholesalePrice": 25.00,
    "availability": "in_stock",
    "caseSize": 12,
    "imageUrl": "https://..."
  },
  "alternatives": [
    {
      "id": 456,
      "name": "Similar Product",
      "confidence": 0.75,
      "wholesalePrice": 23.00
    }
  ]
}
```

---

##### GET /api/health
Health check endpoint for monitoring.

**Response (Healthy - 200):**
```json
{
  "status": "healthy",
  "timestamp": "ISO 8601 timestamp",
  "services": {
    "database": "ok",
    "redis": "ok",
    "s3": "ok"
  },
  "uptime": 86400
}
```

**Response (Unhealthy - 503):**
```json
{
  "status": "unhealthy",
  "timestamp": "ISO 8601 timestamp",
  "services": {
    "database": "ok",
    "redis": "error",
    "s3": "ok"
  },
  "error": "Redis connection failed"
}
```

---

#### Legacy Supply APIs

**Base URL:** `https://api.legacysupply.com/v1`

##### Authentication
```http
Authorization: Bearer {apiKey}
Content-Type: application/json
```

##### POST /products/search
Search for products by criteria.

**Request:**
```json
{
  "name": "optional - partial name search",
  "brand": "optional - exact brand match",
  "category": "optional - category filter",
  "gtin": "optional - exact GTIN match",
  "thc": "optional - THC percentage range",
  "limit": 20,
  "offset": 0
}
```

**Response:**
```json
{
  "products": [
    {
      "id": 123,
      "sku": "LS-12345",
      "name": "Product Name",
      "brand": "Brand Name",
      "category": "Flower",
      "thc": 20.5,
      "cbd": 0.5,
      "wholesalePrice": 25.00,
      "retailPrice": 40.00,
      "availability": "in_stock",
      "caseSize": 12
    }
  ],
  "total": 50,
  "limit": 20,
  "offset": 0
}
```

---

##### POST /products/availability
Check availability of specific products.

**Request:**
```json
{
  "productIds": [123, 456, 789]
}
```

**Response:**
```json
{
  "products": [
    {
      "id": 123,
      "inStock": true,
      "quantity": 500,
      "wholesalePrice": 25.00,
      "caseSize": 12,
      "estimatedRestockDate": null
    },
    {
      "id": 456,
      "inStock": false,
      "quantity": 0,
      "wholesalePrice": 30.00,
      "caseSize": 24,
      "estimatedRestockDate": "2025-11-25"
    }
  ]
}
```

---

##### POST /purchase-orders
Create a new purchase order.

**Request:**
```json
{
  "companyId": 456,
  "storeId": 789,
  "status": "draft",
  "items": [
    {
      "productId": 123,
      "quantity": 24,
      "priceAtPo": 25.00
    }
  ],
  "notes": "Auto-generated from RetailAnalytics",
  "source": "retailanalytics"
}
```

**Response:**
```json
{
  "purchaseOrderId": 999,
  "orderNumber": "PO-2025-001",
  "status": "draft",
  "items": [...],
  "subtotal": 600.00,
  "tax": 75.00,
  "total": 675.00,
  "createdAt": "2025-11-17T10:00:00Z",
  "approvalUrl": "https://legacysupply.com/po/999/approve"
}
```

---

##### GET /purchase-orders/:id
Get purchase order status.

**Response:**
```json
{
  "id": 999,
  "orderNumber": "PO-2025-001",
  "status": "approved",
  "items": [...],
  "total": 675.00,
  "createdAt": "2025-11-17T10:00:00Z",
  "approvedAt": "2025-11-17T11:30:00Z",
  "shippedAt": null,
  "deliveredAt": null,
  "estimatedDelivery": "2025-11-20",
  "trackingNumber": null
}
```

---

##### POST /inventory/sync
Sync retail inventory data back to Legacy Supply.

**Request:**
```json
{
  "storeId": 789,
  "products": [
    {
      "legacySupplyProductId": 123,
      "currentRetailStock": 15,
      "lastSaleDate": "2025-11-16",
      "averageDailySales": 2.5
    }
  ],
  "timestamp": "2025-11-17T10:00:00Z"
}
```

**Response:**
```json
{
  "synced": true,
  "productsUpdated": 50,
  "timestamp": "2025-11-17T10:00:15Z"
}
```

---

### N8N Workflow Configuration

#### Workflow: Automated Reordering

**Trigger:** Webhook
**Webhook URL:** `https://your-n8n-instance.com/webhook/reorder`

**Nodes:**

1. **Webhook Trigger**
   - Method: POST
   - Authentication: None (or Basic Auth)
   - Response: Immediate

2. **Function: Parse Webhook Data**
   ```javascript
   const payload = $json;
   const products = payload.products || [];
   const urgency = payload.urgency || 'normal';
   const userId = payload.userId;

   return {
     userId,
     urgency,
     products: products.map(p => ({
       productId: p.productId,
       productName: p.name,
       quantity: p.recommendedOrderQty,
       legacySupplyProductId: p.legacySupplyProduct.id,
       wholesalePrice: p.legacySupplyProduct.wholesalePrice
     })),
     totalEstimate: products.reduce((sum, p) =>
       sum + (p.recommendedOrderQty * p.legacySupplyProduct.wholesalePrice), 0
     )
   };
   ```

3. **HTTP Request: Check Legacy Supply Availability**
   - Method: POST
   - URL: `https://api.legacysupply.com/v1/products/availability`
   - Authentication: Bearer Token
   - Body:
     ```json
     {
       "productIds": "{{$json.products.map(p => p.legacySupplyProductId)}}"
     }
     ```

4. **IF: All Products Available**
   - Condition: `{{$json.products.every(p => p.inStock)}}`
   - TRUE: Continue to create PO
   - FALSE: Send unavailability notification

5. **HTTP Request: Create Purchase Order**
   - Method: POST
   - URL: `https://api.legacysupply.com/v1/purchase-orders`
   - Authentication: Bearer Token
   - Body:
     ```json
     {
       "companyId": "{{$json.companyId}}",
       "storeId": "{{$json.storeId}}",
       "status": "draft",
       "items": "{{$json.products}}",
       "notes": "Auto-generated from RetailAnalytics",
       "source": "retailanalytics"
     }
     ```

6. **Email: Notify Retailer**
   - To: `{{$json.retailerEmail}}`
   - Subject: `New Purchase Order Ready for Approval - {{$json.orderNumber}}`
   - Body: HTML template with order details and approval link

7. **HTTP Request: Update RetailAnalytics**
   - Method: POST
   - URL: `https://analytics.yourdomain.com/api/webhooks/order-created`
   - Body:
     ```json
     {
       "purchaseOrderId": "{{$json.purchaseOrderId}}",
       "orderNumber": "{{$json.orderNumber}}",
       "status": "draft",
       "timestamp": "{{$now}}"
     }
     ```

8. **Error Handling**
   - On Error: Send notification to admin
   - Retry: 3 attempts with exponential backoff
   - Log: Save to error log database

---

### Database Schema Extensions

#### New Tables for RetailAnalytics

```prisma
model ApiToken {
  id        Int      @id @default(autoincrement())
  userId    Int
  user      User     @relation(fields: [userId], references: [id])
  token     String   @unique
  name      String?  // Optional name for the token
  createdAt DateTime @default(now())
  expiresAt DateTime?
  lastUsed  DateTime?
  isActive  Boolean  @default(true)

  @@index([userId])
  @@index([token])
}

model DataConsent {
  id           Int      @id @default(autoincrement())
  userId       Int
  user         User     @relation(fields: [userId], references: [id])
  consentType  String   // analytics_data, compliance_data, market_data
  granted      Boolean  @default(false)
  grantedAt    DateTime?
  revokedAt    DateTime?
  expiresAt    DateTime?

  @@unique([userId, consentType])
  @@index([userId])
}

model AggregatedData {
  id             Int      @id @default(autoincrement())
  dataType       String   // sales_metrics, product_performance, etc.
  periodStart    DateTime
  periodEnd      DateTime
  region         String?  // Anonymized to city/province level
  categoryData   Json     // Aggregated category-level data
  productData    Json     // Aggregated product-level data
  complianceData Json?    // Aggregated compliance metrics
  createdAt      DateTime @default(now())

  @@index([dataType, periodStart])
  @@index([region])
}

model ExtensionUpload {
  id           Int      @id @default(autoincrement())
  userId       Int
  user         User     @relation(fields: [userId], references: [id])
  storeId      Int?
  store        Store?   @relation(fields: [storeId], references: [id])
  exportType   String   // INVENTORY_LOG, PRODUCT_CATALOG, INVENTORY_EXPORT
  filename     String
  fileSize     Int      // bytes
  rowsProcessed Int
  rowsSkipped  Int
  success      Boolean
  errorMessage String?
  uploadedAt   DateTime @default(now())

  @@index([userId])
  @@index([storeId])
  @@index([uploadedAt])
}

model ReorderRecommendation {
  id          Int      @id @default(autoincrement())
  storeId     Int
  store       Store    @relation(fields: [storeId], references: [id])
  productId   Int
  product     ProductCatalog @relation(fields: [productId], references: [id])
  currentStock Int
  salesVelocity Float
  daysUntilStockout Float
  recommendedQty Int
  urgency     String   // normal, urgent
  createdAt   DateTime @default(now())
  actionedAt  DateTime?
  orderId     Int?

  @@index([storeId])
  @@index([productId])
  @@index([createdAt])
}
```

---

## 👥 Resource Requirements

### Development Team

**Phase 1-2 (Weeks 1-8):**
- 1x Full-stack Developer (you)
- **Estimated Hours:** 108 hours
- **Timeline:** 8 weeks at ~13-15 hours/week
- **Budget:** Internal development

**Phase 3-4 (Weeks 9-10):**
- 1x Full-stack Developer (you)
- **Estimated Hours:** 40 hours
- **Timeline:** 2 weeks at ~20 hours/week
- **Budget:** Internal development

**Phase 5-6 (Weeks 11-14):**
- 1x Full-stack Developer (you)
- Optional: 1x Part-time Designer (UI/UX polish)
- Optional: 1x Technical Writer (documentation)
- **Estimated Hours:** 64 hours + optional 16 hours (design/docs)
- **Timeline:** 4 weeks
- **Budget:** Internal + $500-1,000 for contractors (optional)

**Total Development Time:** 212 hours over 14 weeks

---

### Infrastructure Costs

**Existing (RetailAnalytics on Railway):**
- Railway hosting: ~$50-100/month
- PostgreSQL: Included
- Redis: Included
- S3/Wasabi: ~$10-20/month

**New Requirements:**
- n8n: Self-hosted (existing infrastructure)
- Sentry: Free tier (5k events/month) → $26/month for 50k
- Domain & SSL: ~$15/year

**Beta Phase (Months 1-3):**
- Total: ~$75-150/month

**Growth Phase (25-50 customers):**
- Railway: ~$150-300/month (scale up)
- Sentry: ~$50/month
- CDN (Cloudflare): Free → $20/month
- Support tools (Intercom/Help Scout): $50/month
- Total: ~$270-420/month

---

### Tools & Services

**Development:**
- GitHub (existing)
- VS Code (free)
- Chrome DevTools (free)
- Postman/Insomnia (free)

**Testing:**
- Vitest (free)
- Playwright (free)
- BrowserStack (optional, $29/month for cross-browser testing)

**Monitoring:**
- Sentry (error tracking) - $26/month
- UptimeRobot (uptime monitoring) - Free
- PostHog (product analytics) - Free tier

**Marketing:**
- Landing page (existing or Webflow/Framer) - $0-50/month
- Email marketing (Mailchimp/SendGrid) - Free → $20/month
- Demo video (Loom) - Free

**Support:**
- Help center (Notion or Gitbook) - Free → $10/month
- Email support (Gmail) - Free
- Live chat (optional) - $50/month

**Total Monthly Operational Cost:** $100-200/month (bootstrap mode)

---

## ⚠️ Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation Strategy |
|------|-----------|--------|---------------------|
| **Browser Extension API Changes** | Medium | High | Monitor Chrome/Firefox release notes, maintain compatibility layers, prepare for Manifest V3 updates |
| **DOM Structure Changes in Greenline** | High | High | Use flexible selectors, implement retry logic, version detection, regular testing on Greenline updates |
| **Rate Limiting by Greenline** | Low | Medium | Respect robots.txt, implement exponential backoff, monitor request patterns |
| **CSV Format Changes** | Medium | Medium | Flexible parsing with fallbacks, detect format changes, alert admin for manual review |
| **Database Performance at Scale** | Medium | Medium | Monitor query performance, add indexes proactively, implement query optimization, consider read replicas |
| **N8N Workflow Failures** | Medium | High | Comprehensive error handling, retry logic, admin alerts, manual fallback procedures |
| **Legacy Supply API Downtime** | Low | High | Queue orders locally, retry mechanism, notify users of delays, maintain order backlog |
| **Data Privacy Breach** | Low | Critical | Encryption at rest and in transit, regular security audits, anonymization, access controls |

---

### Business Risks

| Risk | Likelihood | Impact | Mitigation Strategy |
|------|-----------|--------|---------------------|
| **Low Customer Adoption** | Medium | High | Start with friendly beta customers, prove value quickly, iterate based on feedback, offer free trial period |
| **Greenline Blocks Extension** | Low | Critical | Maintain non-intrusive approach, comply with ToS, have legal review, prepare for API partnership discussions |
| **Competitive Response** | Medium | Medium | Move fast, build strong relationships, focus on service quality, differentiate on support and intelligence |
| **Pricing Too High/Low** | Medium | Medium | Start with tier pricing, collect feedback, be willing to adjust, focus on ROI demonstration |
| **Customer Churn** | Medium | High | Focus on value delivery, excellent support, continuous feature development, loyalty programs |
| **Legacy Supply Bottleneck** | Medium | Medium | Improve fulfillment processes, hire additional staff, optimize inventory management |

---

### Regulatory & Compliance Risks

| Risk | Likelihood | Impact | Mitigation Strategy |
|------|-----------|--------|---------------------|
| **Cannabis Regulation Changes** | Medium | High | Stay informed on regulations, flexible compliance system, legal counsel on retainer |
| **Data Privacy Laws (GDPR/CCPA)** | Medium | High | Clear consent, data minimization, right to deletion, privacy policy, legal review |
| **PCI Compliance (if handling payments)** | Low | High | Use Stripe/payment processor, never store credit card data, annual audit |
| **Industry-Specific Regulations** | Medium | High | Consult with compliance experts, build audit trails, documentation, regulatory reporting features |

---

### Mitigation Action Plan

**High Priority (Pre-Launch):**
1. ✅ Comprehensive error handling in extension
2. ✅ Security audit by external firm
3. ✅ Legal review of data collection practices
4. ✅ Backup and disaster recovery plan
5. ✅ Customer data encryption

**Medium Priority (Within 3 Months):**
1. Load testing for database performance
2. Implement read replicas
3. Set up automated backups
4. Create runbooks for common issues
5. Establish SLAs with customers

**Ongoing:**
1. Monthly security reviews
2. Quarterly compliance audits
3. Regular customer feedback sessions
4. Competitive analysis
5. Regulatory monitoring

---

## 📊 Success Metrics

### Key Performance Indicators (KPIs)

#### Technical KPIs

**Extension Performance:**
- **Installation Success Rate:** >95%
- **Upload Success Rate:** >98%
- **Product Match Accuracy:** >90%
- **Average Upload Time:** <5 seconds
- **Extension Crash Rate:** <0.1%

**System Performance:**
- **API Response Time (P95):** <500ms
- **Database Query Time (P95):** <200ms
- **Uptime:** >99.9%
- **Error Rate:** <0.1%
- **Cache Hit Rate:** >80%

**Data Quality:**
- **Successful CSV Parses:** >95%
- **Product Matching Confidence:** >0.85 average
- **Data Completeness:** >90%

---

#### Business KPIs

**Customer Acquisition:**
- **Beta Customers (Month 3):** 5 customers
- **Paying Customers (Month 6):** 10-15 customers
- **Paying Customers (Month 12):** 25-50 customers
- **Customer Acquisition Cost (CAC):** <$500
- **Payback Period:** <6 months

**Revenue:**
- **MRR (Month 6):** $2,000-5,000
- **MRR (Month 12):** $5,000-25,000
- **Annual Recurring Revenue (ARR - Year 1):** $60,000-300,000
- **Average Revenue Per User (ARPU):** $200-500/month
- **Revenue Growth Rate:** >20% month-over-month

**Customer Success:**
- **Customer Satisfaction (CSAT):** >4.5/5
- **Net Promoter Score (NPS):** >50
- **Customer Retention:** >90% after 12 months
- **Feature Adoption:** >70% using automated reorder
- **Support Tickets:** <5 per customer per month

**Operational:**
- **Time Saved per Customer:** >20 hours/month
- **Stockout Reduction:** >50%
- **Order Accuracy:** >95%
- **Compliance Report Generation Time:** <5 minutes
- **Average Order Value (Legacy Supply):** >$2,000

---

#### Product KPIs

**User Engagement:**
- **Daily Active Users (DAU):** >60% of customers
- **Weekly CSV Uploads:** >5 per customer
- **Orders Placed per Month:** >3 per customer
- **Feature Usage Rate:**
  - Automated uploads: >80%
  - Reorder recommendations: >60%
  - Compliance reports: >40%
  - Advanced analytics: >50%

**Value Delivered:**
- **Revenue Increase for Customers:** >15%
- **Cost Savings for Customers:** >$1,000/month
- **Time Savings:** >20 hours/month
- **Compliance Risk Reduction:** Measurable decrease in violations

---

### Milestone Tracking

**Month 1-2: Foundation**
- ✅ RetailAnalytics production-ready
- ✅ Extension scaffold complete
- ✅ Manual upload working
- **Success Criteria:** Can upload CSV manually end-to-end

**Month 3: Beta Launch**
- ✅ 5 beta customers onboarded
- ✅ Automated upload working
- ✅ Product matching functional
- **Success Criteria:** All beta customers actively using

**Month 4-6: Scale & Iterate**
- ✅ 10-15 paying customers
- ✅ N8N automation operational
- ✅ $2,000-5,000 MRR
- **Success Criteria:** Positive unit economics, >90% retention

**Month 7-12: Growth**
- ✅ 25-50 customers
- ✅ Advanced features launched
- ✅ $5,000-25,000 MRR
- **Success Criteria:** Profitable, scalable, ready for next phase

---

## 📅 Timeline & Milestones

### Gantt Chart View

```
Week 1-2:   [Foundation - Safety & Testing]          ████████
Week 3-4:   [Foundation - Config & API]                      ████████
Week 5-6:   [Extension - Scaffold & Upload]                          ████████
Week 7-8:   [Extension - Automation & UI]                                    ████████
Week 9-10:  [N8N + Legacy Supply APIs]                                              ████████
Week 11-12: [Data & Analytics]                                                              ████████
Week 13-14: [Polish & Launch]                                                                       ████████
```

### Critical Path

```
API Token System (Week 4)
    ↓
Extension Scaffold (Week 5)
    ↓
CSV Upload (Week 6)
    ↓
Download Interception (Week 7)
    ↓
Product Matching (Week 8)
    ↓
Reorder Intelligence (Week 9)
    ↓
N8N Workflow (Week 10)
    ↓
Beta Testing (Week 14)
```

**Total Duration:** 14 weeks (3.5 months)
**Critical Path Duration:** 14 weeks
**Float:** 0 weeks (tight schedule)
**Recommended Buffer:** Add 2 weeks (16 weeks total)

---

### Detailed Timeline with Dependencies

| Week | Phase | Tasks | Dependencies | Deliverables |
|------|-------|-------|--------------|--------------|
| **1** | Foundation | Error boundaries, rate limiting | None | Safety features |
| **2** | Foundation | Testing setup, critical tests | Week 1 | Test framework |
| **3** | Foundation | Config, Sentry, health checks | Week 1-2 | Monitoring |
| **4** | Foundation | API tokens, extension endpoints | Week 3 | **Extension-ready APIs** |
| **5** | Extension | Scaffold, manifest, popup UI | Week 4 | Extension loads |
| **6** | Extension | Auth, manual CSV upload | Week 5 | **Manual upload works** |
| **7** | Extension | Download interception | Week 6 | Auto-detection |
| **8** | Extension | Product matching, UI injection | Week 7 | **Order buttons appear** |
| **9** | Intelligence | Reorder engine, webhooks | Week 8 | Recommendations |
| **9** | Legacy APIs | Product search, availability | None (parallel) | APIs ready |
| **10** | Automation | N8N workflow configuration | Week 9 | **End-to-end automation** |
| **10** | Legacy APIs | PO creation, inventory sync | Week 9 (parallel) | Full API suite |
| **11** | Data | Consent system, data collection | Week 10 | Data pipeline |
| **12** | Data | Advanced analytics, compliance | Week 11 | Premium features |
| **13** | Launch | Performance, security, docs | Week 12 | Production-ready |
| **14** | Launch | Beta testing, store submission | Week 13 | **Public launch** |

---

## 📎 Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| **Greenline** | Point-of-sale system used by cannabis retailers for daily operations |
| **RetailAnalytics** | Your analytics platform for inventory tracking and sales analysis |
| **Legacy Supply** | Your wholesale distribution company for cannabis products |
| **GTIN** | Global Trade Item Number - unique product identifier (barcode) |
| **SKU** | Stock Keeping Unit - product identifier |
| **PO** | Purchase Order |
| **CSV** | Comma-Separated Values file format |
| **API** | Application Programming Interface |
| **N8N** | Self-hosted workflow automation tool |
| **Webhook** | HTTP callback for event notifications |
| **Manifest V3** | Latest Chrome extension specification |
| **Content Script** | JavaScript that runs in the context of web pages |
| **Service Worker** | Background script in browser extensions |
| **MRR** | Monthly Recurring Revenue |
| **ARR** | Annual Recurring Revenue |
| **CAC** | Customer Acquisition Cost |
| **LTV** | Lifetime Value |

---

### B. References & Resources

**Wasp Framework:**
- Documentation: https://wasp-lang.dev/docs
- Discord: https://discord.gg/rzdnErX
- GitHub: https://github.com/wasp-lang/wasp

**Chrome Extension Development:**
- Manifest V3: https://developer.chrome.com/docs/extensions/mv3/
- Getting Started: https://developer.chrome.com/docs/extensions/mv3/getstarted/
- API Reference: https://developer.chrome.com/docs/extensions/reference/

**N8N:**
- Documentation: https://docs.n8n.io/
- Community: https://community.n8n.io/
- Workflow Templates: https://n8n.io/workflows

**Testing:**
- Vitest: https://vitest.dev/
- Testing Library: https://testing-library.com/
- Playwright: https://playwright.dev/

**Monitoring:**
- Sentry: https://sentry.io/
- UptimeRobot: https://uptimerobot.com/

---

### C. Contact & Communication

**Development Team:**
- Lead Developer: [Your Name]
- Email: [your-email]
- Slack/Discord: [channel]

**Weekly Sync:**
- Schedule: Every Monday, 10:00 AM
- Duration: 30 minutes
- Agenda: Progress review, blockers, next steps

**Daily Standup:**
- Format: Async (Slack message)
- Questions: What did you do? What will you do? Any blockers?

**Emergency Contact:**
- On-call: [phone number]
- Escalation: [backup contact]

---

### D. Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-11-17 | 1.0 | Initial roadmap created | Dev Team |
| | | | |
| | | | |

---

### E. Approval Sign-Off

**Reviewed and Approved By:**

- [ ] Product Owner: ___________________ Date: ___________
- [ ] Technical Lead: ___________________ Date: ___________
- [ ] Business Owner: ___________________ Date: ___________

---

## 🚀 Next Steps

**Immediate Actions (This Week):**
1. Review and approve this roadmap
2. Set up development environment
3. Schedule kickoff meeting
4. Create project board (GitHub Projects or Trello)
5. Start Week 1 tasks

**Questions to Answer:**
1. Are there any phases that need adjustment?
2. Do we have all necessary API access (Greenline, n8n)?
3. Are the timeline and resource estimates realistic?
4. Should we add any additional features to the scope?
5. Who will be the primary stakeholders for reviews?

**Ready to Start Building?**
Let's begin with Phase 1, Week 1! 🎯

---

**Document Status:** ✅ Ready for Review
**Last Updated:** November 17, 2025
**Next Review:** Start of each phase
