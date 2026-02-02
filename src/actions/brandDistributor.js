import { HttpError } from 'wasp/server';
import { invalidateCachePattern } from '../cache.js';

export const updateBrandDistributors = async ({ brandName, distributorIds }, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Create brand if it doesn't exist
  let brand = await context.entities.Brand.findUnique({
    where: { name: brandName }
  })

  if (!brand) {
    brand = await context.entities.Brand.create({
      data: { name: brandName }
    })
  }

  // Delete existing mappings
  await context.entities.BrandDistributor.deleteMany({
    where: { brandId: brand.id }
  })

  // Create new mappings
  if (distributorIds && distributorIds.length > 0) {
    await context.entities.BrandDistributor.createMany({
      data: distributorIds.map((distId, index) => ({
        brandId: brand.id,
        distributorId: distId,
        isPrimary: index === 0 // First one is primary
      }))
    })
  }

  // Invalidate the brands_distributors cache so the change is reflected immediately
  await invalidateCachePattern('cache:brands_distributors:*');

  return { success: true }
}

export const createDistributor = async ({ name }, context) => {
  if (!context.user) { throw new HttpError(401) }

  return context.entities.Distributor.create({
    data: { name }
  })
}

export const deleteDistributor = async ({ id }, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Soft delete
  return context.entities.Distributor.update({
    where: { id },
    data: { isActive: false }
  })
}

export const syncBrands = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Get all unique brands from ProductCatalog
  const products = await context.entities.ProductCatalog.findMany({
    where: { brand: { not: null } },
    select: { brand: true },
    distinct: ['brand']
  })

  const uniqueBrands = [...new Set(products.map(p => p.brand).filter(Boolean))]

  // Create Brand records for any that don't exist
  let created = 0
  for (const brandName of uniqueBrands) {
    const existing = await context.entities.Brand.findUnique({
      where: { name: brandName }
    })

    if (!existing) {
      await context.entities.Brand.create({
        data: { name: brandName }
      })
      created++
    }
  }

  return { totalBrands: uniqueBrands.length, created }
}

export const seedDistributors = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  const distributors = [
    { name: 'Direct', sortOrder: 1 },
    { name: 'Open Fields', sortOrder: 2 },
    { name: 'Legacy Supply', sortOrder: 3 },
    { name: 'Weed Pool', sortOrder: 4 },
    { name: 'NCD', sortOrder: 5 },
    { name: 'Valiant', sortOrder: 6 },
    { name: 'Lineage', sortOrder: 7 }
  ]

  let created = 0
  for (const dist of distributors) {
    const existing = await context.entities.Distributor.findUnique({
      where: { name: dist.name }
    })

    if (!existing) {
      await context.entities.Distributor.create({ data: dist })
      created++
    }
  }

  return { created, total: distributors.length }
}
