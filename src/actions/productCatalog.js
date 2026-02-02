import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { HttpError } from 'wasp/server';
import { invalidateCachePattern, warmOrderingAnalyticsCache } from '../cache.js';

export const uploadProductCatalog = async ({ csvData }, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Log file size for monitoring
  const csvSize = new Blob([csvData]).size;
  console.log(`Processing product catalog CSV: ${(csvSize / 1024 / 1024).toFixed(2)}MB`);

  // Helper functions (same as uploadInventoryExport)
  const splitCategory = (category) => {
    if (!category) return { parentCategory: null, subcategory: null };
    const delimiters = [' - ', ' > ', '-', '>'];
    for (const delimiter of delimiters) {
      if (category.includes(delimiter)) {
        const parts = category.split(delimiter);
        return {
          parentCategory: parts[0].trim(),
          subcategory: parts.slice(1).join(delimiter).trim().replace(/^>+\s*/, '')
        };
      }
    }
    return { parentCategory: category.trim(), subcategory: null };
  };

  const extractFormat = (productName) => {
    if (!productName) return null;
    const lastDashPart = productName.split('-').pop().trim();
    const formatMatch = lastDashPart.match(/(\d+\.?\d*\s*(g|mg|ml|oz|%))/i);
    if (formatMatch) return formatMatch[0].trim();
    const parenMatch = productName.match(/\(([^)]*(?:g|mg|ml|oz|%))\)/i);
    if (parenMatch) return parenMatch[1].trim();
    return null;
  };

  const calculateMargin = (retailPrice, wholesaleCost) => {
    if (!retailPrice || retailPrice === 0) return 0;
    return (retailPrice - wholesaleCost) / retailPrice;
  };

  const extractStrainType = (parentCategory, subcategory) => {
    if (!parentCategory || !subcategory) return 'N/A';
    const parent = parentCategory.toLowerCase();
    const sub = subcategory.toLowerCase();
    if (parent.includes('flower') || parent.includes('pre-roll') || parent.includes('preroll')) {
      if (sub.includes('sativa')) return 'Sativa';
      if (sub.includes('hybrid')) return 'Hybrid';
      if (sub.includes('indica')) return 'Indica';
    }
    return 'N/A';
  };

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Processing timeout: File is too large or complex.'));
    }, 5 * 60 * 1000);
  });

  const productsMap = new Map();
  const readable = Readable.from(csvData.split('\n'));

  const processingPromise = new Promise((resolve, reject) => {
    let rowCount = 0;
    const maxRows = 50000;

    readable
      .pipe(csvParser())
      .on('data', (data) => {
        rowCount++;
        if (rowCount > maxRows) {
          reject(new Error(`File too large: More than ${maxRows} rows.`));
          return;
        }

        // Process product data
        if (data['Product Name'] && data['Barcode']) {
          const gtin = data['Barcode'].trim();
          const retailPrice = parseFloat(data['Retail price']?.replace(/[$,]/g, '') || 0);
          const wholesaleCost = parseFloat(data['Wholesale cost']?.replace(/[$,]/g, '') || 0);
          const { parentCategory, subcategory } = splitCategory(data['Category']);
          const format = extractFormat(data['Product Name']);
          const margin = calculateMargin(retailPrice, wholesaleCost);
          const strainType = extractStrainType(parentCategory, subcategory);
          const updated = data['Updated'] ? new Date(data['Updated']) : new Date();

          const productData = {
            gtin,
            name: data['Product Name'].trim(),
            brand: data['Brand']?.trim() || null,
            category: data['Category']?.trim() || null,
            parentCategory,
            subcategory,
            strainType,
            format,
            retailPrice,
            wholesaleCost,
            margin,
            description: data['Description']?.trim() || null,
            imageUrl: data['Image URL']?.trim() || null,
            weight: parseFloat(data['Net product weight']) || null,
            size: data['Size']?.trim() || null,
            updated
          };

          // Handle duplicates: keep most recent
          const existing = productsMap.get(gtin);
          if (!existing || productData.updated > existing.updated) {
            productsMap.set(gtin, productData);
          }
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  await Promise.race([processingPromise, timeoutPromise]);

  const products = Array.from(productsMap.values());

  // Bulk fetch existing products
  const gtins = products.map(p => p.gtin);
  const existingProducts = await context.entities.ProductCatalog.findMany({
    where: { gtin: { in: gtins } }
  });

  const existingProductsMap = new Map();
  existingProducts.forEach(product => {
    existingProductsMap.set(product.gtin, product);
  });

  const newProducts = [];
  const updatedProducts = [];

  for (const product of products) {
    const existing = existingProductsMap.get(product.gtin);
    if (!existing) {
      newProducts.push({
        gtin: product.gtin,
        name: product.name,
        brand: product.brand,
        category: product.category,
        parentCategory: product.parentCategory,
        subcategory: product.subcategory,
        strainType: product.strainType,
        format: product.format,
        retailPrice: product.retailPrice,
        wholesaleCost: product.wholesaleCost,
        margin: product.margin,
        description: product.description,
        imageUrl: product.imageUrl,
        weight: product.weight,
        size: product.size
      });
    } else {
      updatedProducts.push({
        gtin: product.gtin,
        name: product.name,
        brand: product.brand,
        category: product.category,
        parentCategory: product.parentCategory,
        subcategory: product.subcategory,
        format: product.format,
        retailPrice: product.retailPrice,
        wholesaleCost: product.wholesaleCost,
        margin: product.margin,
        description: product.description,
        imageUrl: product.imageUrl,
        weight: product.weight,
        size: product.size
      });
    }
  }

  // Batch create new products
  if (newProducts.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < newProducts.length; i += chunkSize) {
      const chunk = newProducts.slice(i, i + chunkSize);

      try {
        await context.entities.ProductCatalog.createMany({
          data: chunk
        });
      } catch (error) {
        // If batch fails, try one by one
        for (const product of chunk) {
          try {
            await context.entities.ProductCatalog.create({
              data: product
            });
          } catch (err) {
            console.log(`Skipping duplicate product: ${product.gtin}`);
          }
        }
      }
    }
  }

  // Batch update existing products - Process sequentially to avoid connection pool exhaustion
  if (updatedProducts.length > 0) {
    const chunkSize = 50; // Process in smaller chunks to manage connections
    for (let i = 0; i < updatedProducts.length; i += chunkSize) {
      const chunk = updatedProducts.slice(i, i + chunkSize);

      // Process sequentially within each chunk
      for (const product of chunk) {
        await context.entities.ProductCatalog.update({
          where: { gtin: product.gtin },
          data: {
            name: product.name,
            brand: product.brand,
            category: product.category,
            parentCategory: product.parentCategory,
            subcategory: product.subcategory,
            strainType: product.strainType,
            format: product.format,
            retailPrice: product.retailPrice,
            wholesaleCost: product.wholesaleCost,
            margin: product.margin,
            description: product.description,
            imageUrl: product.imageUrl,
            weight: product.weight,
            size: product.size,
            lastSeen: new Date()
          }
        });
      }
    }
  }

  // Invalidate and warm cache after product catalog update
  await invalidateCachePattern('cache:base:*');
  await invalidateCachePattern('cache:filter_options:*');

  // Warm cache after upload (fire-and-forget)
  const stores = await context.entities.Store.findMany({
    where: { userId: context.user.id, isActive: true },
    select: { id: true }
  });
  if (stores.length > 0) {
    const storeIds = stores.map(s => s.id);
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 14 * 24 * 60 * 60 * 1000);
    warmOrderingAnalyticsCache(context, storeIds, startDate, endDate, false).catch(err =>
      console.warn('Cache warming failed after product catalog upload:', err.message)
    );
  }

  return {
    newProducts: newProducts.length,
    updatedProducts: updatedProducts.length,
    totalProcessed: products.length
  };
};
