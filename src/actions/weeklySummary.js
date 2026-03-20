import { HttpError } from 'wasp/server';
import { invalidateCachePattern } from '../cache.js';
import { computeSeasonality } from './seasonality.js';

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function getTimeBucket(hour) {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

export const backfillWeeklySummaries = async (args, context) => {
  const { startDate, endDate } = args || {};

  // Get earliest movement date if startDate not provided
  const earliest = await context.entities.InventoryMovement.findFirst({
    orderBy: { date: 'asc' },
    select: { date: true }
  });

  const start = startDate ? new Date(startDate) : (earliest?.date || new Date());
  const end = endDate ? new Date(endDate) : new Date();

  // When called as a job (no user), process all active stores
  // When called as an action (has user), process only that user's stores
  const stores = await context.entities.Store.findMany({
    where: context.user
      ? { userId: context.user.id, isActive: true }
      : { isActive: true }
  });

  let currentWeek = getMonday(start);
  let weeksProcessed = 0;

  while (currentWeek <= end) {
    const weekEnd = new Date(currentWeek);
    weekEnd.setDate(weekEnd.getDate() + 7);

    for (const store of stores) {
      // Get all movements for this week and store
      const movements = await context.entities.InventoryMovement.findMany({
        where: {
          storeId: store.id,
          date: { gte: currentWeek, lt: weekEnd }
        },
        include: {
          product: {
            select: {
              id: true,
              parentCategory: true,
              brand: true,
              retailPrice: true
            }
          }
        }
      });

      if (movements.length === 0) {
        continue;
      }

      // Aggregate by product
      const productSummaries = new Map();
      const categorySummaries = new Map();
      const brandSummaries = new Map();

      movements.forEach(m => {
        const dayOfWeek = m.date.getDay();
        const hour = m.date.getHours();
        const timeBucket = getTimeBucket(hour);
        const units = Math.abs(m.changeQty);
        const revenue = units * (m.product.retailPrice || 0);

        // Product summaries
        const productKey = m.productId;
        if (!productSummaries.has(productKey)) {
          productSummaries.set(productKey, {
            productId: m.productId,
            grossSales: 0,
            refunds: 0,
            unitsSold: 0,
            refundUnits: 0,
            salesByDay: {},
            salesMorning: 0,
            salesAfternoon: 0,
            salesEvening: 0,
            salesNight: 0,
            unitsMorning: 0,
            unitsAfternoon: 0,
            unitsEvening: 0,
            unitsNight: 0
          });
        }

        const summary = productSummaries.get(productKey);

        if (m.type === 'sale') {
          summary.grossSales += revenue;
          summary.unitsSold += units;
          summary.salesByDay[dayOfWeek] = (summary.salesByDay[dayOfWeek] || 0) + revenue;
          summary[`sales${timeBucket.charAt(0).toUpperCase() + timeBucket.slice(1)}`] += revenue;
          summary[`units${timeBucket.charAt(0).toUpperCase() + timeBucket.slice(1)}`] += units;
        } else if (m.type === 'refund') {
          summary.refunds += revenue;
          summary.refundUnits += units;
        }

        // Category summaries
        const category = m.product.parentCategory || 'Uncategorized';
        if (!categorySummaries.has(category)) {
          categorySummaries.set(category, {
            grossSales: 0,
            refunds: 0,
            unitsSold: 0,
            productCount: new Set()
          });
        }
        const catSummary = categorySummaries.get(category);
        if (m.type === 'sale') {
          catSummary.grossSales += revenue;
          catSummary.unitsSold += units;
          catSummary.productCount.add(m.productId);
        } else if (m.type === 'refund') {
          catSummary.refunds += revenue;
        }

        // Brand summaries
        const brand = m.product.brand || 'Unknown';
        if (!brandSummaries.has(brand)) {
          brandSummaries.set(brand, {
            grossSales: 0,
            refunds: 0,
            unitsSold: 0
          });
        }
        const brandSummary = brandSummaries.get(brand);
        if (m.type === 'sale') {
          brandSummary.grossSales += revenue;
          brandSummary.unitsSold += units;
        } else if (m.type === 'refund') {
          brandSummary.refunds += revenue;
        }
      });

      // Insert product summaries
      for (const [productId, data] of productSummaries) {
        await context.entities.WeeklySalesSummary.upsert({
          where: {
            weekStart_storeId_productId: {
              weekStart: currentWeek,
              storeId: store.id,
              productId
            }
          },
          create: {
            weekStart: currentWeek,
            storeId: store.id,
            productId,
            grossSales: data.grossSales,
            refunds: data.refunds,
            netRevenue: data.grossSales - data.refunds,
            unitsSold: data.unitsSold,
            refundUnits: data.refundUnits,
            salesByDayOfWeek: data.salesByDay,
            salesMorning: data.salesMorning,
            salesAfternoon: data.salesAfternoon,
            salesEvening: data.salesEvening,
            salesNight: data.salesNight,
            unitsMorning: data.unitsMorning,
            unitsAfternoon: data.unitsAfternoon,
            unitsEvening: data.unitsEvening,
            unitsNight: data.unitsNight
          },
          update: {
            grossSales: data.grossSales,
            refunds: data.refunds,
            netRevenue: data.grossSales - data.refunds,
            unitsSold: data.unitsSold,
            refundUnits: data.refundUnits,
            salesByDayOfWeek: data.salesByDay,
            salesMorning: data.salesMorning,
            salesAfternoon: data.salesAfternoon,
            salesEvening: data.salesEvening,
            salesNight: data.salesNight,
            unitsMorning: data.unitsMorning,
            unitsAfternoon: data.unitsAfternoon,
            unitsEvening: data.unitsEvening,
            unitsNight: data.unitsNight
          }
        });
      }

      // Insert category summaries
      for (const [category, data] of categorySummaries) {
        await context.entities.WeeklyCategorySummary.upsert({
          where: {
            weekStart_storeId_category: {
              weekStart: currentWeek,
              storeId: store.id,
              category
            }
          },
          create: {
            weekStart: currentWeek,
            storeId: store.id,
            category,
            grossSales: data.grossSales,
            refunds: data.refunds,
            netRevenue: data.grossSales - data.refunds,
            unitsSold: data.unitsSold,
            productCount: data.productCount.size
          },
          update: {
            grossSales: data.grossSales,
            refunds: data.refunds,
            netRevenue: data.grossSales - data.refunds,
            unitsSold: data.unitsSold,
            productCount: data.productCount.size
          }
        });
      }

      // Insert brand summaries
      for (const [brand, data] of brandSummaries) {
        await context.entities.WeeklyBrandSummary.upsert({
          where: {
            weekStart_storeId_brand: {
              weekStart: currentWeek,
              storeId: store.id,
              brand
            }
          },
          create: {
            weekStart: currentWeek,
            storeId: store.id,
            brand,
            grossSales: data.grossSales,
            refunds: data.refunds,
            netRevenue: data.grossSales - data.refunds,
            unitsSold: data.unitsSold
          },
          update: {
            grossSales: data.grossSales,
            refunds: data.refunds,
            netRevenue: data.grossSales - data.refunds,
            unitsSold: data.unitsSold
          }
        });
      }
    }

    weeksProcessed++;
    currentWeek.setDate(currentWeek.getDate() + 7);
  }

  // Invalidate cache after backfilling weekly summaries
  await invalidateCachePattern('cache:base:*');
  await invalidateCachePattern('cache:recent_sales:*');
  await invalidateCachePattern('cache:recent_sales_movements:*');
  await invalidateCachePattern('cache:older_sales:*');
  await invalidateCachePattern('cache:sparklines:*');
  await invalidateCachePattern('cache:rankings:*');
  await invalidateCachePattern('cache:sales_totals:*');
  await invalidateCachePattern('cache:products_paginated:*');

  // Recalculate product seasonality after weekly summaries are updated
  const allSummaries = await context.entities.WeeklySalesSummary.findMany({
    select: { productId: true, weekStart: true, unitsSold: true, netRevenue: true },
    orderBy: { weekStart: 'asc' }
  });

  const productMap = new Map();
  for (const s of allSummaries) {
    if (!productMap.has(s.productId)) {
      productMap.set(s.productId, []);
    }
    productMap.get(s.productId).push(s);
  }

  const now = new Date();
  let seasonalityCalculated = 0;
  for (const [pid, weeks] of productMap) {
    const seasonality = computeSeasonality(weeks, now);
    await context.entities.ProductSeasonality.upsert({
      where: { productId: pid },
      create: { productId: pid, ...seasonality },
      update: seasonality,
    });
    seasonalityCalculated++;
  }

  return {
    success: true,
    weeksProcessed,
    storesProcessed: stores.length,
    seasonalityCalculated,
    startDate: start.toISOString(),
    endDate: end.toISOString()
  };
};
