import { HttpError } from 'wasp/server';
import { invalidateCachePattern } from '../cache.js';

export const cleanupOctoberNovember2025 = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  const startTime = Date.now();
  const ts = () => new Date().toISOString().split('T')[1].split('.')[0];

  console.log(`\n[${ts()}] 🧹 STARTING CLEANUP: October & November 2025`);

  try {
    // Date range: October 1, 2025 to November 30, 2025
    const startDate = new Date('2025-10-01T00:00:00.000Z');
    const endDate = new Date('2025-11-30T23:59:59.999Z');

    // Calculate week boundaries for summary tables
    const weekStartDate = new Date('2025-09-29T00:00:00.000Z'); // Monday before Oct 1
    const weekEndDate = new Date('2025-12-02T00:00:00.000Z'); // Monday after Nov 30

    console.log(`[${ts()}] Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    console.log(`[${ts()}] Week range: ${weekStartDate.toISOString().split('T')[0]} to ${weekEndDate.toISOString().split('T')[0]}`);

    // Get user's store IDs
    const userStores = await context.entities.Store.findMany({
      select: { id: true }
    });

    if (userStores.length === 0) {
      throw new HttpError(400, 'No stores found');
    }

    const storeIds = userStores.map(s => s.id);
    console.log(`[${ts()}] Processing ${storeIds.length} stores...`);

    // 1. Delete InventoryMovement records
    console.log(`[${ts()}] Step 1/5: Deleting InventoryMovement records...`);
    const movementDeleteResult = await context.entities.InventoryMovement.deleteMany({
      where: {
        storeId: { in: storeIds },
        date: { gte: startDate, lte: endDate }
      }
    });
    console.log(`[${ts()}] ✓ Deleted ${movementDeleteResult.count} InventoryMovement records`);

    // 2. Delete WeeklySalesSummary records
    console.log(`[${ts()}] Step 2/5: Deleting WeeklySalesSummary records...`);
    const weeklySalesDeleteResult = await context.entities.WeeklySalesSummary.deleteMany({
      where: {
        storeId: { in: storeIds },
        weekStart: { gte: weekStartDate, lt: weekEndDate }
      }
    });
    console.log(`[${ts()}] ✓ Deleted ${weeklySalesDeleteResult.count} WeeklySalesSummary records`);

    // 3. Delete WeeklyCategorySummary records
    console.log(`[${ts()}] Step 3/5: Deleting WeeklyCategorySummary records...`);
    const weeklyCategoryDeleteResult = await context.entities.WeeklyCategorySummary.deleteMany({
      where: {
        storeId: { in: storeIds },
        weekStart: { gte: weekStartDate, lt: weekEndDate }
      }
    });
    console.log(`[${ts()}] ✓ Deleted ${weeklyCategoryDeleteResult.count} WeeklyCategorySummary records`);

    // 4. Delete WeeklyBrandSummary records
    console.log(`[${ts()}] Step 4/5: Deleting WeeklyBrandSummary records...`);
    const weeklyBrandDeleteResult = await context.entities.WeeklyBrandSummary.deleteMany({
      where: {
        storeId: { in: storeIds },
        weekStart: { gte: weekStartDate, lt: weekEndDate }
      }
    });
    console.log(`[${ts()}] ✓ Deleted ${weeklyBrandDeleteResult.count} WeeklyBrandSummary records`);

    // 5. Delete InventorySnapshot records from that period
    console.log(`[${ts()}] Step 5/5: Deleting InventorySnapshot records...`);
    const snapshotDeleteResult = await context.entities.InventorySnapshot.deleteMany({
      where: {
        storeId: { in: storeIds },
        uploadedAt: { gte: startDate, lte: endDate }
      }
    });
    console.log(`[${ts()}] ✓ Deleted ${snapshotDeleteResult.count} InventorySnapshot records`);

    // Invalidate all caches
    console.log(`[${ts()}] Invalidating caches...`);
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

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n[${ts()}] ✅ CLEANUP COMPLETE!`);
    console.log(`[${ts()}] 📊 Total time: ${duration}s`);

    return {
      success: true,
      deleted: {
        movements: movementDeleteResult.count,
        weeklySales: weeklySalesDeleteResult.count,
        weeklyCategories: weeklyCategoryDeleteResult.count,
        weeklyBrands: weeklyBrandDeleteResult.count,
        snapshots: snapshotDeleteResult.count
      },
      dateRange: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      },
      duration: parseFloat(duration),
      message: `Successfully deleted ${movementDeleteResult.count} movements and related summary data for October-November 2025`
    };

  } catch (error) {
    console.error(`[${ts()}] ❌ Cleanup failed:`, error.message);
    throw new HttpError(500, `Cleanup failed: ${error.message}`);
  }
}

export const deleteInventoryMovementsByDateRange = async ({ startDate, endDate, storeIds = null, preview = false }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const ts = () => new Date().toISOString().split('T')[1].split('.')[0];

  try {
    // Parse dates as Central Time (UTC-6)
    const [yearStart, monthStart, dayStart] = startDate.split('-').map(Number);
    const start = new Date(Date.UTC(yearStart, monthStart - 1, dayStart, 6, 0, 0, 0));

    const [yearEnd, monthEnd, dayEnd] = endDate.split('-').map(Number);
    const end = new Date(Date.UTC(yearEnd, monthEnd - 1, dayEnd + 1, 5, 59, 59, 999));

    console.log(`\n[${ts()}] 🗑️  ${preview ? 'PREVIEW' : 'DELETE'} Inventory Movements`);
    console.log(`[${ts()}] Date range: ${start.toISOString()} to ${end.toISOString()}`);

    // Build store filter
    let targetStoreIds;
    if (storeIds && storeIds.length > 0) {
      targetStoreIds = storeIds.map(id => parseInt(id));
      console.log(`[${ts()}] Stores: ${targetStoreIds.join(', ')}`);
    } else {
      const userStores = await context.entities.Store.findMany({
        select: { id: true, name: true }
      });

      if (userStores.length === 0) {
        throw new HttpError(400, 'No stores found');
      }

      targetStoreIds = userStores.map(s => s.id);
      console.log(`[${ts()}] Stores: All (${targetStoreIds.length} stores)`);
    }

    const whereClause = {
      storeId: { in: targetStoreIds },
      date: { gte: start, lte: end }
    };

    if (preview) {
      const count = await context.entities.InventoryMovement.count({
        where: whereClause
      });

      console.log(`[${ts()}] Preview: ${count} movements would be deleted`);

      return {
        success: true,
        preview: true,
        count,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString()
        },
        stores: targetStoreIds.length
      };
    }

    const startTime = Date.now();

    console.log(`[${ts()}] Deleting InventoryMovement records...`);
    const deleteResult = await context.entities.InventoryMovement.deleteMany({
      where: whereClause
    });

    console.log(`[${ts()}] ✓ Deleted ${deleteResult.count} InventoryMovement records`);

    // Invalidate all caches
    console.log(`[${ts()}] Invalidating caches...`);
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

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[${ts()}] ✅ Deletion complete in ${duration}s\n`);

    return {
      success: true,
      preview: false,
      deletedCount: deleteResult.count,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString()
      },
      stores: targetStoreIds.length,
      duration: parseFloat(duration)
    };

  } catch (error) {
    console.error(`[${ts()}] ❌ Delete failed:`, error.message);
    throw new HttpError(500, `Failed to delete inventory movements: ${error.message}`);
  }
}
