import { HttpError } from 'wasp/server';
import { invalidateCachePattern } from '../cache.js';

export const updateProductEnrichment = async ({ productId, updates }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const product = await context.entities.ProductCatalog.findUnique({
    where: { id: productId }
  })

  if (!product) { throw new HttpError(404, 'Product not found') }

  // Track changes for audit trail
  const changes = []
  const data = {}

  if (updates.thc !== undefined && updates.thc !== product.thc) {
    changes.push({ field: 'thc', oldValue: String(product.thc || ''), newValue: String(updates.thc || '') })
    data.thc = updates.thc
  }

  if (updates.cbd !== undefined && updates.cbd !== product.cbd) {
    changes.push({ field: 'cbd', oldValue: String(product.cbd || ''), newValue: String(updates.cbd || '') })
    data.cbd = updates.cbd
  }

  if (updates.cannabinoidProfile !== undefined) {
    changes.push({ field: 'cannabinoidProfile', oldValue: JSON.stringify(product.cannabinoidProfile || {}), newValue: JSON.stringify(updates.cannabinoidProfile || {}) })
    data.cannabinoidProfile = updates.cannabinoidProfile
  }

  if (updates.classificationId !== undefined && updates.classificationId !== product.classificationId) {
    changes.push({ field: 'classificationId', oldValue: String(product.classificationId || ''), newValue: String(updates.classificationId || '') })
    data.classificationId = updates.classificationId
  }

  if (updates.categoryDefinitionId !== undefined && updates.categoryDefinitionId !== product.categoryDefinitionId) {
    changes.push({ field: 'categoryDefinitionId', oldValue: String(product.categoryDefinitionId || ''), newValue: String(updates.categoryDefinitionId || '') })
    data.categoryDefinitionId = updates.categoryDefinitionId
  }

  if (updates.subcategoryId !== undefined && updates.subcategoryId !== product.subcategoryId) {
    changes.push({ field: 'subcategoryId', oldValue: String(product.subcategoryId || ''), newValue: String(updates.subcategoryId || '') })
    data.subcategoryId = updates.subcategoryId
  }

  if (updates.format !== undefined && updates.format !== product.format) {
    changes.push({ field: 'format', oldValue: product.format || '', newValue: updates.format || '' })
    data.format = updates.format
  }

  if (updates.distributorId !== undefined && updates.distributorId !== product.distributorId) {
    changes.push({ field: 'distributorId', oldValue: String(product.distributorId || ''), newValue: String(updates.distributorId || '') })
    data.distributorId = updates.distributorId
  }

  const updated = await context.entities.ProductCatalog.update({
    where: { id: productId },
    data
  })

  // Create enrichment audit records
  for (const change of changes) {
    await context.entities.ProductEnrichment.create({
      data: {
        productId,
        enrichedBy: context.user.id,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue
      }
    })
  }

  // Invalidate base product caches so the change is reflected immediately
  if (changes.length > 0) {
    await invalidateCachePattern('cache:base:*');
  }

  return updated
}

export const updateProductCannabinoids = async ({ productId, thc, cbd, cannabinoidProfile }, context) => {
  return updateProductEnrichment({ productId, updates: { thc, cbd, cannabinoidProfile } }, context)
}

export const bulkUpdateProducts = async ({ productIds, updates }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const results = []
  for (const productId of productIds) {
    try {
      const updated = await updateProductEnrichment({ productId, updates }, context)
      results.push({ productId, success: true, product: updated })
    } catch (error) {
      results.push({ productId, success: false, error: error.message })
    }
  }

  return { results, total: productIds.length, successful: results.filter(r => r.success).length }
}

export const markProductStatus = async ({ productId, status, salePrice }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const product = await context.entities.ProductCatalog.findUnique({
    where: { id: productId }
  })

  if (!product) { throw new HttpError(404, 'Product not found') }

  const updateData = { status }
  if (salePrice !== undefined) {
    updateData.salePrice = salePrice
  }

  return await context.entities.ProductCatalog.update({
    where: { id: productId },
    data: updateData
  })
}

export const enrichProductFormats = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Helper to parse format details
  const parseFormatDetails = (productName) => {
    if (!productName) return { unitCount: 1, unitSize: null, format: null };

    const cleaned = productName.trim();

    // Look for multipack patterns: "10 x 0.3g", "5x10mg", "12 x 100mg", etc.
    const multipackPattern = /(\d+)\s*[xX×]\s*(\d+\.?\d*\s*(g|mg|ml|oz|%))/i;
    const multipackMatch = cleaned.match(multipackPattern);

    if (multipackMatch) {
      return {
        unitCount: parseInt(multipackMatch[1]),
        unitSize: multipackMatch[2].trim(),
        format: multipackMatch[0].trim()
      };
    }

    // Single unit - extract format
    const lastDashPart = cleaned.split('-').pop().trim();
    const formatMatch = lastDashPart.match(/(\d+\.?\d*\s*(g|mg|ml|oz|%))/i);
    if (formatMatch) {
      const format = formatMatch[0].trim();
      return { unitCount: 1, unitSize: format, format };
    }

    const parenMatch = cleaned.match(/\(([^)]*(?:g|mg|ml|oz|%))\)/i);
    if (parenMatch) {
      const format = parenMatch[1].trim();
      return { unitCount: 1, unitSize: format, format };
    }

    return { unitCount: 1, unitSize: null, format: null };
  };

  // Get all products
  const products = await context.entities.ProductCatalog.findMany();

  let updated = 0;
  let skipped = 0;

  // Process in chunks
  const chunkSize = 100;
  for (let i = 0; i < products.length; i += chunkSize) {
    const chunk = products.slice(i, i + chunkSize);

    await Promise.all(chunk.map(async (product) => {
      const { unitCount, unitSize, format } = parseFormatDetails(product.name);

      // Check if update is needed
      const needsUpdate =
        (format && format !== product.format) ||
        (unitCount && unitCount !== product.unitCount) ||
        (unitSize && unitSize !== product.unitSize);

      if (needsUpdate) {
        await context.entities.ProductCatalog.update({
          where: { id: product.id },
          data: {
            format: format || product.format,
            unitCount: unitCount || product.unitCount || 1,
            unitSize: unitSize || product.unitSize
          }
        });
        updated++;
      } else {
        skipped++;
      }
    }));

  }

  return {
    totalProducts: products.length,
    updated,
    skipped
  };
}
