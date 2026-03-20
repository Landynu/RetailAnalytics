import { HttpError } from 'wasp/server';

export const getProductSeasonality = async ({ productId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  return context.entities.ProductSeasonality.findUnique({
    where: { productId: parseInt(productId) },
    include: {
      product: {
        select: { id: true, name: true, brand: true, parentCategory: true }
      }
    }
  });
};

export const getSeasonalityOverview = async ({ storeId, trend, minScore } = {}, context) => {
  if (!context.user) { throw new HttpError(401) }

  const where = {};

  if (trend) {
    where.trend = trend;
  }

  if (minScore !== undefined) {
    where.seasonalityScore = { gte: minScore };
  }

  // If storeId is provided, only return seasonality for products in stock at that store
  if (storeId) {
    const stockLevels = await context.entities.StockLevel.findMany({
      where: { storeId: parseInt(storeId), quantity: { gt: 0 } },
      select: { productId: true }
    });
    const productIds = stockLevels.map(s => s.productId);
    where.productId = { in: productIds };
  }

  return context.entities.ProductSeasonality.findMany({
    where,
    include: {
      product: {
        select: { id: true, name: true, brand: true, parentCategory: true, strainType: true }
      }
    },
    orderBy: { seasonalityScore: 'desc' }
  });
};
