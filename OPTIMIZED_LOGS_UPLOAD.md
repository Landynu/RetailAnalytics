# Optimized Inventory Logs Upload - Implementation Guide

## Current Problem
- **18,164 records** taking ~5 minutes for only 200 records
- **Sequential database queries**: 4 queries per record = 72,656 total queries
- **Estimated time**: 7.5+ HOURS at current rate

## New Approach

Replace the entire sequential loop with bulk operations:

```javascript
export const uploadInventoryLogs = async ({ csvData }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const startTime = Date.now();
  const csvSize = new Blob([csvData]).size;
  const ts = () => new Date().toISOString()split('T')[1].split('.')[0];
  
  console.log(`\n[${ts()}] 📥 STARTING INVENTORY LOGS UPLOAD`);
  console.log(`[${ts()}] File size: ${(csvSize / 1024 / 1024).toFixed(2)}MB`);
  console.log(`[${ts()}] Stage 1/4: Parsing CSV...`);

  // STAGE 1: Parse CSV (2-3 seconds)
  const movements = [];
  await new Promise((resolve, reject) => {
    Readable.from(csvData.split('\n'))
      .pipe(csvParser())
      .on('data', (data) => {
        if (data.Product && data.Location && data.Date) {
          movements.push({
            productName: data.Product.trim(),
            barcode: data.Barcode?.trim() || null,
            location: data.Location.trim(),
            date: new Date(data.Date),
            type: data.Type?.trim() || 'Unknown',
            employee: data.Employee?.trim() || null,
            openingQty: parseInt(data.Opening) || 0,
            changeQty: parseInt(data.Change) || 0,
            closingQty: parseInt(data.Closing) || 0
          });
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });
  
  console.log(`[${ts()}] ✓ Stage 1: Parsed ${movements.length} records`);
  console.log(`[${ts()}] Stage 2/4: Bulk lookup stores and products...`);

  // STAGE 2: Bulk lookup stores and products (1-2 seconds)
  const userStores = await context.entities.Store.findMany({
    where: { userId: context.user.id }
  });
  
  const storeMap = new Map();
  userStores.forEach(s => {
    storeMap.set(s.name, s.id);
    if (s.reportName) storeMap.set(s.reportName, s.id);
  });

  const uniqueBarcodes = [...new Set(movements.map(m => m.barcode).filter(Boolean))];
  const products = await context.entities.ProductCatalog.findMany({
    where: { gtin: { in: uniqueBarcodes } }
  });
  
  const productMap = new Map();
  products.forEach(p => productMap.set(p.gtin, p));
  
  console.log(`[${ts()}] ✓ Stage 2: Found ${userStores.length} stores, ${products.length} products`);
  console.log(`[${ts()}] Stage 3/4: Bulk creating movements...`);

  // STAGE 3: Bulk create movements (5-10 seconds)
  const movementsToCreate = [];
  const skipped = [];
  
  for (const m of movements) {
    const storeId = storeMap.get(m.location);
    const product = productMap.get(m.barcode);
    
    if (!storeId || !product) {
      skipped.push(m);
      continue;
    }
    
    movementsToCreate.push({
      storeId,
      productId: product.id,
      date: m.date,
      type: m.type,
      employee: m.employee,
      openingQty: m.openingQty,
      changeQty: m.changeQty,
      closingQty: m.closingQty
    });
  }

  await context.entities.InventoryMovement.createMany({
    data: movementsToCreate
  });
  
  console.log(`[${ts()}] ✓ Stage 3: Created ${movementsToCreate.length} movements, skipped ${skipped.length}`);
  console.log(`[${ts()}] Stage 4/4: Updating stock levels...`);

  // STAGE 4: DELETE + BULK INSERT stock levels (2-5 seconds)
  const stockUpdates = movementsToCreate.map(m => ({
    storeId: m.storeId,
    productId: m.productId,
    quantity: m.closingQty
  }));

  const storeIds = [...new Set(stockUpdates.map(s => s.storeId))];
  const productIds = [...new Set(stockUpdates.map(s => s.productId))];

  await context.entities.StockLevel.deleteMany({
    where: {
      AND: [
        { storeId: { in: storeIds } },
        { productId: { in: productIds } }
      ]
    }
  });

  await context.entities.StockLevel.createMany({
    data: stockUpdates.map(s => ({
      ...s,
      lastUpdated: new Date()
    }))
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[${ts()}] ✅ COMPLETE: ${movements.length} records in ${duration}s`);
  
  return {
    movementsProcessed: movementsToCreate.length,
    totalMovements: movements.length,
    skippedRows: skipped.length
  };
};
```

## Expected Performance

| Metric | Old | New | Improvement |
|--------|-----|-----|-------------|
| Database Queries | 72,656 | ~10 | 99.99% reduction |
| Processing Time | 7.5+ hours | 30-60 seconds | 450x faster |
| Records/second | ~0.7 | ~300-600 | 400-800x faster |

## Implementation

Toggle to Act Mode and I'll implement this complete rewrite!
