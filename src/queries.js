import { HttpError } from 'wasp/server'

export const getSalesTrends = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const inventories = await context.entities.Inventory.findMany({
    where: { storeId: storeId },
    include: { products: true }
  });

  const salesTrends = inventories.map(inventory => {
    return {
      inventoryId: inventory.id,
      products: inventory.products.map(product => ({
        name: product.name,
        gtin: product.gtin,
        price: product.price
      }))
    };
  });

  return salesTrends;
}

export const getUserStores = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }; // If user needs to be authenticated.

  return context.entities.Store.findMany({
    where: { userId: context.user.id }
  });
}

export const getStoreById = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store || store.userId !== context.user.id) { 
    throw new HttpError(404) 
  }

  return store;
}

// New PRD Queries

export const getInventoryDashboard = async ({ storeId, dateRange }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store || store.userId !== context.user.id) {
    throw new HttpError(404);
  }

  // Get stock levels with products
  const stockLevels = await context.entities.StockLevel.findMany({
    where: { storeId: parseInt(storeId) },
    include: { product: true }
  });

  // Calculate totals
  const totalSKUs = stockLevels.length;
  const totalValue = stockLevels.reduce((sum, stock) => {
    return sum + (stock.quantity * (stock.product.retailPrice || 0));
  }, 0);

  // Category breakdown
  const categoryBreakdown = {};
  stockLevels.forEach(stock => {
    const category = stock.product.category || 'Uncategorized';
    if (!categoryBreakdown[category]) {
      categoryBreakdown[category] = { count: 0, value: 0 };
    }
    categoryBreakdown[category].count += stock.quantity;
    categoryBreakdown[category].value += stock.quantity * (stock.product.retailPrice || 0);
  });

  // Low stock alerts (quantity < 5)
  const lowStock = stockLevels.filter(stock => stock.quantity < 5);

  // Recent movements (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const recentMovements = await context.entities.InventoryMovement.findMany({
    where: {
      storeId: parseInt(storeId),
      date: { gte: sevenDaysAgo }
    },
    include: { product: true },
    orderBy: { date: 'desc' },
    take: 10
  });

  return {
    totalSKUs,
    totalValue,
    categoryBreakdown: Object.keys(categoryBreakdown).map(category => ({
      category,
      count: categoryBreakdown[category].count,
      value: categoryBreakdown[category].value
    })),
    lowStock: lowStock.map(stock => ({
      product: stock.product,
      quantity: stock.quantity
    })),
    recentMovements: recentMovements.map(movement => ({
      product: movement.product,
      type: movement.type,
      date: movement.date.toISOString(),
      change: movement.changeQty
    }))
  };
};

export const getTopProductsByCategory = async ({ storeId, limit = 10 }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const stockLevels = await context.entities.StockLevel.findMany({
    where: { storeId: parseInt(storeId) },
    include: { product: true }
  });

  // Group by category and get top products
  const categoryProducts = {};
  stockLevels.forEach(stock => {
    const category = stock.product.category || 'Uncategorized';
    if (!categoryProducts[category]) {
      categoryProducts[category] = [];
    }
    categoryProducts[category].push({
      product: stock.product,
      quantity: stock.quantity,
      value: stock.quantity * (stock.product.retailPrice || 0)
    });
  });

  // Sort and limit for each category
  const result = [];
  Object.keys(categoryProducts).forEach(category => {
    const sortedProducts = categoryProducts[category]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit);
    
    result.push({
      category,
      products: sortedProducts
    });
  });

  return result;
};

export const getInventoryMovements = async ({ storeId, dateRange, filters = {} }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const whereClause = {
    storeId: parseInt(storeId)
  };

  if (dateRange?.start && dateRange?.end) {
    whereClause.date = {
      gte: new Date(dateRange.start),
      lte: new Date(dateRange.end)
    };
  }

  if (filters.type) {
    whereClause.type = filters.type;
  }

  if (filters.employee) {
    whereClause.employee = { contains: filters.employee };
  }

  const movements = await context.entities.InventoryMovement.findMany({
    where: whereClause,
    include: { product: true },
    orderBy: { date: 'desc' }
  });

  return movements.map(movement => ({
    id: movement.id,
    product: movement.product,
    date: movement.date.toISOString(),
    type: movement.type,
    employee: movement.employee,
    openingQty: movement.openingQty,
    changeQty: movement.changeQty,
    closingQty: movement.closingQty,
    notes: movement.notes
  }));
};

export const getCategoryBreakdown = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const stockLevels = await context.entities.StockLevel.findMany({
    where: { storeId: parseInt(storeId) },
    include: { product: true }
  });

  const categoryData = {};
  stockLevels.forEach(stock => {
    const category = stock.product.category || 'Uncategorized';
    if (!categoryData[category]) {
      categoryData[category] = {
        count: 0,
        value: 0,
        products: 0
      };
    }
    categoryData[category].count += stock.quantity;
    categoryData[category].value += stock.quantity * (stock.product.retailPrice || 0);
    categoryData[category].products += 1;
  });

  return Object.keys(categoryData).map(category => ({
    category,
    count: categoryData[category].count,
    value: categoryData[category].value,
    products: categoryData[category].products
  }));
};

export const getMenuData = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const stockLevels = await context.entities.StockLevel.findMany({
    where: { 
      storeId: parseInt(storeId),
      quantity: { gt: 0 }
    },
    include: { product: true }
  });

  // Group by category
  const menuCategories = {};
  stockLevels.forEach(stock => {
    const category = stock.product.category || 'Uncategorized';
    if (!menuCategories[category]) {
      menuCategories[category] = [];
    }
    menuCategories[category].push({
      id: stock.product.id,
      name: stock.product.name,
      brand: stock.product.brand,
      price: stock.product.retailPrice || 0,
      quantity: stock.quantity,
      description: stock.product.description,
      imageUrl: stock.product.imageUrl
    });
  });

  // Sort products within each category by name
  Object.keys(menuCategories).forEach(category => {
    menuCategories[category].sort((a, b) => a.name.localeCompare(b.name));
  });

  return {
    categories: Object.keys(menuCategories).map(category => ({
      category,
      products: menuCategories[category]
    })),
    totalProducts: stockLevels.length
  };
};