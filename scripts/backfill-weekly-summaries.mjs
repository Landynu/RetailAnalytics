import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getTimeBucket(hour) {
  if (hour >= 6 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 18) return 'Afternoon';
  if (hour >= 18 && hour < 22) return 'Evening';
  return 'Night';
}

async function main() {
  const startDate = new Date('2025-09-22');
  const endDate = new Date();

  console.log(`Backfilling from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

  const stores = await prisma.store.findMany({ where: { isActive: true } });
  console.log(`${stores.length} stores`);

  let currentWeek = getMonday(startDate);
  let weeksProcessed = 0;

  while (currentWeek <= endDate) {
    const weekEnd = new Date(currentWeek);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekStr = currentWeek.toISOString().split('T')[0];

    let weekUpserts = 0;

    for (const store of stores) {
      const movements = await prisma.inventoryMovement.findMany({
        where: { storeId: store.id, date: { gte: currentWeek, lt: weekEnd } },
        include: { product: { select: { id: true, parentCategory: true, brand: true, retailPrice: true } } }
      });

      if (movements.length === 0) continue;

      const productSummaries = new Map();
      const categorySummaries = new Map();
      const brandSummaries = new Map();

      for (const m of movements) {
        const dayOfWeek = m.date.getDay();
        const timeBucket = getTimeBucket(m.date.getHours());
        const units = Math.abs(m.changeQty);
        const revenue = units * (m.product.retailPrice || 0);

        if (!productSummaries.has(m.productId)) {
          productSummaries.set(m.productId, {
            grossSales: 0, refunds: 0, unitsSold: 0, refundUnits: 0, salesByDay: {},
            salesMorning: 0, salesAfternoon: 0, salesEvening: 0, salesNight: 0,
            unitsMorning: 0, unitsAfternoon: 0, unitsEvening: 0, unitsNight: 0
          });
        }
        const ps = productSummaries.get(m.productId);
        if (m.type === 'sale') {
          ps.grossSales += revenue; ps.unitsSold += units;
          ps.salesByDay[dayOfWeek] = (ps.salesByDay[dayOfWeek] || 0) + revenue;
          ps[`sales${timeBucket}`] += revenue; ps[`units${timeBucket}`] += units;
        } else if (m.type === 'refund') { ps.refunds += revenue; ps.refundUnits += units; }

        const cat = m.product.parentCategory || 'Uncategorized';
        if (!categorySummaries.has(cat)) categorySummaries.set(cat, { grossSales: 0, refunds: 0, unitsSold: 0, productCount: new Set() });
        const cs = categorySummaries.get(cat);
        if (m.type === 'sale') { cs.grossSales += revenue; cs.unitsSold += units; cs.productCount.add(m.productId); }
        else if (m.type === 'refund') { cs.refunds += revenue; }

        const brand = m.product.brand || 'Unknown';
        if (!brandSummaries.has(brand)) brandSummaries.set(brand, { grossSales: 0, refunds: 0, unitsSold: 0 });
        const bs = brandSummaries.get(brand);
        if (m.type === 'sale') { bs.grossSales += revenue; bs.unitsSold += units; }
        else if (m.type === 'refund') { bs.refunds += revenue; }
      }

      // Batch upserts in a transaction (10 at a time to reduce round trips)
      const productOps = [...productSummaries].map(([productId, d]) =>
        prisma.weeklySalesSummary.upsert({
          where: { weekStart_storeId_productId: { weekStart: currentWeek, storeId: store.id, productId } },
          create: { weekStart: currentWeek, storeId: store.id, productId, grossSales: d.grossSales, refunds: d.refunds, netRevenue: d.grossSales - d.refunds, unitsSold: d.unitsSold, refundUnits: d.refundUnits, salesByDayOfWeek: d.salesByDay, salesMorning: d.salesMorning, salesAfternoon: d.salesAfternoon, salesEvening: d.salesEvening, salesNight: d.salesNight, unitsMorning: d.unitsMorning, unitsAfternoon: d.unitsAfternoon, unitsEvening: d.unitsEvening, unitsNight: d.unitsNight },
          update: { grossSales: d.grossSales, refunds: d.refunds, netRevenue: d.grossSales - d.refunds, unitsSold: d.unitsSold, refundUnits: d.refundUnits, salesByDayOfWeek: d.salesByDay, salesMorning: d.salesMorning, salesAfternoon: d.salesAfternoon, salesEvening: d.salesEvening, salesNight: d.salesNight, unitsMorning: d.unitsMorning, unitsAfternoon: d.unitsAfternoon, unitsEvening: d.unitsEvening, unitsNight: d.unitsNight }
        })
      );
      const catOps = [...categorySummaries].map(([category, d]) =>
        prisma.weeklyCategorySummary.upsert({
          where: { weekStart_storeId_category: { weekStart: currentWeek, storeId: store.id, category } },
          create: { weekStart: currentWeek, storeId: store.id, category, grossSales: d.grossSales, refunds: d.refunds, netRevenue: d.grossSales - d.refunds, unitsSold: d.unitsSold, productCount: d.productCount.size },
          update: { grossSales: d.grossSales, refunds: d.refunds, netRevenue: d.grossSales - d.refunds, unitsSold: d.unitsSold, productCount: d.productCount.size }
        })
      );
      const brandOps = [...brandSummaries].map(([brand, d]) =>
        prisma.weeklyBrandSummary.upsert({
          where: { weekStart_storeId_brand: { weekStart: currentWeek, storeId: store.id, brand } },
          create: { weekStart: currentWeek, storeId: store.id, brand, grossSales: d.grossSales, refunds: d.refunds, netRevenue: d.grossSales - d.refunds, unitsSold: d.unitsSold },
          update: { grossSales: d.grossSales, refunds: d.refunds, netRevenue: d.grossSales - d.refunds, unitsSold: d.unitsSold }
        })
      );

      await prisma.$transaction([...productOps, ...catOps, ...brandOps]);
      weekUpserts += productOps.length;
    }

    weeksProcessed++;
    console.log(`Week ${weekStr}: ${weekUpserts} products`);
    currentWeek.setDate(currentWeek.getDate() + 7);
  }

  console.log(`Done! ${weeksProcessed} weeks backfilled`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
