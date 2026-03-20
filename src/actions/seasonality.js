import { HttpError } from 'wasp/server';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Calculate and persist seasonality data for products.
 * If productId is provided, calculates for that product only.
 * Otherwise, calculates for all products with sales history.
 */
export const calculateProductSeasonality = async ({ productId } = {}, context) => {
  if (!context.user) { throw new HttpError(401) }

  const where = productId ? { productId: parseInt(productId) } : {};
  const summaries = await context.entities.WeeklySalesSummary.findMany({
    where,
    select: {
      productId: true,
      weekStart: true,
      unitsSold: true,
      netRevenue: true,
    },
    orderBy: { weekStart: 'asc' }
  });

  if (summaries.length === 0) {
    return { calculated: 0 };
  }

  // Group by product
  const productMap = new Map();
  for (const s of summaries) {
    if (!productMap.has(s.productId)) {
      productMap.set(s.productId, []);
    }
    productMap.get(s.productId).push(s);
  }

  const now = new Date();
  let calculated = 0;

  for (const [pid, weeks] of productMap) {
    const seasonality = computeSeasonality(weeks, now);

    await context.entities.ProductSeasonality.upsert({
      where: { productId: pid },
      create: { productId: pid, ...seasonality },
      update: seasonality,
    });
    calculated++;
  }

  return { calculated };
};

export function computeSeasonality(weeks, now) {
  const weeksAgo = (n) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n * 7);
    return d;
  };

  // Calculate weekly averages for different time windows
  const last4 = weeks.filter(w => new Date(w.weekStart) >= weeksAgo(4));
  const last12 = weeks.filter(w => new Date(w.weekStart) >= weeksAgo(12));
  const last52 = weeks.filter(w => new Date(w.weekStart) >= weeksAgo(52));

  const avg = (arr) => arr.length > 0
    ? arr.reduce((sum, w) => sum + w.unitsSold, 0) / arr.length
    : 0;

  const last4WeeksAvg = avg(last4);
  const last12WeeksAvg = avg(last12);
  const last52WeeksAvg = avg(last52);

  // Year-over-year growth: compare last 12 weeks vs prior 12 weeks (12-24 weeks ago)
  const prior12 = weeks.filter(w => {
    const d = new Date(w.weekStart);
    return d >= weeksAgo(24) && d < weeksAgo(12);
  });
  const yoyGrowth = avg(prior12) > 0
    ? ((avg(last12) - avg(prior12)) / avg(prior12)) * 100
    : null;

  // Peak months: aggregate sales by month
  const monthlyTotals = new Array(12).fill(0);
  for (const w of weeks) {
    const month = new Date(w.weekStart).getMonth();
    monthlyTotals[month] += w.unitsSold;
  }

  // Get top 3 peak months (only if they have sales)
  const rankedMonths = monthlyTotals
    .map((total, i) => ({ month: i + 1, total }))
    .filter(m => m.total > 0)
    .sort((a, b) => b.total - a.total);

  const peakMonth1 = rankedMonths[0]?.month || null;
  const peakMonth2 = rankedMonths[1]?.month || null;
  const peakMonth3 = rankedMonths[2]?.month || null;

  // Seasonality score: coefficient of variation of monthly sales (0-100)
  const activeMonthlySales = monthlyTotals.filter(t => t > 0);
  let seasonalityScore = 0;
  if (activeMonthlySales.length >= 3) {
    const mean = activeMonthlySales.reduce((a, b) => a + b, 0) / activeMonthlySales.length;
    if (mean > 0) {
      const variance = activeMonthlySales.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / activeMonthlySales.length;
      const cv = Math.sqrt(variance) / mean;
      // Scale CV to 0-100 (CV of 0 = score 0, CV of 1+ = score 100)
      seasonalityScore = Math.min(100, Math.round(cv * 100));
    }
  }

  // Trend classification
  const totalWeeks = weeks.length;
  let trend;
  if (totalWeeks < 8) {
    trend = 'NEW';
  } else if (seasonalityScore > 60) {
    trend = 'SEASONAL';
  } else if (last4WeeksAvg > last12WeeksAvg * 1.15 && last12WeeksAvg > last52WeeksAvg * 1.05) {
    trend = 'GROWING';
  } else if (last4WeeksAvg < last12WeeksAvg * 0.85 && last12WeeksAvg < last52WeeksAvg * 0.95) {
    trend = 'DECLINING';
  } else {
    trend = 'STABLE';
  }

  return {
    yoyGrowth,
    peakMonth1,
    peakMonth2,
    peakMonth3,
    trend,
    seasonalityScore,
    last4WeeksAvg,
    last12WeeksAvg,
    last52WeeksAvg,
  };
}
