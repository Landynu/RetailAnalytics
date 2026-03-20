import { HttpError } from 'wasp/server';

export const generateSmartMenu = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });
  if (!store) { throw new HttpError(404) }

  const stockLevels = await context.entities.StockLevel.findMany({
    where: {
      storeId: parseInt(storeId),
      quantity: { gt: 0 }
    },
    include: { product: true }
  });

  // Group by parent category, sorted by revenue potential
  const categories = {};
  stockLevels.forEach(stock => {
    const category = stock.product.parentCategory || stock.product.category || 'Uncategorized';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push({
      id: stock.product.id,
      name: stock.product.name,
      brand: stock.product.brand,
      price: stock.product.retailPrice || 0,
      quantity: stock.quantity,
      strainType: stock.product.strainType,
      thc: stock.product.thc,
      category: stock.product.category,
    });
  });

  // Sort products within each category by price descending
  Object.values(categories).forEach(products => {
    products.sort((a, b) => b.price - a.price);
  });

  return {
    store: { name: store.name, location: store.location },
    categories: Object.keys(categories).sort().map(category => ({
      category,
      products: categories[category]
    })),
    totalProducts: stockLevels.length,
    generatedAt: new Date().toISOString()
  };
};

export const generatePrintableMenu = async ({ storeId, options: _options = {} }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store) {
    throw new HttpError(404);
  }

  // Get products with stock levels
  const stockLevels = await context.entities.StockLevel.findMany({
    where: {
      storeId: parseInt(storeId),
      quantity: { gt: 0 }
    },
    include: {
      product: true
    }
  });

  // Group by category
  const categories = {};
  stockLevels.forEach(stock => {
    const category = stock.product.category || 'Uncategorized';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push({
      name: stock.product.name,
      brand: stock.product.brand,
      price: stock.product.retailPrice || 0,
      quantity: stock.quantity,
      description: stock.product.description
    });
  });

  // Generate PDF content (placeholder - would use PDF library)
  const menuData = {
    store: {
      name: store.name,
      location: store.location,
      logoUrl: store.logoUrl,
      primaryColor: store.primaryColor,
      secondaryColor: store.secondaryColor
    },
    categories: Object.keys(categories).map(category => ({
      category,
      products: categories[category]
    })),
    generatedAt: new Date().toISOString()
  };

  return menuData;
};
