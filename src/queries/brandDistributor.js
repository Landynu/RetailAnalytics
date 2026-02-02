import { HttpError } from 'wasp/server';

export const getBrandDistributors = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }

  const brands = await context.entities.Brand.findMany({
    include: {
      distributors: {
        include: {
          distributor: true
        },
        orderBy: { isPrimary: 'desc' }
      }
    },
    orderBy: { name: 'asc' }
  })

  // Get last movement date for each brand
  const brandNames = brands.map(b => b.name)
  const movements = await context.entities.InventoryMovement.findMany({
    where: {
      product: {
        brand: { in: brandNames }
      }
    },
    select: {
      product: {
        select: {
          brand: true
        }
      },
      date: true
    },
    orderBy: { date: 'desc' }
  })

  // Find most recent movement per brand
  const brandLastActivity = new Map()
  movements.forEach(m => {
    const brand = m.product.brand
    if (brand && !brandLastActivity.has(brand)) {
      brandLastActivity.set(brand, m.date)
    }
  })

  return brands.map(brand => ({
    brandName: brand.name,
    distributors: brand.distributors.map(bd => ({
      id: bd.distributor.id,
      name: bd.distributor.name,
      isPrimary: bd.isPrimary
    })),
    lastActivity: brandLastActivity.get(brand.name) || null,
    hasDistributors: brand.distributors.length > 0
  }))
}

export const getDistributors = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }

  return context.entities.Distributor.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' }
  })
}
