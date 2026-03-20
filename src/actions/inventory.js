import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { HttpError } from 'wasp/server';
import { invalidateCachePattern, warmOrderingAnalyticsCache } from '../cache.js';
import { syncBrands } from './brandDistributor.js';
import { enrichProductFormats } from './product.js';

export const analyzeInventoryExport = async ({ csvData, autoCreateStores = true }, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Set a timeout for large file processing (5 minutes)
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Processing timeout: File is too large or complex. Please try splitting your CSV into smaller files.'));
    }, 5 * 60 * 1000); // 5 minutes
  });

  const products = [];
  const locationColumns = [];
  const readable = Readable.from(csvData.split('\n'));

  // First pass: detect location columns and parse products
  const processingPromise = new Promise((resolve, reject) => {
    let rowCount = 0;
    const maxRows = 50000; // Limit to 50k rows to prevent hanging

    readable
      .pipe(csvParser())
      .on('data', (data) => {
        rowCount++;
        if (rowCount > maxRows) {
          reject(new Error(`File too large: More than ${maxRows} rows. Please split your CSV into smaller files.`));
          return;
        }
        // Detect location columns (numeric values in columns)
        if (Object.keys(data).length > 0) {
          Object.keys(data).forEach(key => {
            if (key !== 'ID' && key !== 'SKU' && key !== 'Product Name' &&
              key !== 'Category' && key !== 'Brand' && key !== 'Image URL' &&
              key !== 'Retail price' && key !== 'Deposit Fee' && key !== 'Wholesale cost' &&
              key !== 'Description' && key !== 'Barcode' && key !== 'Net product weight' &&
              key !== 'Compliance Weight' && key !== 'Volume' && key !== 'Created' && key !== 'Updated' &&
              !isNaN(parseInt(data[key])) && parseInt(data[key]) >= 0) {
              if (!locationColumns.includes(key)) {
                locationColumns.push(key);
              }
            }
          });
        }

        // Extract product data
        if (data['Product Name'] && data['Barcode']) {
          products.push({
            gtin: data['Barcode'],
            name: data['Product Name'],
            brand: data['Brand'],
            category: data['Category'],
            retailPrice: parseFloat(data['Retail price']?.replace('$', '') || 0),
            wholesaleCost: parseFloat(data['Wholesale cost']?.replace('$', '') || 0),
            description: data['Description'],
            imageUrl: data['Image URL'],
            stockLevels: locationColumns.map(location => ({
              location,
              quantity: parseInt(data[location]) || 0
            }))
          });
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  // Race between processing and timeout
  await Promise.race([processingPromise, timeoutPromise]);

  // Create/update stores if autoCreateStores is true
  const storeMap = {};
  if (autoCreateStores) {
    for (const location of locationColumns) {
      let store = await context.entities.Store.findFirst({
        where: { name: location }
      });

      if (!store) {
        store = await context.entities.Store.create({
          data: {
            name: location,
            location: location,
            userId: context.user.id
          }
        });
      }
      storeMap[location] = store.id;
    }
  }

  // Bulk fetch all existing products by GTIN (single query)
  const gtins = products.map(p => p.gtin);
  const existingProducts = await context.entities.ProductCatalog.findMany({
    where: { gtin: { in: gtins } },
    include: { stockLevels: true }
  });

  // Create lookup map for existing products
  const existingProductsMap = new Map();
  existingProducts.forEach(product => {
    existingProductsMap.set(product.gtin, product);
  });

  // Separate products into new and existing
  const newProducts = [];
  const existingProductsToUpdate = [];
  const unchangedProducts = [];

  for (const product of products) {
    const existing = existingProductsMap.get(product.gtin);
    if (!existing) {
      newProducts.push(product);
    } else {
      // Check if product details changed
      const hasChanges =
        existing.name !== product.name ||
        existing.brand !== product.brand ||
        existing.category !== product.category ||
        existing.description !== product.description ||
        existing.imageUrl !== product.imageUrl;

      if (hasChanges) {
        existingProductsToUpdate.push(product);
      } else {
        unchangedProducts.push(product);
      }
    }
  }

  return {
    newProducts: newProducts.length,
    updatedProducts: existingProductsToUpdate.length,
    unchangedProducts: unchangedProducts.length,
    totalProcessed: products.length,
    storesCreated: Object.keys(storeMap).length,
    locations: locationColumns
  };
};

// Helper function to sync categories in background (optimized with bulk operations)
async function syncCategoriesInBackground(context, updatedProducts) {
  const syncStartTime = Date.now();
  const syncStartTimestamp = new Date().toISOString().split('T')[1].split('.')[0];

  try {
    // Fetch all products that need category syncing
    const gtins = updatedProducts.map(p => p.gtin).filter(Boolean);
    if (gtins.length === 0) {
      return;
    }

    const productsToSync = await context.entities.ProductCatalog.findMany({
      where: { gtin: { in: gtins } },
      select: { id: true, gtin: true, parentCategory: true, subcategory: true }
    });

    if (productsToSync.length === 0) {
      return;
    }

    // Fetch ALL category definitions and subcategories once (bulk load)
    const allCategoryDefs = await context.entities.CategoryDefinition.findMany({
      where: { isActive: true },
      include: {
        subcategories: {
          where: { isActive: true }
        }
      }
    });

    // Build lookup maps for fast matching
    const categoryMap = new Map(); // category name -> CategoryDefinition
    const subcategoryMap = new Map(); // "categoryId:subcategoryName" -> CategorySubcategory

    allCategoryDefs.forEach(cat => {
      categoryMap.set(cat.name.toLowerCase().trim(), cat);
      cat.subcategories.forEach(sub => {
        const key = `${cat.id}:${sub.name.toLowerCase().trim()}`;
        subcategoryMap.set(key, sub);
      });
    });


    // Process products in batches and collect updates
    const categoryUpdates = []; // { productId, categoryDefinitionId, subcategoryId }
    const batchSize = 100;
    let processed = 0;

    for (let i = 0; i < productsToSync.length; i += batchSize) {
      const batch = productsToSync.slice(i, i + batchSize);

      for (const product of batch) {
        if (!product.parentCategory) continue;

        const categoryName = product.parentCategory.toLowerCase().trim();
        const categoryDef = categoryMap.get(categoryName);

        if (categoryDef) {
          const update = {
            productId: product.id,
            categoryDefinitionId: categoryDef.id,
            subcategoryId: null
          };

          // Try to match subcategory
          if (product.subcategory && categoryDef.subcategories) {
            const subcategoryName = product.subcategory.toLowerCase().trim();
            const subKey = `${categoryDef.id}:${subcategoryName}`;
            const subcategoryDef = subcategoryMap.get(subKey);

            if (subcategoryDef) {
              update.subcategoryId = subcategoryDef.id;
            }
          }

          categoryUpdates.push(update);
        }
      }

      processed += batch.length;
    }

    // Bulk update products in batches
    if (categoryUpdates.length > 0) {

      const updateBatchSize = 50; // Reduced from 100 to prevent connection pool exhaustion
      for (let i = 0; i < categoryUpdates.length; i += updateBatchSize) {
        const batch = categoryUpdates.slice(i, i + updateBatchSize);

        // Process sequentially within each batch to manage connections
        for (const update of batch) {
          await context.entities.ProductCatalog.update({
            where: { id: update.productId },
            data: {
              categoryDefinitionId: update.categoryDefinitionId,
              subcategoryId: update.subcategoryId
            }
          });
        }

      }
    }

  } catch (error) {
    const errorTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.error(`[${errorTimestamp}] Background category sync error:`, error.message);
    throw error;
  }
}

export const uploadInventoryExport = async ({ csvData, autoCreateStores = true }, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Helper function to split category into parent and subcategory
  const splitCategory = (category) => {
    if (!category) return { parentCategory: null, subcategory: null };

    // Handle various delimiters: " - ", " > ", "-", ">"
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

    // If no delimiter found, treat entire category as parent
    return { parentCategory: category.trim(), subcategory: null };
  };

  // Helper function to extract format from product name (improved for multipacks)
  const extractFormat = (productName) => {
    if (!productName) return null;

    // Clean up the product name
    const cleaned = productName.trim();

    // Look for multipack patterns: "10 x 0.3g", "5x10mg", "12 x 100mg", etc.
    const multipackPattern = /(\d+)\s*[xX×]\s*(\d+\.?\d*\s*(g|mg|ml|oz|%))/i;
    const multipackMatch = cleaned.match(multipackPattern);
    if (multipackMatch) {
      return multipackMatch[0].trim(); // Returns "10 x 0.3g"
    }

    // Extract format from last part after "-" or within parentheses
    const lastDashPart = cleaned.split('-').pop().trim();

    // Look for patterns like "1g", "100mg", "0.5g", "10ml", etc.
    const formatMatch = lastDashPart.match(/(\d+\.?\d*\s*(g|mg|ml|oz|%))/i);
    if (formatMatch) {
      return formatMatch[0].trim();
    }

    // Also check within parentheses
    const parenMatch = cleaned.match(/\(([^)]*(?:g|mg|ml|oz|%))\)/i);
    if (parenMatch) {
      return parenMatch[1].trim();
    }

    return null;
  };

  // Helper function to parse unit count and unit size from product name
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
        format: multipackMatch[0].trim() // "10 x 0.3g"
      };
    }

    // Single unit - extract format
    const format = extractFormat(productName);
    return {
      unitCount: 1,
      unitSize: format,
      format: format
    };
  };

  // Helper function to calculate margin
  const calculateMargin = (retailPrice, wholesaleCost) => {
    if (!retailPrice || retailPrice === 0) return 0;
    return (retailPrice - wholesaleCost) / retailPrice;
  };

  // Helper function to extract strain type from category
  const extractStrainType = (parentCategory, subcategory) => {
    if (!parentCategory || !subcategory) return 'N/A';

    const parent = parentCategory.toLowerCase();
    const sub = subcategory.toLowerCase();

    // Check if it's a flower or pre-roll product
    if (parent.includes('flower') || parent.includes('pre-roll') || parent.includes('preroll')) {
      // Check subcategory for strain type
      if (sub.includes('sativa')) return 'Sativa';
      if (sub.includes('hybrid')) return 'Hybrid';
      if (sub.includes('indica')) return 'Indica';
    }

    return 'N/A';
  };

  // Set a timeout for large file processing (5 minutes)
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Processing timeout: File is too large or complex. Please try splitting your CSV into smaller files.'));
    }, 5 * 60 * 1000); // 5 minutes
  });

  const productsMap = new Map(); // Use Map to handle duplicates by GTIN
  const locationColumns = [];
  const readable = Readable.from(csvData.split('\n'));

  // First pass: detect location columns and parse products
  const processingPromise = new Promise((resolve, reject) => {
    let rowCount = 0;
    const maxRows = 50000; // Limit to 50k rows to prevent hanging

    readable
      .pipe(csvParser())
      .on('data', (data) => {
        rowCount++;
        if (rowCount > maxRows) {
          reject(new Error(`File too large: More than ${maxRows} rows. Please split your CSV into smaller files.`));
          return;
        }

        // Detect location columns (numeric values in columns)
        if (Object.keys(data).length > 0) {
          Object.keys(data).forEach(key => {
            if (key !== 'ID' && key !== 'SKU' && key !== 'Product Name' &&
              key !== 'Category' && key !== 'Brand' && key !== 'Image URL' &&
              key !== 'Retail price' && key !== 'Deposit Fee' && key !== 'Wholesale cost' &&
              key !== 'Description' && key !== 'Barcode' && key !== 'Net product weight' &&
              key !== 'Compliance Weight' && key !== 'Volume' && key !== 'Created' && key !== 'Updated' &&
              !isNaN(parseInt(data[key])) && parseInt(data[key]) >= 0) {
              if (!locationColumns.includes(key)) {
                locationColumns.push(key);
              }
            }
          });
        }

        // Extract product data with data cleaning
        if (data['Product Name'] && data['Barcode']) {
          const gtin = data['Barcode'].trim();
          const retailPrice = parseFloat(data['Retail price']?.replace(/[$,]/g, '') || 0);
          const wholesaleCost = parseFloat(data['Wholesale cost']?.replace(/[$,]/g, '') || 0);
          const { parentCategory, subcategory } = splitCategory(data['Category']);
          const { unitCount, unitSize, format } = parseFormatDetails(data['Product Name']);
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
            unitCount,
            unitSize,
            retailPrice,
            wholesaleCost,
            margin,
            description: data['Description']?.trim() || null,
            imageUrl: data['Image URL']?.trim() || null,
            updated,
            stockLevels: []
          };

          // Collect stock levels for all locations
          Object.keys(data).forEach(key => {
            if (locationColumns.includes(key)) {
              const quantity = parseInt(data[key]) || 0;
              productData.stockLevels.push({
                location: key,
                originalLocation: key,
                quantity
              });
            }
          });

          // Handle duplicates: keep the one with the most recent Updated date
          const existing = productsMap.get(gtin);
          if (!existing || productData.updated > existing.updated) {
            productsMap.set(gtin, productData);
          }
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  // Race between processing and timeout
  await Promise.race([processingPromise, timeoutPromise]);

  // Convert Map to array
  const products = Array.from(productsMap.values());


  // Create/update stores - always build storeMap, even if autoCreateStores is false
  // First, fetch all existing stores to match by name or reportName
  const userStores = await context.entities.Store.findMany();

  // Build storeMap by matching CSV location columns to existing stores
  // Check both name and reportName (like inventory logs upload does)
  const storeMap = {};
  const unmatchedLocations = [];
  for (const location of locationColumns) {
    // Try to find existing store by name or reportName
    let store = userStores.find(s =>
      s.name === location ||
      (s.reportName && s.reportName === location)
    );

    if (!store && autoCreateStores) {
      // Only create new store if autoCreateStores is true
      store = await context.entities.Store.create({
        data: {
          name: location,
          location: location,
          userId: context.user.id
        }
      });
      // Add to userStores array so it's available for future iterations
      userStores.push(store);
    }

    if (store) {
      storeMap[location] = store.id;
    } else {
      // Track unmatched locations for warning
      unmatchedLocations.push(location);
    }
  }

  if (unmatchedLocations.length > 0) {
    // Unmatched locations - stock levels for these will be skipped
  }


  // Create inventory snapshot
  const snapshot = await context.entities.InventorySnapshot.create({
    data: {
      storeId: storeMap[locationColumns[0]] || context.user.stores[0]?.id,
      fileType: 'EXPORT',
      rawData: csvData
    }
  });

  // Bulk fetch all existing products by GTIN (single query)
  const gtins = products.map(p => p.gtin);
  const existingProducts = await context.entities.ProductCatalog.findMany({
    where: { gtin: { in: gtins } },
    include: { stockLevels: true }
  });

  // Create lookup map for existing products
  const existingProductsMap = new Map();
  existingProducts.forEach(product => {
    existingProductsMap.set(product.gtin, product);
  });

  // Separate products into new and existing
  const newProducts = [];
  const existingProductsToUpdate = [];
  const unchangedProducts = [];


  for (let i = 0; i < products.length; i++) {
    const product = products[i];
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
        unitCount: product.unitCount,
        unitSize: product.unitSize,
        retailPrice: product.retailPrice,
        wholesaleCost: product.wholesaleCost,
        margin: product.margin,
        description: product.description,
        imageUrl: product.imageUrl
      });
    } else {
      // Check if product details changed
      const hasChanges =
        existing.name !== product.name ||
        existing.brand !== product.brand ||
        existing.category !== product.category ||
        existing.parentCategory !== product.parentCategory ||
        existing.subcategory !== product.subcategory ||
        existing.strainType !== product.strainType ||
        existing.format !== product.format ||
        existing.retailPrice !== product.retailPrice ||
        existing.wholesaleCost !== product.wholesaleCost ||
        existing.description !== product.description ||
        existing.imageUrl !== product.imageUrl;

      if (hasChanges) {
        existingProductsToUpdate.push({
          gtin: product.gtin,
          name: product.name,
          brand: product.brand,
          category: product.category,
          parentCategory: product.parentCategory,
          subcategory: product.subcategory,
          strainType: product.strainType,
          format: product.format,
          unitCount: product.unitCount,
          unitSize: product.unitSize,
          retailPrice: product.retailPrice,
          wholesaleCost: product.wholesaleCost,
          margin: product.margin,
          description: product.description,
          imageUrl: product.imageUrl
        });
      } else {
        unchangedProducts.push(product);
      }
    }

  }


  // Helper to truncate long text fields
  const truncateField = (text, maxLength = 1000) => {
    if (!text) return text;
    return text.length > maxLength ? text.substring(0, maxLength) : text;
  };

  // Batch create new products - PostgreSQL can handle much larger batches
  let createdProducts = [];
  if (newProducts.length > 0) {
    const chunkSize = 1000; // Increased from 100 for PostgreSQL
    for (let i = 0; i < newProducts.length; i += chunkSize) {
      const chunk = newProducts.slice(i, i + chunkSize).map(p => ({
        ...p,
        description: truncateField(p.description, 1000),
        imageUrl: truncateField(p.imageUrl, 500),
        imageMigrationStatus: p.imageUrl ? 'PENDING' : null
      }));

      const batchStartTime = Date.now();
      try {
        await context.entities.ProductCatalog.createMany({
          data: chunk,
          skipDuplicates: true // PostgreSQL supports this
        });

        const batchEndTime = Date.now();
        const batchDuration = ((batchEndTime - batchStartTime) / 1000).toFixed(2);
        const batchTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const totalProcessed = Math.min(i + chunkSize, newProducts.length);
        const percentage = ((totalProcessed / newProducts.length) * 100).toFixed(1);
      } catch (error) {
        console.error(`Error in product creation batch: ${error.message}`);
        // If batch fails, try smaller chunks
        const smallerChunkSize = 100;
        for (let j = 0; j < chunk.length; j += smallerChunkSize) {
          const smallChunk = chunk.slice(j, j + smallerChunkSize);
          try {
            await context.entities.ProductCatalog.createMany({
              data: smallChunk,
              skipDuplicates: true
            });
          } catch (err) {
            console.error(`Failed smaller batch: ${err.message}`);
          }
        }
      }
    }


    // Fetch the created products to get their IDs
    createdProducts = await context.entities.ProductCatalog.findMany({
      where: { gtin: { in: newProducts.map(p => p.gtin) } }
    });

  }

  // Helper function for controlled parallel processing with progress tracking
  const processInParallel = async (items, concurrency, processor, onProgress) => {
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(item => processor(item).catch(err => {
          console.error(`Error processing item: ${err.message}`);
          return null; // Continue processing other items even if one fails
        }))
      );
      results.push(...batchResults);

      // Call progress callback after each batch
      if (onProgress) {
        onProgress(results.length, items.length);
      }
    }
    return results;
  };

  // Batch update existing products - Process in parallel with controlled concurrency
  // Preserve enriched fields (thc, cbd, cannabinoidProfile, strainType, classificationId, format, distributorId, description, imageUrl, categoryDefinitionId, subcategoryId)
  if (existingProductsToUpdate.length > 0) {
    const concurrency = 10; // Process 10 products in parallel at a time

    // Process all products with controlled concurrency
    await processInParallel(
      existingProductsToUpdate,
      concurrency,
      async (product) => {
        // Use existing product data from the map instead of re-querying
        const existing = existingProductsMap.get(product.gtin);

        // Determine image URL and migration status
        const newImageUrl = truncateField(product.imageUrl, 500);
        const existingImageUrl = existing?.imageUrl;

        // Preserve migrated images - don't overwrite if already migrated
        // Only update imageUrl from CSV if it's different, but keep migration status
        let imageUrlToUse = existingImageUrl || newImageUrl;
        let imageMigrationStatus = existing?.imageMigrationStatus;

        // Set migration status to PENDING if:
        // 1. New image URL is provided and different from existing, OR
        // 2. No existing image URL but CSV has one
        // But preserve MIGRATED status if image URL hasn't changed
        if (newImageUrl && newImageUrl !== existingImageUrl) {
          // Image URL changed - update the URL and mark for re-migration
          imageUrlToUse = newImageUrl;
          if (existing?.imageMigrationStatus === 'MIGRATED') {
            // Image was migrated but URL changed - mark for re-migration
            imageMigrationStatus = 'PENDING';
          } else if (!existing?.imageMigrationStatus) {
            // New image URL, mark as PENDING
            imageMigrationStatus = 'PENDING';
          }
        } else if (existing?.imageMigrationStatus === 'MIGRATED' && existing?.imageStoragePath) {
          // Image already migrated and URL unchanged - preserve everything
          imageUrlToUse = existingImageUrl; // Keep existing URL
          // imageMigrationStatus already set to 'MIGRATED' above
        }

        await context.entities.ProductCatalog.update({
          where: { gtin: product.gtin },
          data: {
            name: product.name,
            brand: product.brand,
            category: product.category,
            parentCategory: product.parentCategory, // Overwritten from CSV
            subcategory: product.subcategory, // Overwritten from CSV
            strainType: existing?.strainType || product.strainType, // Preserve if exists
            format: existing?.format || product.format, // Preserve if exists
            unitCount: product.unitCount,
            unitSize: product.unitSize,
            retailPrice: product.retailPrice, // Overwritten from CSV
            wholesaleCost: product.wholesaleCost, // Overwritten from CSV
            margin: product.margin,
            description: existing?.description || truncateField(product.description, 1000), // Preserve if exists
            imageUrl: imageUrlToUse, // Use existing if available, otherwise new
            imageStoragePath: existing?.imageStoragePath, // Preserve migrated image paths
            imageThumbnailPath: existing?.imageThumbnailPath, // Preserve migrated thumbnail paths
            imageMigrationStatus: imageMigrationStatus, // Set to PENDING if new/changed image, preserve MIGRATED
            thc: existing?.thc, // Preserve
            cbd: existing?.cbd, // Preserve
            cannabinoidProfile: existing?.cannabinoidProfile, // Preserve
            classificationId: existing?.classificationId, // Preserve
            distributorId: existing?.distributorId, // Preserve
            categoryDefinitionId: existing?.categoryDefinitionId, // Preserve
            subcategoryId: existing?.subcategoryId, // Preserve
            lastSeen: new Date()
          }
        });
      },
      // Progress callback
      () => {}
    );


    // Category syncing will be done in background - don't block upload response
    const updatedProducts = existingProductsToUpdate.map(p => ({
      gtin: p.gtin,
      parentCategory: p.parentCategory,
      subcategory: p.subcategory
    }));

    // Fire-and-forget: Sync categories in background
    if (updatedProducts.length > 0) {
      // Run in background (don't await)
      syncCategoriesInBackground(context, updatedProducts).catch(err => {
        const errorTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.error(`[${errorTimestamp}] Background category sync failed:`, err.message);
      });
    }
  }

  // Update lastSeen for unchanged products
  if (unchangedProducts.length > 0) {
    const unchangedGtins = unchangedProducts.map(p => p.gtin);
    await context.entities.ProductCatalog.updateMany({
      where: { gtin: { in: unchangedGtins } },
      data: { lastSeen: new Date() }
    });
  }


  // Get all products (existing + new) for stock level updates
  const allProducts = await context.entities.ProductCatalog.findMany({
    where: { gtin: { in: gtins } }
  });
  const allProductsMap = new Map();
  allProducts.forEach(product => {
    allProductsMap.set(product.gtin, product);
  });

  // Batch update stock levels
  const stockLevelUpdates = [];
  const skippedStockLevels = []; // Track stock levels that couldn't be matched to stores
  for (const product of products) {
    const catalogProduct = allProductsMap.get(product.gtin);
    if (catalogProduct) {
      for (const stockLevel of product.stockLevels) {
        if (storeMap[stockLevel.location]) {
          stockLevelUpdates.push({
            storeId: storeMap[stockLevel.location],
            productId: catalogProduct.id,
            quantity: stockLevel.quantity,
            snapshotId: snapshot.id
          });
        } else {
          // Track skipped stock levels for logging
          skippedStockLevels.push({
            productGtin: product.gtin,
            productName: product.name,
            location: stockLevel.location,
            quantity: stockLevel.quantity
          });
        }
      }
    }
  }

  // Batch update stock levels - DELETE old + BULK INSERT new (fastest approach)
  if (stockLevelUpdates.length > 0) {
    const startTime = Date.now();

    try {
      // Step 1: Get unique store IDs and product IDs from this upload
      const storeIds = [...new Set(stockLevelUpdates.map(s => s.storeId))];
      const productIds = [...new Set(stockLevelUpdates.map(s => s.productId))];


      // Delete existing stock levels for these products in these stores
      // This ensures we replace old inventory data with fresh data from the CSV
      // Only delete for stores that are in the current upload (preserve inventory for other stores)
      const deleteResult = await context.entities.StockLevel.deleteMany({
        where: {
          AND: [
            { storeId: { in: storeIds } },
            { productId: { in: productIds } }
          ]
        }
      });


      // Step 2: Bulk insert all new stock levels in chunks
      const chunkSize = 1000; // PostgreSQL can handle large bulk inserts
      let totalInserted = 0;

      for (let i = 0; i < stockLevelUpdates.length; i += chunkSize) {
        const chunk = stockLevelUpdates.slice(i, i + chunkSize);

        await context.entities.StockLevel.createMany({
          data: chunk.map(stock => ({
            storeId: stock.storeId,
            productId: stock.productId,
            quantity: stock.quantity,
            snapshotId: stock.snapshotId,
            lastUpdated: new Date()
          }))
        });

        totalInserted += chunk.length;

      }

    } catch (error) {
      const errorTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
      console.error(`[${errorTimestamp}] Error in bulk stock level update:`, error.message);
      throw error;
    }
  }

  const results = {
    newProducts: newProducts.length,
    updatedProducts: existingProductsToUpdate.length,
    unchangedProducts: unchangedProducts.length,
    totalProcessed: products.length
  };

  // Invalidate cache after inventory export update (CRITICAL for fresh data)
  await invalidateCachePattern('cache:base:*');
  await invalidateCachePattern('cache:recent_sales:*');
  await invalidateCachePattern('cache:recent_sales_movements:*');
  await invalidateCachePattern('cache:older_sales:*');
  await invalidateCachePattern('cache:filter_options:*');
  await invalidateCachePattern('cache:sparklines:*');
  await invalidateCachePattern('cache:sales_totals:*');
  await invalidateCachePattern('cache:products_paginated:*');
  await invalidateCachePattern('cache:purchase_orders:*');
  await invalidateCachePattern('cache:rankings:*');

  // Warm cache after upload (fire-and-forget)
  const stores = await context.entities.Store.findMany({
    where: { isActive: true },
    select: { id: true }
  });
  if (stores.length > 0) {
    const storeIds = stores.map(s => s.id);
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 14 * 24 * 60 * 60 * 1000);
    warmOrderingAnalyticsCache(context, storeIds, startDate, endDate, false).catch(() => {});
  }

  // Post-upload: sync brands and enrich formats (fire-and-forget)
  syncBrands(null, context).catch(() => {});
  enrichProductFormats(null, context).catch(() => {});

  return {
    snapshot,
    newProducts: results.newProducts,
    updatedProducts: results.updatedProducts,
    unchangedProducts: results.unchangedProducts,
    totalProcessed: results.totalProcessed,
    storesCreated: Object.keys(storeMap).length,
    locations: locationColumns
  };
};
