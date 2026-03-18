import { HttpError } from 'wasp/server';

export const getProductCatalog = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }

  const { filters = {}, limit, offset = 0 } = args || {}

  const where = {}

  if (filters.brands && filters.brands.length > 0) {
    where.brand = { in: filters.brands }
  }

  if (filters.categories && filters.categories.length > 0) {
    where.parentCategory = { in: filters.categories }
  }

  if (filters.subcategories && filters.subcategories.length > 0) {
    where.subcategory = { in: filters.subcategories }
  }

  if (filters.strainTypes && filters.strainTypes.length > 0) {
    where.strainType = { in: filters.strainTypes }
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { brand: { contains: filters.search, mode: 'insensitive' } },
      { gtin: { contains: filters.search, mode: 'insensitive' } }
    ]
  }

  // Filter by in-stock status
  if (filters.inStock === true) {
    // Get user's stores
    const userStores = await context.entities.Store.findMany({
      where: { isActive: true },
      select: { id: true }
    })
    const storeIds = userStores.map(s => s.id)

    // Get product IDs that have stock > 0 in any store
    const stockLevels = await context.entities.StockLevel.findMany({
      where: {
        storeId: { in: storeIds },
        quantity: { gt: 0 }
      },
      select: { productId: true },
      distinct: ['productId']
    })

    const inStockProductIds = stockLevels.map(s => s.productId)

    if (inStockProductIds.length === 0) {
      // No products in stock, return empty result
      return {
        products: [],
        total: 0,
        limit,
        offset
      }
    }

    where.id = { in: inStockProductIds }
  }

  const [products, total] = await Promise.all([
    context.entities.ProductCatalog.findMany({
      where,
      include: {
        classification: true,
        categoryDefinition: {
          include: {
            subcategories: true
          }
        },
        subcategoryDef: true,
        distributor: true,
        stockLevels: {
          where: {
            store: {
              isActive: true
            }
          },
          include: {
            store: {
              select: {
                id: true,
                name: true,
                friendlyName: true
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' },
      take: limit,
      skip: offset
    }),
    context.entities.ProductCatalog.count({ where })
  ])

  return {
    products,
    total,
    limit,
    offset
  }
}

export const getClassifications = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }

  return await context.entities.Classification.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' }
  })
}

export const getCategoryDefinitions = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }

  return await context.entities.CategoryDefinition.findMany({
    where: { isActive: true },
    include: {
      subcategories: {
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' }
      }
    },
    orderBy: { displayOrder: 'asc' }
  })
}

export const getProductById = async ({ productId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Get active stores for stock level filtering
  const userStores = await context.entities.Store.findMany({
    where: { isActive: true },
    select: { id: true }
  })
  const storeIds = userStores.map(s => s.id)

  return await context.entities.ProductCatalog.findUnique({
    where: { id: productId },
    include: {
      classification: true,
      categoryDefinition: {
        include: {
          subcategories: true
        }
      },
      subcategoryDef: true,
      distributor: true,
      stockLevels: {
        where: {
          storeId: { in: storeIds }
        },
        include: {
          store: {
            select: {
              id: true,
              name: true,
              friendlyName: true,
              location: true
            }
          }
        },
        orderBy: {
          quantity: 'desc'
        }
      },
      movements: {
        where: {
          storeId: { in: storeIds }
        },
        orderBy: {
          date: 'desc'
        },
        take: 20
      },
      enrichments: {
        orderBy: { enrichedAt: 'desc' },
        take: 20
      }
    }
  })
}
