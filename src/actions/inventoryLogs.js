import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { HttpError } from 'wasp/server';
import { invalidateCachePattern, warmOrderingAnalyticsCache } from '../cache.js';

export const uploadInventoryLogs = async ({ csvData }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const startTime = Date.now();
  const csvSize = new Blob([csvData]).size;
  const ts = () => new Date().toISOString().split('T')[1].split('.')[0];

  console.log(`\n[${ts()}] STARTING INVENTORY LOGS UPLOAD`);
  console.log(`[${ts()}] File size: ${(csvSize / 1024 / 1024).toFixed(2)}MB`);
  console.log(`[${ts()}] Stage 1/5: Parsing CSV...`);

  // Helper function to extract brand from product name
  const extractBrand = (productName) => {
    if (!productName) return null;
    const match = productName.match(/\(([^)]+)\)/);
    return match ? match[1].trim() : null;
  };

  // STAGE 1: Parse CSV (2-3 seconds)
  const movements = [];
  const readable = Readable.from(csvData.split('\n'));

  await new Promise((resolve, reject) => {
    let rowCount = 0;
    const maxRows = 50000;

    readable
      .pipe(csvParser())
      .on('data', (data) => {
        rowCount++;
        if (rowCount > maxRows) {
          reject(new Error(`File too large: More than ${maxRows} rows.`));
          return;
        }

        if (data.Product && data.Location && data.Date) {
          let parsedDate;
          try {
            parsedDate = new Date(data.Date);
            if (isNaN(parsedDate.getTime())) parsedDate = new Date('2023-10-31');
          } catch (e) {
            parsedDate = new Date('2023-10-31');
          }

          movements.push({
            productName: data.Product.trim(),
            sku: data.SKU?.trim() || null,
            barcode: data.Barcode?.trim() || null,
            location: data.Location.trim(),
            brand: extractBrand(data.Product),
            date: parsedDate,
            type: data.Type?.trim() || 'Unknown',
            employee: data.Employee?.trim() || null,
            openingQty: parseInt(data.Opening) || 0,
            changeQty: parseInt(data.Change) || 0,
            closingQty: parseInt(data.Closing) || 0,
            notes: data.Notes?.trim() || null
          });
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`[${ts()}] Stage 1 complete: Parsed ${movements.length} movement records`);
  console.log(`[${ts()}] Stage 2/5: Bulk lookup stores and products...`);

  // STAGE 2: Bulk lookup stores and products (1-2 seconds)
  const userStores = await context.entities.Store.findMany({
    where: { userId: context.user.id }
  });

  if (userStores.length === 0) {
    throw new HttpError(400, 'No stores found. Please create a store first.');
  }

  // Create store lookup map
  const storeMap = new Map();
  userStores.forEach(s => {
    storeMap.set(s.name, s.id);
    if (s.reportName) storeMap.set(s.reportName, s.id);
  });

  // Bulk fetch all products by barcode
  const uniqueBarcodes = [...new Set(movements.map(m => m.barcode).filter(Boolean))];
  const products = await context.entities.ProductCatalog.findMany({
    where: { gtin: { in: uniqueBarcodes } }
  });

  const productMap = new Map();
  products.forEach(p => productMap.set(p.gtin, p));

  console.log(`[${ts()}] Stage 2 complete: Found ${userStores.length} stores, ${products.length} products`);
  console.log(`[${ts()}] Stage 3/5: Creating snapshot and preparing data...`);

  // Create inventory snapshot
  const snapshot = await context.entities.InventorySnapshot.create({
    data: {
      storeId: userStores[0].id,
      fileType: 'LOG',
      rawData: csvData
    }
  });

  // STAGE 3: Prepare movement data for bulk creation
  const movementsToCreate = [];
  const skippedRows = [];
  const unmatchedRecords = [];
  let newProductsNeeded = 0;

  for (const movement of movements) {
    const storeId = storeMap.get(movement.location);
    let product = productMap.get(movement.barcode);

    // Skip if no store found
    if (!storeId) {
      skippedRows.push({ row: movement.productName, reason: `Store not found: ${movement.location}` });
      unmatchedRecords.push({
        userId: context.user.id,
        recordType: 'LOG',
        productName: movement.productName,
        barcode: movement.barcode,
        sku: movement.sku,
        location: movement.location,
        brand: movement.brand,
        date: movement.date,
        changeQty: movement.changeQty,
        employee: movement.employee,
        reason: `Store not found: ${movement.location}`,
        rawData: JSON.stringify(movement)
      });
      continue;
    }

    // Skip if no barcode at all
    if (!movement.barcode) {
      skippedRows.push({ row: movement.productName, reason: 'Missing GTIN' });
      unmatchedRecords.push({
        userId: context.user.id,
        recordType: 'LOG',
        productName: movement.productName,
        barcode: movement.barcode,
        sku: movement.sku,
        location: movement.location,
        brand: movement.brand,
        date: movement.date,
        changeQty: movement.changeQty,
        employee: movement.employee,
        reason: 'Missing GTIN - cannot create or match product',
        rawData: JSON.stringify(movement)
      });
      continue;
    }

    // Track products that need to be created
    if (!product) {
      newProductsNeeded++;
      // We'll handle this later - for now skip
      skippedRows.push({ row: movement.productName, reason: 'Product not in catalog (upload inventory export first)' });
      continue;
    }

    movementsToCreate.push({
      storeId,
      productId: product.id,
      date: movement.date,
      type: movement.type,
      employee: movement.employee,
      openingQty: movement.openingQty,
      changeQty: movement.changeQty,
      closingQty: movement.closingQty,
      notes: movement.notes
    });
  }

  console.log(`[${ts()}] Stage 3 complete: ${movementsToCreate.length} movements ready, ${skippedRows.length} skipped`);
  if (newProductsNeeded > 0) {
    console.log(`[${ts()}] ${newProductsNeeded} movements skipped - products not in catalog (upload inventory export first)`);
  }
  console.log(`[${ts()}] Stage 4/5: Deduplicating and bulk creating movement records...`);

  // STAGE 4: Deduplicate and bulk create movements
  let totalCreated = 0;
  let totalDuplicates = 0;
  let uniqueMovements = []; // Declare outside if block for use in Stage 5

  if (movementsToCreate.length > 0) {
    // Calculate date range for deduplication check
    const dates = movementsToCreate.map(m => m.date);
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

    // Get store and product IDs from movements
    const storeIds = [...new Set(movementsToCreate.map(m => m.storeId))];
    const productIds = [...new Set(movementsToCreate.map(m => m.productId))];

    // Fetch existing movements in this date range to check for duplicates
    console.log(`[${ts()}] Checking for existing movements in date range ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}...`);
    const existingMovements = await context.entities.InventoryMovement.findMany({
      where: {
        storeId: { in: storeIds },
        productId: { in: productIds },
        date: { gte: minDate, lte: maxDate }
      },
      select: {
        storeId: true,
        productId: true,
        date: true,
        type: true,
        changeQty: true,
        openingQty: true,
        closingQty: true,
        employee: true
      }
    });

    // Create a Set of existing movement keys for fast lookup
    // Key format: storeId_productId_date_type_changeQty_openingQty_closingQty
    const existingKeys = new Set();
    existingMovements.forEach(m => {
      const dateStr = m.date.toISOString().split('T')[0]; // Normalize to date only (ignore time)
      const key = `${m.storeId}_${m.productId}_${dateStr}_${m.type}_${m.changeQty}_${m.openingQty}_${m.closingQty}_${m.employee || ''}`;
      existingKeys.add(key);
    });

    console.log(`[${ts()}] Found ${existingMovements.length} existing movements, checking for duplicates...`);

    // Filter out duplicates
    movementsToCreate.forEach(m => {
      const dateStr = m.date.toISOString().split('T')[0]; // Normalize to date only
      const key = `${m.storeId}_${m.productId}_${dateStr}_${m.type}_${m.changeQty}_${m.openingQty}_${m.closingQty}_${m.employee || ''}`;

      if (existingKeys.has(key)) {
        totalDuplicates++;
      } else {
        uniqueMovements.push(m);
        // Add to existing keys to prevent duplicates within the same upload
        existingKeys.add(key);
      }
    });

    if (totalDuplicates > 0) {
      console.log(`[${ts()}] Skipped ${totalDuplicates} duplicate movements (already exist in database)`);
    }

    // Bulk create only unique movements
    if (uniqueMovements.length > 0) {
      const chunkSize = 1000;
      for (let i = 0; i < uniqueMovements.length; i += chunkSize) {
        const chunk = uniqueMovements.slice(i, i + chunkSize);

        await context.entities.InventoryMovement.createMany({
          data: chunk,
          skipDuplicates: true // Extra safety - PostgreSQL will skip if somehow duplicates slip through
        });

        totalCreated += chunk.length;

        if (totalCreated % 5000 === 0 || totalCreated === uniqueMovements.length) {
          const percentage = ((totalCreated / uniqueMovements.length) * 100).toFixed(1);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[${ts()}] Created: ${totalCreated}/${uniqueMovements.length} (${percentage}%) - ${elapsed}s`);
        }
      }
    }
  }

  console.log(`[${ts()}] Stage 4 complete: ${totalCreated} new movements created, ${totalDuplicates} duplicates skipped`);

  // NOTE: Stock levels are NOT updated from logs. The inventory export is the
  // authoritative source for current stock. Logs only provide transaction history
  // for sales analytics (InventoryMovement records).

  // Save unmatched records for review
  if (unmatchedRecords.length > 0) {
    await context.entities.UnmatchedRecord.createMany({
      data: unmatchedRecords
    });
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n[${ts()}] INVENTORY LOGS UPLOAD COMPLETE!`);
  console.log(`[${ts()}] Total time: ${duration}s`);
  console.log(`[${ts()}] Movements created: ${totalCreated}`);
  if (totalDuplicates > 0) {
    console.log(`[${ts()}] Duplicates skipped: ${totalDuplicates}`);
  }
  console.log(`[${ts()}] Skipped: ${skippedRows.length}`);
  console.log(`[${ts()}] Average: ${(totalCreated / parseFloat(duration)).toFixed(0)} records/second\n`);

  // Invalidate cache after inventory update
  await invalidateCachePattern('cache:base:*');
  await invalidateCachePattern('cache:recent_sales:*');
  await invalidateCachePattern('cache:recent_sales_movements:*');
  await invalidateCachePattern('cache:older_sales:*');
  await invalidateCachePattern('cache:filter_options:*');
  await invalidateCachePattern('cache:sparklines:*');
  await invalidateCachePattern('cache:sales_totals:*');
  await invalidateCachePattern('cache:products_paginated:*');
  await invalidateCachePattern('cache:purchase_orders:*');
  await invalidateCachePattern('cache:rankings:*');

  // Warm cache after upload (fire-and-forget)
  const stores = await context.entities.Store.findMany({
    where: { userId: context.user.id, isActive: true },
    select: { id: true }
  });
  if (stores.length > 0) {
    const storeIds = stores.map(s => s.id);
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 14 * 24 * 60 * 60 * 1000);
    warmOrderingAnalyticsCache(context, storeIds, startDate, endDate, false).catch(err =>
      console.warn('Cache warming failed after upload:', err.message)
    );
  }

  if (skippedRows.length > 0) {
    console.log(`[${ts()}] Top reasons for skipped rows:`);
    const reasons = {};
    skippedRows.forEach(skip => {
      reasons[skip.reason] = (reasons[skip.reason] || 0) + 1;
    });
    Object.entries(reasons).forEach(([reason, count]) => {
      console.log(`[${ts()}]    - ${reason}: ${count} rows`);
    });
    console.log('');
  }

  return {
    snapshot,
    movementsProcessed: totalCreated,
    totalMovements: movements.length,
    duplicatesSkipped: totalDuplicates,
    productsCreated: 0,
    skippedRows: skippedRows.length,
    errors: 0,
    skippedDetails: skippedRows.slice(0, 10),
    errorDetails: []
  };
};
