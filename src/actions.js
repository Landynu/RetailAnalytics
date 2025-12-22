import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { HttpError } from 'wasp/server';
import { invalidateCachePattern, warmOrderingAnalyticsCache } from './cache.js';
import { migrateAllProductImages, configureBucketCORS } from './services/imageMigration.js';

export const uploadInventory = async ({ storeId, csvData, autoCreateStores: _autoCreateStores = false }, context) => {
  if (!context.user) { throw new HttpError(401) };

  // Log file size for monitoring (no limit enforcement)
  const csvSize = new Blob([csvData]).size;
  console.log(`Processing legacy inventory CSV: ${(csvSize / 1024 / 1024).toFixed(2)}MB`);

  // Set a timeout for large file processing (5 minutes)
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Processing timeout: File is too large or complex. Please try splitting your CSV into smaller files.'));
    }, 5 * 60 * 1000); // 5 minutes
  });

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });
  if (!store || store.userId !== context.user.id) { throw new HttpError(403) };

  const products = [];
  const readable = Readable.from(csvData.split('\n'));

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
        products.push({
          name: data.name || data.Product || data['Product Name'],
          gtin: data.gtin || data.Barcode || data.SKU,
          price: parseFloat(data.price || data['Retail price'] || data['Wholesale cost']),
          inventoryId: null // Will be set after inventory creation
        });
      })
      .on('end', resolve)
      .on('error', reject);
  });

  // Race between processing and timeout
  await Promise.race([processingPromise, timeoutPromise]);

  const inventory = await context.entities.Inventory.create({
    data: { csvData, storeId: parseInt(storeId) }
  });

  // Fix the bug: use inventory.id instead of storeId
  await Promise.all(products.map(async (product) => {
    await context.entities.Product.create({
      data: {
        name: product.name,
        gtin: product.gtin,
        price: product.price,
        inventoryId: inventory.id
      }
    });
  }));

  return inventory;
};

export const createStore = async ({ name, location }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.create({
    data: {
      name,
      location,
      userId: context.user.id
    }
  });

  return store;
};

export const generateSmartMenu = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: storeId }
  });
  if (!store) { throw new HttpError(404) }

  const inventory = await context.entities.Inventory.findMany({
    where: { storeId: store.id },
    include: { products: true }
  });

  const smartMenu = inventory.map(inv => ({
    inventoryId: inv.id,
    products: inv.products
  }));

  return smartMenu;
};

// New PRD Actions

export const analyzeInventoryExport = async ({ csvData, autoCreateStores = true }, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Log file size for monitoring (no limit enforcement)
  const csvSize = new Blob([csvData]).size;
  console.log(`Analyzing inventory export CSV: ${(csvSize / 1024 / 1024).toFixed(2)}MB`);

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
        where: { name: location, userId: context.user.id }
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
  console.log(`[${syncStartTimestamp}] 🔄 Background category sync: Processing ${updatedProducts.length} products...`);

  try {
    // Fetch all products that need category syncing
    const gtins = updatedProducts.map(p => p.gtin).filter(Boolean);
    if (gtins.length === 0) {
      console.log(`[${syncStartTimestamp}] ⚠️ No products to sync (no GTINs)`);
      return;
    }

    const productsToSync = await context.entities.ProductCatalog.findMany({
      where: { gtin: { in: gtins } },
      select: { id: true, gtin: true, parentCategory: true, subcategory: true }
    });

    if (productsToSync.length === 0) {
      console.log(`[${syncStartTimestamp}] ⚠️ No products found in database to sync`);
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

    const syncTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${syncTimestamp}] Loaded ${allCategoryDefs.length} category definitions, processing ${productsToSync.length} products...`);

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
      if (processed % 500 === 0 || processed === productsToSync.length) {
        const progressTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const percentage = ((processed / productsToSync.length) * 100).toFixed(1);
        console.log(`[${progressTimestamp}] Category sync: Processed ${processed}/${productsToSync.length} products (${percentage}%) - ${categoryUpdates.length} matches found`);
      }
    }

    // Bulk update products in batches
    if (categoryUpdates.length > 0) {
      const updateTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
      console.log(`[${updateTimestamp}] Applying ${categoryUpdates.length} category updates in batches...`);

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

        if ((i + updateBatchSize) % 500 === 0 || i + updateBatchSize >= categoryUpdates.length) {
          const batchTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
          const totalUpdated = Math.min(i + updateBatchSize, categoryUpdates.length);
          const percentage = ((totalUpdated / categoryUpdates.length) * 100).toFixed(1);
          console.log(`[${batchTimestamp}] Updated: ${totalUpdated}/${categoryUpdates.length} products (${percentage}%)`);
        }
      }
    }

    const syncDuration = ((Date.now() - syncStartTime) / 1000).toFixed(2);
    const syncCompleteTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${syncCompleteTimestamp}] ✅ Background category sync complete: ${categoryUpdates.length} products updated in ${syncDuration}s`);

  } catch (error) {
    const errorTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.error(`[${errorTimestamp}] ❌ Background category sync error:`, error.message);
    throw error;
  }
}

export const uploadInventoryExport = async ({ csvData, autoCreateStores = true }, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Log file size for monitoring (no limit enforcement)
  const csvSize = new Blob([csvData]).size;
  const startTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`\n[${startTimestamp}] 📤 STARTING INVENTORY EXPORT UPLOAD`);
  console.log(`[${startTimestamp}] File size: ${(csvSize / 1024 / 1024).toFixed(2)}MB`);
  console.log(`[${startTimestamp}] Stage 1/4: Parsing CSV file...`);

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

  // No longer normalizing location names - using friendlyName instead

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

  const parseTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${parseTimestamp}] ✓ Stage 1 complete: Parsed ${products.length} products, detected ${locationColumns.length} locations`);
  console.log(`[${parseTimestamp}] Stage 2/4: Creating/updating stores...`);

  // Create/update stores - always build storeMap, even if autoCreateStores is false
  // First, fetch all existing stores to match by name or reportName
  const userStores = await context.entities.Store.findMany({
    where: { userId: context.user.id }
  });

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
    const unmatchedTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.warn(`[${unmatchedTimestamp}] ⚠️  WARNING: ${unmatchedLocations.length} location(s) could not be matched to stores: ${unmatchedLocations.join(', ')}`);
    console.warn(`[${unmatchedTimestamp}] Stock levels for these locations will be skipped. Enable autoCreateStores or ensure store names/reportNames match CSV column names.`);
  }

  const storeTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${storeTimestamp}] ✓ Stage 2 complete: ${Object.keys(storeMap).length} stores ready (${locationColumns.length} locations in CSV)`);
  console.log(`[${storeTimestamp}] Stage 3/4: Processing products (create/update/unchanged)...`);

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

  const categorizeTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${categorizeTimestamp}] Categorizing ${products.length} products...`);

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

    // Log progress every 1000 products
    if ((i + 1) % 1000 === 0 || i === products.length - 1) {
      const progressTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
      const percentage = (((i + 1) / products.length) * 100).toFixed(1);
      console.log(`[${progressTimestamp}] Categorized ${i + 1}/${products.length} products (${percentage}%) - ${newProducts.length} new, ${existingProductsToUpdate.length} to update, ${unchangedProducts.length} unchanged`);
    }
  }

  const categorizeCompleteTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${categorizeCompleteTimestamp}] ✓ Categorization complete: ${newProducts.length} new, ${existingProductsToUpdate.length} to update, ${unchangedProducts.length} unchanged`);

  // Helper to truncate long text fields
  const truncateField = (text, maxLength = 1000) => {
    if (!text) return text;
    return text.length > maxLength ? text.substring(0, maxLength) : text;
  };

  // Batch create new products - PostgreSQL can handle much larger batches
  let createdProducts = [];
  if (newProducts.length > 0) {
    const createStartTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${createStartTimestamp}] Creating ${newProducts.length} new products in batches...`);
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
        console.log(`[${batchTimestamp}] Created batch: ${totalProcessed}/${newProducts.length} products (${percentage}%) - ${batchDuration}s`);
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

    const createCompleteTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${createCompleteTimestamp}] ✓ Product creation complete, fetching IDs...`);

    // Fetch the created products to get their IDs
    createdProducts = await context.entities.ProductCatalog.findMany({
      where: { gtin: { in: newProducts.map(p => p.gtin) } }
    });

    const fetchTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${fetchTimestamp}] ✓ Fetched ${createdProducts.length} product IDs`);
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
    const updateStartTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${updateStartTimestamp}] Updating ${existingProductsToUpdate.length} existing products in parallel (concurrency: 10)...`);
    const batchStartTime = Date.now();
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
      (processedCount, total) => {
        if (processedCount % 100 === 0 || processedCount === total) {
          const progressTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
          const elapsed = ((Date.now() - batchStartTime) / 1000).toFixed(1);
          const percentage = ((processedCount / total) * 100).toFixed(1);
          const rate = (processedCount / parseFloat(elapsed)).toFixed(1);
          console.log(`[${progressTimestamp}] Updated: ${processedCount}/${total} products (${percentage}%) - ${elapsed}s elapsed - ${rate} products/sec`);
        }
      }
    );

    const batchEndTime = Date.now();
    const batchDuration = ((batchEndTime - batchStartTime) / 1000).toFixed(2);
    const batchTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const avgRate = (existingProductsToUpdate.length / parseFloat(batchDuration)).toFixed(1);
    console.log(`[${batchTimestamp}] ✓ Updated ${existingProductsToUpdate.length} products in ${batchDuration}s (avg: ${avgRate} products/sec)`);

    const updateCompleteTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${updateCompleteTimestamp}] ✓ Product updates complete`);

    // Category syncing will be done in background - don't block upload response
    const updatedProducts = existingProductsToUpdate.map(p => ({
      gtin: p.gtin,
      parentCategory: p.parentCategory,
      subcategory: p.subcategory
    }));

    // Fire-and-forget: Sync categories in background
    if (updatedProducts.length > 0) {
      const syncStartTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
      console.log(`[${syncStartTimestamp}] 🔄 Starting background category sync for ${updatedProducts.length} products...`);

      // Run in background (don't await)
      syncCategoriesInBackground(context, updatedProducts).catch(err => {
        const errorTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.error(`[${errorTimestamp}] ❌ Background category sync failed:`, err.message);
      });
    }
  }

  // Update lastSeen for unchanged products
  if (unchangedProducts.length > 0) {
    const unchangedTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${unchangedTimestamp}] Updating lastSeen for ${unchangedProducts.length} unchanged products...`);
    const unchangedGtins = unchangedProducts.map(p => p.gtin);
    await context.entities.ProductCatalog.updateMany({
      where: { gtin: { in: unchangedGtins } },
      data: { lastSeen: new Date() }
    });
    const unchangedCompleteTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${unchangedCompleteTimestamp}] ✓ Updated lastSeen for ${unchangedProducts.length} products`);
  }

  const productTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${productTimestamp}] ✓ Stage 3 complete: ${newProducts.length} created, ${existingProductsToUpdate.length} updated, ${unchangedProducts.length} unchanged`);
  console.log(`[${productTimestamp}] Stage 4/4: Updating stock levels...`);

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

  if (skippedStockLevels.length > 0) {
    const skipTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.warn(`[${skipTimestamp}] ⚠️  Skipped ${skippedStockLevels.length} stock level(s) due to unmatched store locations`);
    // Log first few examples
    const examples = skippedStockLevels.slice(0, 5);
    examples.forEach(sl => {
      console.warn(`[${skipTimestamp}]   - Product: ${sl.productName} | Location: "${sl.location}" | Qty: ${sl.quantity}`);
    });
    if (skippedStockLevels.length > 5) {
      console.warn(`[${skipTimestamp}]   ... and ${skippedStockLevels.length - 5} more`);
    }
  }

  // Batch update stock levels - DELETE old + BULK INSERT new (fastest approach)
  if (stockLevelUpdates.length > 0) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`\n[${timestamp}] 🔄 UPDATING ${stockLevelUpdates.length} STOCK LEVELS...`);
    console.log(`[${timestamp}] Using DELETE + BULK INSERT strategy for maximum speed`);
    const startTime = Date.now();

    try {
      // Step 1: Get unique store IDs and product IDs from this upload
      const storeIds = [...new Set(stockLevelUpdates.map(s => s.storeId))];
      const productIds = [...new Set(stockLevelUpdates.map(s => s.productId))];

      console.log(`[${timestamp}] Step 1: Deleting existing stock levels for ${productIds.length} products across ${storeIds.length} stores...`);

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

      const deleteTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
      console.log(`[${deleteTimestamp}] Step 2: Deleted ${deleteResult.count} old records, now bulk inserting ${stockLevelUpdates.length} new records...`);

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

        if (totalInserted % 5000 === 0 || totalInserted === stockLevelUpdates.length) {
          const insertTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
          const percentage = ((totalInserted / stockLevelUpdates.length) * 100).toFixed(1);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[${insertTimestamp}] 📊 Inserted: ${totalInserted}/${stockLevelUpdates.length} (${percentage}%) - ${elapsed}s`);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const finalTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
      console.log(`[${finalTimestamp}] ✅ STOCK LEVELS COMPLETE: ${stockLevelUpdates.length} records in ${duration}s`);
      console.log(`[${finalTimestamp}] ⚡ Average: ${(stockLevelUpdates.length / parseFloat(duration)).toFixed(0)} records/second\n`);

    } catch (error) {
      const errorTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
      console.error(`[${errorTimestamp}] ❌ Error in bulk stock level update:`, error.message);
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
  const cacheTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${cacheTimestamp}] Stage 4/4: Invalidating caches...`);
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
  console.log(`[${cacheTimestamp}] ✓ Cache invalidation complete\n`);

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
      console.warn('Cache warming failed after export upload:', err.message)
    );
  }

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

export const uploadInventoryLogs = async ({ csvData }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const startTime = Date.now();
  const csvSize = new Blob([csvData]).size;
  const ts = () => new Date().toISOString().split('T')[1].split('.')[0];

  console.log(`\n[${ts()}] 📥 STARTING INVENTORY LOGS UPLOAD`);
  console.log(`[${ts()}] File size: ${(csvSize / 1024 / 1024).toFixed(2)}MB`);
  console.log(`[${ts()}] Stage 1/5: Parsing CSV...`);

  // Helper function to extract brand from product name
  const extractBrand = (productName) => {
    if (!productName) return null;
    const match = productName.match(/\(([^)]+)\)/);
    return match ? match[1].trim() : null;
  };

  // STAGE 1: Parse CSV (2-3 seconds)
  const movements = [];
  const readable = Readable.from(csvData.split('\n'));

  await new Promise((resolve, reject) => {
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

        if (data.Product && data.Location && data.Date) {
          let parsedDate;
          try {
            parsedDate = new Date(data.Date);
            if (isNaN(parsedDate.getTime())) parsedDate = new Date('2023-10-31');
          } catch (e) {
            parsedDate = new Date('2023-10-31');
          }

          movements.push({
            productName: data.Product.trim(),
            sku: data.SKU?.trim() || null,
            barcode: data.Barcode?.trim() || null,
            location: data.Location.trim(),
            brand: extractBrand(data.Product),
            date: parsedDate,
            type: data.Type?.trim() || 'Unknown',
            employee: data.Employee?.trim() || null,
            openingQty: parseInt(data.Opening) || 0,
            changeQty: parseInt(data.Change) || 0,
            closingQty: parseInt(data.Closing) || 0,
            notes: data.Notes?.trim() || null
          });
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`[${ts()}] ✓ Stage 1 complete: Parsed ${movements.length} movement records`);
  console.log(`[${ts()}] Stage 2/5: Bulk lookup stores and products...`);

  // STAGE 2: Bulk lookup stores and products (1-2 seconds)
  const userStores = await context.entities.Store.findMany({
    where: { userId: context.user.id }
  });

  if (userStores.length === 0) {
    throw new HttpError(400, 'No stores found. Please create a store first.');
  }

  // Create store lookup map
  const storeMap = new Map();
  userStores.forEach(s => {
    storeMap.set(s.name, s.id);
    if (s.reportName) storeMap.set(s.reportName, s.id);
  });

  // Bulk fetch all products by barcode
  const uniqueBarcodes = [...new Set(movements.map(m => m.barcode).filter(Boolean))];
  const products = await context.entities.ProductCatalog.findMany({
    where: { gtin: { in: uniqueBarcodes } }
  });

  const productMap = new Map();
  products.forEach(p => productMap.set(p.gtin, p));

  console.log(`[${ts()}] ✓ Stage 2 complete: Found ${userStores.length} stores, ${products.length} products`);
  console.log(`[${ts()}] Stage 3/5: Creating snapshot and preparing data...`);

  // Create inventory snapshot
  const snapshot = await context.entities.InventorySnapshot.create({
    data: {
      storeId: userStores[0].id,
      fileType: 'LOG',
      rawData: csvData
    }
  });

  // STAGE 3: Prepare movement data for bulk creation
  const movementsToCreate = [];
  const skippedRows = [];
  const unmatchedRecords = [];
  let newProductsNeeded = 0;

  for (const movement of movements) {
    const storeId = storeMap.get(movement.location);
    let product = productMap.get(movement.barcode);

    // Skip if no store found
    if (!storeId) {
      skippedRows.push({ row: movement.productName, reason: `Store not found: ${movement.location}` });
      unmatchedRecords.push({
        userId: context.user.id,
        recordType: 'LOG',
        productName: movement.productName,
        barcode: movement.barcode,
        sku: movement.sku,
        location: movement.location,
        brand: movement.brand,
        date: movement.date,
        changeQty: movement.changeQty,
        employee: movement.employee,
        reason: `Store not found: ${movement.location}`,
        rawData: JSON.stringify(movement)
      });
      continue;
    }

    // Skip if no barcode at all
    if (!movement.barcode) {
      skippedRows.push({ row: movement.productName, reason: 'Missing GTIN' });
      unmatchedRecords.push({
        userId: context.user.id,
        recordType: 'LOG',
        productName: movement.productName,
        barcode: movement.barcode,
        sku: movement.sku,
        location: movement.location,
        brand: movement.brand,
        date: movement.date,
        changeQty: movement.changeQty,
        employee: movement.employee,
        reason: 'Missing GTIN - cannot create or match product',
        rawData: JSON.stringify(movement)
      });
      continue;
    }

    // Track products that need to be created
    if (!product) {
      newProductsNeeded++;
      // We'll handle this later - for now skip
      skippedRows.push({ row: movement.productName, reason: 'Product not in catalog (upload inventory export first)' });
      continue;
    }

    movementsToCreate.push({
      storeId,
      productId: product.id,
      date: movement.date,
      type: movement.type,
      employee: movement.employee,
      openingQty: movement.openingQty,
      changeQty: movement.changeQty,
      closingQty: movement.closingQty,
      notes: movement.notes
    });
  }

  console.log(`[${ts()}] ✓ Stage 3 complete: ${movementsToCreate.length} movements ready, ${skippedRows.length} skipped`);
  if (newProductsNeeded > 0) {
    console.log(`[${ts()}] ⚠️  ${newProductsNeeded} movements skipped - products not in catalog (upload inventory export first)`);
  }
  console.log(`[${ts()}] Stage 4/5: Deduplicating and bulk creating movement records...`);

  // STAGE 4: Deduplicate and bulk create movements
  let totalCreated = 0;
  let totalDuplicates = 0;
  let uniqueMovements = []; // Declare outside if block for use in Stage 5

  if (movementsToCreate.length > 0) {
    // Calculate date range for deduplication check
    const dates = movementsToCreate.map(m => m.date);
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

    // Get store and product IDs from movements
    const storeIds = [...new Set(movementsToCreate.map(m => m.storeId))];
    const productIds = [...new Set(movementsToCreate.map(m => m.productId))];

    // Fetch existing movements in this date range to check for duplicates
    console.log(`[${ts()}] Checking for existing movements in date range ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}...`);
    const existingMovements = await context.entities.InventoryMovement.findMany({
      where: {
        storeId: { in: storeIds },
        productId: { in: productIds },
        date: { gte: minDate, lte: maxDate }
      },
      select: {
        storeId: true,
        productId: true,
        date: true,
        type: true,
        changeQty: true,
        openingQty: true,
        closingQty: true,
        employee: true
      }
    });

    // Create a Set of existing movement keys for fast lookup
    // Key format: storeId_productId_date_type_changeQty_openingQty_closingQty
    const existingKeys = new Set();
    existingMovements.forEach(m => {
      const dateStr = m.date.toISOString().split('T')[0]; // Normalize to date only (ignore time)
      const key = `${m.storeId}_${m.productId}_${dateStr}_${m.type}_${m.changeQty}_${m.openingQty}_${m.closingQty}_${m.employee || ''}`;
      existingKeys.add(key);
    });

    console.log(`[${ts()}] Found ${existingMovements.length} existing movements, checking for duplicates...`);

    // Filter out duplicates
    movementsToCreate.forEach(m => {
      const dateStr = m.date.toISOString().split('T')[0]; // Normalize to date only
      const key = `${m.storeId}_${m.productId}_${dateStr}_${m.type}_${m.changeQty}_${m.openingQty}_${m.closingQty}_${m.employee || ''}`;

      if (existingKeys.has(key)) {
        totalDuplicates++;
      } else {
        uniqueMovements.push(m);
        // Add to existing keys to prevent duplicates within the same upload
        existingKeys.add(key);
      }
    });

    if (totalDuplicates > 0) {
      console.log(`[${ts()}] ⚠️  Skipped ${totalDuplicates} duplicate movements (already exist in database)`);
    }

    // Bulk create only unique movements
    if (uniqueMovements.length > 0) {
      const chunkSize = 1000;
      for (let i = 0; i < uniqueMovements.length; i += chunkSize) {
        const chunk = uniqueMovements.slice(i, i + chunkSize);

        await context.entities.InventoryMovement.createMany({
          data: chunk,
          skipDuplicates: true // Extra safety - PostgreSQL will skip if somehow duplicates slip through
        });

        totalCreated += chunk.length;

        if (totalCreated % 5000 === 0 || totalCreated === uniqueMovements.length) {
          const percentage = ((totalCreated / uniqueMovements.length) * 100).toFixed(1);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[${ts()}] 📊 Created: ${totalCreated}/${uniqueMovements.length} (${percentage}%) - ${elapsed}s`);
        }
      }
    }
  }

  console.log(`[${ts()}] ✓ Stage 4 complete: ${totalCreated} new movements created, ${totalDuplicates} duplicates skipped`);

  // NOTE: Stock levels are NOT updated from logs. The inventory export is the
  // authoritative source for current stock. Logs only provide transaction history
  // for sales analytics (InventoryMovement records).

  // Save unmatched records for review
  if (unmatchedRecords.length > 0) {
    await context.entities.UnmatchedRecord.createMany({
      data: unmatchedRecords
    });
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n[${ts()}] ✅ INVENTORY LOGS UPLOAD COMPLETE!`);
  console.log(`[${ts()}] 📊 Total time: ${duration}s`);
  console.log(`[${ts()}] ✓ Movements created: ${totalCreated}`);
  if (totalDuplicates > 0) {
    console.log(`[${ts()}] ⚠️  Duplicates skipped: ${totalDuplicates}`);
  }
  console.log(`[${ts()}] ⚠️  Skipped: ${skippedRows.length}`);
  console.log(`[${ts()}] ⚡ Average: ${(totalCreated / parseFloat(duration)).toFixed(0)} records/second\n`);

  // Invalidate cache after inventory update
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
    where: { userId: context.user.id, isActive: true },
    select: { id: true }
  });
  if (stores.length > 0) {
    const storeIds = stores.map(s => s.id);
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 14 * 24 * 60 * 60 * 1000);
    warmOrderingAnalyticsCache(context, storeIds, startDate, endDate, false).catch(err =>
      console.warn('Cache warming failed after upload:', err.message)
    );
  }

  if (skippedRows.length > 0) {
    console.log(`[${ts()}] ⚠️  Top reasons for skipped rows:`);
    const reasons = {};
    skippedRows.forEach(skip => {
      reasons[skip.reason] = (reasons[skip.reason] || 0) + 1;
    });
    Object.entries(reasons).forEach(([reason, count]) => {
      console.log(`[${ts()}]    - ${reason}: ${count} rows`);
    });
    console.log('');
  }

  return {
    snapshot,
    movementsProcessed: totalCreated,
    totalMovements: movements.length,
    duplicatesSkipped: totalDuplicates,
    productsCreated: 0,
    skippedRows: skippedRows.length,
    errors: 0,
    skippedDetails: skippedRows.slice(0, 10),
    errorDetails: []
  };
};

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

export const updateStoreBranding = async ({ storeId, branding }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: storeId }
  });

  if (!store || store.userId !== context.user.id) {
    throw new HttpError(403);
  }

  const updatedStore = await context.entities.Store.update({
    where: { id: storeId },
    data: {
      logoUrl: branding.logoUrl,
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
      theme: branding.theme,
      fontFamily: branding.fontFamily
    }
  });

  return updatedStore;
};

export const generatePrintableMenu = async ({ storeId, options: _options = {} }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store || store.userId !== context.user.id) {
    throw new HttpError(403);
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

export const exportAnalyticsData = async ({ storeIds, filters }, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Get the filtered analytics data using the query logic
  const analyticsData = await context.entities.Store.findMany({
    where: {
      userId: context.user.id,
      ...(storeIds && storeIds.length > 0 ? { id: { in: storeIds.map(id => parseInt(id)) } } : {})
    },
    include: {
      stockLevels: {
        include: {
          product: true
        }
      }
    }
  });

  // Format data for CSV export
  const csvRows = [];
  csvRows.push(['Store', 'Product', 'GTIN', 'Brand', 'Category', 'Subcategory', 'Strain Type', 'Quantity', 'Retail Price', 'Total Value']);

  analyticsData.forEach(store => {
    store.stockLevels.forEach(stock => {
      const product = stock.product;

      // Apply filters if provided
      if (filters) {
        if (filters.categories && filters.categories.length > 0 && !filters.categories.includes(product.parentCategory)) {
          return;
        }
        if (filters.subcategories && filters.subcategories.length > 0 && !filters.subcategories.includes(product.subcategory)) {
          return;
        }
        if (filters.brands && filters.brands.length > 0 && !filters.brands.includes(product.brand)) {
          return;
        }
        if (filters.strainTypes && filters.strainTypes.length > 0 && !filters.strainTypes.includes(product.strainType)) {
          return;
        }
      }

      const totalValue = stock.quantity * (product.retailPrice || 0);
      csvRows.push([
        store.name,
        product.name,
        product.gtin,
        product.brand || '',
        product.parentCategory || '',
        product.subcategory || '',
        product.strainType || '',
        stock.quantity,
        product.retailPrice || 0,
        totalValue.toFixed(2)
      ]);
    });
  });

  // Convert to CSV string
  const csvContent = csvRows.map(row =>
    row.map(cell => {
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      const cellStr = String(cell);
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(',')
  ).join('\n');

  return {
    csv: csvContent,
    filename: `analytics-export-${new Date().toISOString().split('T')[0]}.csv`,
    rowCount: csvRows.length - 1 // Exclude header
  };
};

/**
 * Clear analytics-related caches to force fresh data on next query
 * This clears: rankings, sales totals, sparklines, and other computed metrics
 * Does NOT clear base product data or historical imports
 */
export const clearAnalyticsCache = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  console.log(`[CACHE] Clearing analytics caches for user ${context.user.id}`);

  // Clear all analytics-related caches
  const patterns = [
    'cache:base:rankings*',      // 14-day rankings data
    'cache:base:sales_totals*',  // Sales aggregations
    'cache:sparklines*',         // Trend sparklines
    'cache:recent_sales*',       // Recent sales movements
    'cache:older_sales*',        // Historical sales data
    'cache:brands_distributors*' // Brand/distributor lists
  ];

  let totalDeleted = 0;
  for (const pattern of patterns) {
    const deleted = await invalidateCachePattern(pattern);
    totalDeleted += deleted;
    console.log(`[CACHE] Cleared ${deleted} keys matching: ${pattern}`);
  }

  console.log(`[CACHE] Total analytics cache keys cleared: ${totalDeleted}`);

  return { success: true, keysCleared: totalDeleted };
};

export const toggleStoreActive = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store || store.userId !== context.user.id) {
    throw new HttpError(403);
  }

  const updatedStore = await context.entities.Store.update({
    where: { id: parseInt(storeId) },
    data: {
      isActive: !store.isActive,
      // If disabling, also unfavourite
      ...(store.isActive && { isFavourite: false })
    }
  });

  return updatedStore;
};

export const toggleStoreFavourite = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store || store.userId !== context.user.id) {
    throw new HttpError(403);
  }

  // Can only favourite active stores
  if (!store.isActive && !store.isFavourite) {
    throw new HttpError(400, 'Cannot favourite a disabled store');
  }

  const updatedStore = await context.entities.Store.update({
    where: { id: parseInt(storeId) },
    data: {
      isFavourite: !store.isFavourite
    }
  });

  return updatedStore;
};

export const toggleStorePrimary = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store || store.userId !== context.user.id) {
    throw new HttpError(403);
  }

  // Can only set primary on active stores
  if (!store.isActive && !store.isPrimary) {
    throw new HttpError(400, 'Cannot set a disabled store as primary');
  }

  // If setting as primary, unset all other stores for this user
  if (!store.isPrimary) {
    await context.entities.Store.updateMany({
      where: {
        userId: context.user.id,
        isPrimary: true
      },
      data: {
        isPrimary: false
      }
    });
  }

  const updatedStore = await context.entities.Store.update({
    where: { id: parseInt(storeId) },
    data: {
      isPrimary: !store.isPrimary
    }
  });

  return updatedStore;
};

// Ordering Actions

export const getOrCreateOrderWorksheet = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Find or create the user's current order worksheet
  let worksheet = await context.entities.OrderWorksheet.findFirst({
    where: { userId: context.user.id },
    include: {
      items: {
        include: {
          product: true
        }
      }
    },
    orderBy: { updatedAt: 'desc' }
  });

  if (!worksheet) {
    worksheet = await context.entities.OrderWorksheet.create({
      data: {
        userId: context.user.id,
        name: 'Current Order'
      },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });
  }

  return worksheet;
};

export const addToOrderWorksheet = async ({ productId, quantity, notes }, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Get or create worksheet
  let worksheet = await context.entities.OrderWorksheet.findFirst({
    where: { userId: context.user.id },
    orderBy: { updatedAt: 'desc' }
  });

  if (!worksheet) {
    worksheet = await context.entities.OrderWorksheet.create({
      data: {
        userId: context.user.id,
        name: 'Current Order'
      }
    });
  }

  // Add or update item
  const item = await context.entities.OrderWorksheetItem.upsert({
    where: {
      worksheetId_productId: {
        worksheetId: worksheet.id,
        productId: parseInt(productId)
      }
    },
    update: {
      quantity: parseInt(quantity),
      notes: notes || null,
      userQuantity: null // Reset user override when quantity changes
    },
    create: {
      worksheetId: worksheet.id,
      productId: parseInt(productId),
      quantity: parseInt(quantity),
      notes: notes || null
    },
    include: {
      product: true
    }
  });

  return item;
};

export const updateOrderWorksheetItem = async ({ itemId, userQuantity, notes }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const item = await context.entities.OrderWorksheetItem.findUnique({
    where: { id: parseInt(itemId) },
    include: {
      worksheet: true
    }
  });

  if (!item || item.worksheet.userId !== context.user.id) {
    throw new HttpError(403);
  }

  const updatedItem = await context.entities.OrderWorksheetItem.update({
    where: { id: parseInt(itemId) },
    data: {
      userQuantity: userQuantity ? parseInt(userQuantity) : null,
      notes: notes !== undefined ? notes : item.notes
    },
    include: {
      product: true
    }
  });

  return updatedItem;
};

export const removeFromOrderWorksheet = async ({ itemId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const item = await context.entities.OrderWorksheetItem.findUnique({
    where: { id: parseInt(itemId) },
    include: {
      worksheet: true
    }
  });

  if (!item || item.worksheet.userId !== context.user.id) {
    throw new HttpError(403);
  }

  await context.entities.OrderWorksheetItem.delete({
    where: { id: parseInt(itemId) }
  });

  return { success: true };
};

export const clearOrderWorksheet = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  const worksheet = await context.entities.OrderWorksheet.findFirst({
    where: { userId: context.user.id },
    orderBy: { updatedAt: 'desc' }
  });

  if (!worksheet) {
    return { success: true };
  }

  await context.entities.OrderWorksheetItem.deleteMany({
    where: { worksheetId: worksheet.id }
  });

  return { success: true };
};

export const exportOrderWorksheet = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  const worksheet = await context.entities.OrderWorksheet.findFirst({
    where: { userId: context.user.id },
    include: {
      items: {
        include: {
          product: true
        }
      }
    },
    orderBy: { updatedAt: 'desc' }
  });

  if (!worksheet || worksheet.items.length === 0) {
    throw new HttpError(400, 'No items in order worksheet');
  }

  // Group by brand
  const itemsByBrand = {};
  worksheet.items.forEach(item => {
    const brand = item.product.brand || 'Unknown';
    if (!itemsByBrand[brand]) {
      itemsByBrand[brand] = [];
    }
    itemsByBrand[brand].push(item);
  });

  // Generate CSV
  const csvRows = [];
  csvRows.push(['Brand', 'Product', 'GTIN', 'Suggested Qty', 'Order Qty', 'Case Size', 'Cases', 'Cost Each', 'Total Cost', 'Notes']);

  Object.keys(itemsByBrand).sort().forEach(brand => {
    itemsByBrand[brand].forEach(item => {
      const orderQty = item.userQuantity || item.quantity;
      const caseSize = item.product.caseSize || 12;
      const cases = Math.ceil(orderQty / caseSize);
      const costEach = item.product.wholesaleCost || 0;
      const totalCost = orderQty * costEach;

      csvRows.push([
        brand,
        item.product.name,
        item.product.gtin,
        item.quantity,
        orderQty,
        caseSize,
        cases,
        costEach.toFixed(2),
        totalCost.toFixed(2),
        item.notes || ''
      ]);
    });
  });

  // Convert to CSV string
  const csvContent = csvRows.map(row =>
    row.map(cell => {
      const cellStr = String(cell);
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(',')
  ).join('\n');

  return {
    csv: csvContent,
    filename: `order-${new Date().toISOString().split('T')[0]}.csv`,
    itemCount: worksheet.items.length
  };
};

export const markProductStatus = async ({ productId, status, salePrice }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const product = await context.entities.ProductCatalog.findUnique({
    where: { id: parseInt(productId) }
  });

  if (!product) {
    throw new HttpError(404, 'Product not found');
  }

  const updatedProduct = await context.entities.ProductCatalog.update({
    where: { id: parseInt(productId) },
    data: {
      status: status || product.status,
      salePrice: salePrice !== undefined ? salePrice : product.salePrice
    }
  });

  return updatedProduct;
};

export const enrichProductFormats = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  console.log('🔄 Starting format enrichment for all products...');

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
  console.log(`📦 Found ${products.length} products to process`);

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

    console.log(`Progress: ${Math.min(i + chunkSize, products.length)}/${products.length}`);
  }

  console.log(`✅ Format enrichment complete: ${updated} updated, ${skipped} skipped`);

  return {
    totalProducts: products.length,
    updated,
    skipped
  };
};

// Weekly Summary Backfill Action
// This populates summary tables with historical data

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function getTimeBucket(hour) {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

export const backfillWeeklySummaries = async ({ startDate, endDate }, context) => {
  if (!context.user) { throw new HttpError(401) }

  console.log('🔄 Starting weekly summary backfill...');
  console.log(`📅 Date range: ${startDate || 'earliest'} to ${endDate || 'now'}`);

  // Get earliest movement date if startDate not provided
  const earliest = await context.entities.InventoryMovement.findFirst({
    orderBy: { date: 'asc' },
    select: { date: true }
  });

  const start = startDate ? new Date(startDate) : (earliest?.date || new Date());
  const end = endDate ? new Date(endDate) : new Date();

  // Get all user's stores
  const stores = await context.entities.Store.findMany({
    where: { userId: context.user.id, isActive: true }
  });

  console.log(`🏪 Processing ${stores.length} store(s)`);

  let currentWeek = getMonday(start);
  let weeksProcessed = 0;

  while (currentWeek <= end) {
    const weekEnd = new Date(currentWeek);
    weekEnd.setDate(weekEnd.getDate() + 7);

    console.log(`📊 Processing week of ${currentWeek.toISOString().split('T')[0]}...`);

    for (const store of stores) {
      // Get all movements for this week and store
      const movements = await context.entities.InventoryMovement.findMany({
        where: {
          storeId: store.id,
          date: { gte: currentWeek, lt: weekEnd }
        },
        include: {
          product: {
            select: {
              id: true,
              parentCategory: true,
              brand: true,
              retailPrice: true
            }
          }
        }
      });

      if (movements.length === 0) {
        continue;
      }

      // Aggregate by product
      const productSummaries = new Map();
      const categorySummaries = new Map();
      const brandSummaries = new Map();

      movements.forEach(m => {
        const dayOfWeek = m.date.getDay();
        const hour = m.date.getHours();
        const timeBucket = getTimeBucket(hour);
        const units = Math.abs(m.changeQty);
        const revenue = units * (m.product.retailPrice || 0);

        // Product summaries
        const productKey = m.productId;
        if (!productSummaries.has(productKey)) {
          productSummaries.set(productKey, {
            productId: m.productId,
            grossSales: 0,
            refunds: 0,
            unitsSold: 0,
            refundUnits: 0,
            salesByDay: {},
            salesMorning: 0,
            salesAfternoon: 0,
            salesEvening: 0,
            salesNight: 0,
            unitsMorning: 0,
            unitsAfternoon: 0,
            unitsEvening: 0,
            unitsNight: 0
          });
        }

        const summary = productSummaries.get(productKey);

        if (m.type === 'sale') {
          summary.grossSales += revenue;
          summary.unitsSold += units;
          summary.salesByDay[dayOfWeek] = (summary.salesByDay[dayOfWeek] || 0) + revenue;
          summary[`sales${timeBucket.charAt(0).toUpperCase() + timeBucket.slice(1)}`] += revenue;
          summary[`units${timeBucket.charAt(0).toUpperCase() + timeBucket.slice(1)}`] += units;
        } else if (m.type === 'refund') {
          summary.refunds += revenue;
          summary.refundUnits += units;
        }

        // Category summaries
        const category = m.product.parentCategory || 'Uncategorized';
        if (!categorySummaries.has(category)) {
          categorySummaries.set(category, {
            grossSales: 0,
            refunds: 0,
            unitsSold: 0,
            productCount: new Set()
          });
        }
        const catSummary = categorySummaries.get(category);
        if (m.type === 'sale') {
          catSummary.grossSales += revenue;
          catSummary.unitsSold += units;
          catSummary.productCount.add(m.productId);
        } else if (m.type === 'refund') {
          catSummary.refunds += revenue;
        }

        // Brand summaries
        const brand = m.product.brand || 'Unknown';
        if (!brandSummaries.has(brand)) {
          brandSummaries.set(brand, {
            grossSales: 0,
            refunds: 0,
            unitsSold: 0
          });
        }
        const brandSummary = brandSummaries.get(brand);
        if (m.type === 'sale') {
          brandSummary.grossSales += revenue;
          brandSummary.unitsSold += units;
        } else if (m.type === 'refund') {
          brandSummary.refunds += revenue;
        }
      });

      // Insert product summaries
      for (const [productId, data] of productSummaries) {
        await context.entities.WeeklySalesSummary.upsert({
          where: {
            weekStart_storeId_productId: {
              weekStart: currentWeek,
              storeId: store.id,
              productId
            }
          },
          create: {
            weekStart: currentWeek,
            storeId: store.id,
            productId,
            grossSales: data.grossSales,
            refunds: data.refunds,
            netRevenue: data.grossSales - data.refunds,
            unitsSold: data.unitsSold,
            refundUnits: data.refundUnits,
            salesByDayOfWeek: data.salesByDay,
            salesMorning: data.salesMorning,
            salesAfternoon: data.salesAfternoon,
            salesEvening: data.salesEvening,
            salesNight: data.salesNight,
            unitsMorning: data.unitsMorning,
            unitsAfternoon: data.unitsAfternoon,
            unitsEvening: data.unitsEvening,
            unitsNight: data.unitsNight
          },
          update: {
            grossSales: data.grossSales,
            refunds: data.refunds,
            netRevenue: data.grossSales - data.refunds,
            unitsSold: data.unitsSold,
            refundUnits: data.refundUnits,
            salesByDayOfWeek: data.salesByDay,
            salesMorning: data.salesMorning,
            salesAfternoon: data.salesAfternoon,
            salesEvening: data.salesEvening,
            salesNight: data.salesNight,
            unitsMorning: data.unitsMorning,
            unitsAfternoon: data.unitsAfternoon,
            unitsEvening: data.unitsEvening,
            unitsNight: data.unitsNight
          }
        });
      }

      // Insert category summaries
      for (const [category, data] of categorySummaries) {
        await context.entities.WeeklyCategorySummary.upsert({
          where: {
            weekStart_storeId_category: {
              weekStart: currentWeek,
              storeId: store.id,
              category
            }
          },
          create: {
            weekStart: currentWeek,
            storeId: store.id,
            category,
            grossSales: data.grossSales,
            refunds: data.refunds,
            netRevenue: data.grossSales - data.refunds,
            unitsSold: data.unitsSold,
            productCount: data.productCount.size
          },
          update: {
            grossSales: data.grossSales,
            refunds: data.refunds,
            netRevenue: data.grossSales - data.refunds,
            unitsSold: data.unitsSold,
            productCount: data.productCount.size
          }
        });
      }

      // Insert brand summaries
      for (const [brand, data] of brandSummaries) {
        await context.entities.WeeklyBrandSummary.upsert({
          where: {
            weekStart_storeId_brand: {
              weekStart: currentWeek,
              storeId: store.id,
              brand
            }
          },
          create: {
            weekStart: currentWeek,
            storeId: store.id,
            brand,
            grossSales: data.grossSales,
            refunds: data.refunds,
            netRevenue: data.grossSales - data.refunds,
            unitsSold: data.unitsSold
          },
          update: {
            grossSales: data.grossSales,
            refunds: data.refunds,
            netRevenue: data.grossSales - data.refunds,
            unitsSold: data.unitsSold
          }
        });
      }
    }

    weeksProcessed++;
    currentWeek.setDate(currentWeek.getDate() + 7);
  }

  console.log(`✅ Backfill complete! Processed ${weeksProcessed} weeks for ${stores.length} stores`);

  // Invalidate cache after backfilling weekly summaries
  await invalidateCachePattern('cache:base:*');
  await invalidateCachePattern('cache:recent_sales:*');
  await invalidateCachePattern('cache:recent_sales_movements:*');
  await invalidateCachePattern('cache:older_sales:*');
  await invalidateCachePattern('cache:sparklines:*');
  await invalidateCachePattern('cache:rankings:*');
  await invalidateCachePattern('cache:sales_totals:*');
  await invalidateCachePattern('cache:products_paginated:*');

  return {
    success: true,
    weeksProcessed,
    storesProcessed: stores.length,
    startDate: start.toISOString(),
    endDate: end.toISOString()
  };
};

// Brand-Distributor Mapping Actions

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

export const seedDefaultClassifications = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  const classifications = [
    { name: 'Sativa', displayOrder: 1 },
    { name: 'Hybrid', displayOrder: 2 },
    { name: 'Indica', displayOrder: 3 },
    { name: 'Blend', displayOrder: 4 },
    { name: 'CBD', displayOrder: 5 }
  ]

  let created = 0
  for (const classification of classifications) {
    const existing = await context.entities.Classification.findUnique({
      where: { name: classification.name }
    })

    if (!existing) {
      await context.entities.Classification.create({ data: classification })
      created++
    }
  }

  return { created, total: classifications.length }
}

export const seedDefaultCategories = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  const categoriesData = [
    {
      name: 'Flower',
      displayOrder: 1,
      subcategories: [
        'Dried Flower',
        'Milled',
        'Infused Flower',
        'Infused Milled',
        'CBD/Balanced'
      ]
    },
    {
      name: 'Pre-rolls',
      displayOrder: 2,
      subcategories: [
        'Joints',
        'Blunts',
        'Infused Joints',
        'Infused Blunts',
        'Variety/Multipack',
        'Multipack Infused',
        'CBD/Balanced'
      ]
    },
    {
      name: 'Vapes',
      displayOrder: 3,
      subcategories: [
        'Cured Resin',
        'Disposable Vapes',
        '510 Thread Cartridges',
        'Pax Pods',
        'Closed Loop Pods',
        'Live Resin',
        'Live Rosin',
        'Variety/Multipacks'
      ]
    },
    {
      name: 'Edibles',
      displayOrder: 4,
      subcategories: [
        'Chocolates',
        'Snacks & Baked Goods',
        'Gummies',
        'Hard Candies',
        'Mints',
        'Live Resin Gummies',
        'Edible Extracts',
        'Condiments'
      ]
    },
    {
      name: 'Concentrates',
      displayOrder: 5,
      subcategories: [
        'Hash',
        'Syringe',
        'Shatter',
        'Rosin',
        'Wax',
        'Kief',
        'Resin',
        'Diamonds & Sauce',
        'Crumble',
        'Budder',
        'Cured Resin',
        'Isolate'
      ]
    },
    {
      name: 'Beverages',
      displayOrder: 6,
      subcategories: [
        'Coffees & Teas',
        'Soft Drinks',
        'Sparkling Waters',
        'Beverage Mixers',
        'THC Drinks',
        'THC & CBD Drinks',
        'CBD Drinks',
        'Minor Cannabinoid'
      ]
    },
    {
      name: 'Extracts',
      displayOrder: 7,
      subcategories: [
        'Oils',
        'Capsules',
        'Sublingual Strips',
        'Oral Spray'
      ]
    },
    {
      name: 'Topicals',
      displayOrder: 8,
      subcategories: [
        'Creams & Lotions',
        'Bath & Shower',
        'Transdermal Gels'
      ]
    },
    {
      name: 'Seeds',
      displayOrder: 9,
      subcategories: [
        'Autoflower',
        'Feminized',
        'Regular'
      ]
    },
    {
      name: 'Accessories',
      displayOrder: 10,
      subcategories: [
        'Dab Pens & Vaporizers',
        'Rolling Papers/Cones/& Filters',
        'Grinders',
        'Cleaning & Storage',
        'Vape Batteries',
        'Bongs',
        'Pipes',
        'Rigs',
        'Lighters',
        'Hemp Lighters'
      ]
    }
  ]

  let categoriesCreated = 0
  let subcategoriesCreated = 0

  for (const categoryData of categoriesData) {
    let category = await context.entities.CategoryDefinition.findFirst({
      where: { name: categoryData.name }
    })

    if (!category) {
      category = await context.entities.CategoryDefinition.create({
        data: {
          name: categoryData.name,
          displayOrder: categoryData.displayOrder
        }
      })
      categoriesCreated++
    }

    // Create subcategories
    for (let i = 0; i < categoryData.subcategories.length; i++) {
      const subcatName = categoryData.subcategories[i]
      const existing = await context.entities.CategorySubcategory.findFirst({
        where: {
          categoryId: category.id,
          name: subcatName
        }
      })

      if (!existing) {
        await context.entities.CategorySubcategory.create({
          data: {
            categoryId: category.id,
            name: subcatName,
            displayOrder: i + 1
          }
        })
        subcategoriesCreated++
      }
    }
  }

  return {
    categoriesCreated,
    subcategoriesCreated,
    totalCategories: categoriesData.length
  }
}

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

export const createClassification = async ({ name, displayOrder }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const existing = await context.entities.Classification.findUnique({
    where: { name }
  })

  if (existing) { throw new HttpError(400, 'Classification already exists') }

  return await context.entities.Classification.create({
    data: {
      name,
      displayOrder: displayOrder || 0
    }
  })
}

export const updateClassification = async ({ id, name, displayOrder, isActive }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const data = {}
  if (name !== undefined) data.name = name
  if (displayOrder !== undefined) data.displayOrder = displayOrder
  if (isActive !== undefined) data.isActive = isActive

  return await context.entities.Classification.update({
    where: { id },
    data
  })
}

export const deleteClassification = async ({ id }, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Soft delete
  return await context.entities.Classification.update({
    where: { id },
    data: { isActive: false }
  })
}

export const createCategoryDefinition = async ({ name, displayOrder }, context) => {
  if (!context.user) { throw new HttpError(401) }

  return await context.entities.CategoryDefinition.create({
    data: {
      name,
      displayOrder: displayOrder || 0
    }
  })
}

export const updateCategoryDefinition = async ({ id, name, displayOrder, isActive }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const data = {}
  if (name !== undefined) data.name = name
  if (displayOrder !== undefined) data.displayOrder = displayOrder
  if (isActive !== undefined) data.isActive = isActive

  return await context.entities.CategoryDefinition.update({
    where: { id },
    data
  })
}

export const deleteCategoryDefinition = async ({ id }, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Soft delete
  return await context.entities.CategoryDefinition.update({
    where: { id },
    data: { isActive: false }
  })
}

export const createSubcategory = async ({ categoryId, name, displayOrder }, context) => {
  if (!context.user) { throw new HttpError(401) }

  return await context.entities.CategorySubcategory.create({
    data: {
      categoryId,
      name,
      displayOrder: displayOrder || 0
    }
  })
}

export const updateSubcategory = async ({ id, name, displayOrder, isActive }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const data = {}
  if (name !== undefined) data.name = name
  if (displayOrder !== undefined) data.displayOrder = displayOrder
  if (isActive !== undefined) data.isActive = isActive

  return await context.entities.CategorySubcategory.update({
    where: { id },
    data
  })
}

export const deleteSubcategory = async ({ id }, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Soft delete
  return await context.entities.CategorySubcategory.update({
    where: { id },
    data: { isActive: false }
  })
}

export const syncProductCategoriesToDefinitions = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  console.log('🔄 Starting category sync...');

  // Get all category definitions for lookup (case-insensitive matching)
  const allCategoryDefs = await context.entities.CategoryDefinition.findMany({
    where: { isActive: true },
    include: {
      subcategories: {
        where: { isActive: true }
      }
    }
  });

  // Create lookup maps with normalization and aliases
  const categoryMap = new Map();
  const subcategoryMap = new Map();

  // Comprehensive category name normalization
  const normalizeCategoryName = (name) => {
    if (!name) return '';
    return name.toLowerCase().trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s-]/g, ''); // Remove special chars except hyphens and spaces
  };

  // Comprehensive CSV to CategoryDefinition mapping
  // Maps CSV category names (from inventory export) to CategoryDefinition names
  const csvCategoryMapping = {
    // Vape variations - all map to "Vapes"
    'vapable concentrate': 'vapes',
    'vape concentrate': 'vapes',
    'vapes': 'vapes',
    'vpt vaping accessories': 'accessories',

    // Pre-roll variations - all map to "Pre-rolls"
    'pre-roll': 'pre-rolls',
    'pre-rolls': 'pre-rolls',
    'preroll': 'pre-rolls',
    'prerolls': 'pre-rolls',

    // Extract/Oil variations
    'oils': 'extracts',
    'extracts': 'extracts',

    // Direct matches
    'accessories': 'accessories',
    'seeds': 'seeds',
    'topicals': 'topicals',
    'beverages': 'beverages',
    'edibles': 'edibles',
    'flower': 'flower',
    'concentrates': 'concentrates',
    'teas': 'beverages', // Teas are beverages
  };

  // Build category map with all variations
  allCategoryDefs.forEach(cat => {
    const normalizedName = normalizeCategoryName(cat.name);

    // Store direct match
    categoryMap.set(normalizedName, cat);

    // Store plural/singular variations
    if (normalizedName.endsWith('s')) {
      const singular = normalizedName.slice(0, -1);
      categoryMap.set(singular, cat);
    } else {
      const plural = normalizedName + 's';
      categoryMap.set(plural, cat);
    }

    // Store all CSV mappings that point to this category
    Object.entries(csvCategoryMapping).forEach(([csvName, defName]) => {
      if (normalizeCategoryName(defName) === normalizedName) {
        categoryMap.set(csvName, cat);
      }
    });

    cat.subcategories.forEach(sub => {
      const subKey = `${cat.id}:${normalizeCategoryName(sub.name)}`;
      subcategoryMap.set(subKey, sub);
    });
  });

  // Fuzzy matching function for categories
  const findBestCategoryMatch = (csvCategoryName) => {
    if (!csvCategoryName) return null;

    const normalized = normalizeCategoryName(csvCategoryName);

    // Step 1: Try exact match first
    if (categoryMap.has(normalized)) {
      return categoryMap.get(normalized);
    }

    // Step 2: Try the explicit mapping table
    if (csvCategoryMapping[normalized]) {
      const mappedName = normalizeCategoryName(csvCategoryMapping[normalized]);
      if (categoryMap.has(mappedName)) {
        return categoryMap.get(mappedName);
      }
    }

    // Step 3: Try removing spaces for matching (e.g., "pre-roll" vs "pre roll")
    const noSpaces = normalized.replace(/\s+/g, '');
    if (categoryMap.has(noSpaces)) {
      return categoryMap.get(noSpaces);
    }

    // Step 4: Try fuzzy matching - check if any category name contains the CSV name or vice versa
    for (const [key, category] of categoryMap.entries()) {
      const keyNoSpaces = key.replace(/\s+/g, '');
      const normalizedNoSpaces = normalized.replace(/\s+/g, '');

      // Check if one contains the other (case-insensitive substring match)
      if (normalizedNoSpaces.includes(keyNoSpaces) || keyNoSpaces.includes(normalizedNoSpaces)) {
        // Only match if similarity is reasonable (at least 50% of the shorter string)
        const shorter = Math.min(normalizedNoSpaces.length, keyNoSpaces.length);
        const longer = Math.max(normalizedNoSpaces.length, keyNoSpaces.length);
        if (shorter >= longer * 0.5) {
          return category;
        }
      }
    }

    return null;
  };

  console.log(`📊 Found ${allCategoryDefs.length} category definitions with ${subcategoryMap.size} subcategories`);
  console.log(`📋 Category definitions:`, allCategoryDefs.map(c => c.name).join(', '));
  console.log(`🗺️  Category map size: ${categoryMap.size}`);
  console.log(`🔍 Sample category map keys:`, Array.from(categoryMap.keys()).slice(0, 10).join(', '));

  const products = await context.entities.ProductCatalog.findMany({
    where: {
      OR: [
        { categoryDefinitionId: null },
        { subcategoryId: null }
      ],
      parentCategory: { not: null }
    },
    select: {
      id: true,
      name: true,
      parentCategory: true,
      subcategory: true
    }
  });

  console.log(`📦 Found ${products.length} products to sync`);

  let synced = 0;
  let categoryMatched = 0;
  let categoryNotFound = 0;
  let subcategoryMatched = 0;
  let subcategoryNotFound = 0;

  // Collect unique category names for debugging
  const uniqueCategories = new Set();

  for (const product of products) {
    if (product.parentCategory) {
      uniqueCategories.add(product.parentCategory);
      // Use fuzzy matching
      const categoryDef = findBestCategoryMatch(product.parentCategory);

      // Debug first few matches
      if (categoryNotFound < 5) {
        const normalized = normalizeCategoryName(product.parentCategory);
        console.log(`🔍 Trying to match: "${product.parentCategory}" -> normalized: "${normalized}"`);
        console.log(`   Found match: ${categoryDef ? categoryDef.name : 'NO MATCH'}`);
      }

      if (categoryDef) {
        const updateData = { categoryDefinitionId: categoryDef.id };
        categoryMatched++;

        if (product.subcategory) {
          // Normalize subcategory name for matching
          const normalizedSubcategory = normalizeCategoryName(product.subcategory);
          const subKey = `${categoryDef.id}:${normalizedSubcategory}`;
          const subcategoryDef = subcategoryMap.get(subKey);

          if (subcategoryDef) {
            updateData.subcategoryId = subcategoryDef.id;
            subcategoryMatched++;
          } else {
            subcategoryNotFound++;
            console.log(`  ⚠️ Subcategory not found: "${product.subcategory}" for category "${categoryDef.name}" (product: ${product.name})`);
          }
        }

        await context.entities.ProductCatalog.update({
          where: { id: product.id },
          data: updateData
        });
        synced++;
      } else {
        categoryNotFound++;
        console.log(`  ⚠️ Category not found: "${product.parentCategory}" (product: ${product.name})`);
      }
    }
  }

  console.log(`✅ Category sync complete:`);
  console.log(`   - Categories matched: ${categoryMatched}`);
  console.log(`   - Categories not found: ${categoryNotFound}`);
  console.log(`   - Subcategories matched: ${subcategoryMatched}`);
  console.log(`   - Subcategories not found: ${subcategoryNotFound}`);
  console.log(`   - Total synced: ${synced}/${products.length}`);
  console.log(`📊 Unique categories in products:`, Array.from(uniqueCategories).slice(0, 20).join(', '));

  return {
    synced,
    total: products.length,
    categoryMatched,
    categoryNotFound,
    subcategoryMatched,
    subcategoryNotFound
  };
}

export const syncProductClassifications = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  console.log('🔄 Starting classification sync for all products...')

  // Get all classifications for lookup
  const classifications = await context.entities.Classification.findMany({
    where: { isActive: true }
  })
  const classificationMap = new Map()
  classifications.forEach(c => {
    classificationMap.set(c.name.toLowerCase(), c.id)
  })

  // Get all products with strainType but no classificationId
  const products = await context.entities.ProductCatalog.findMany({
    where: {
      OR: [
        { classificationId: null, strainType: { not: null } },
        { classificationId: null, strainType: { not: 'N/A' } }
      ]
    },
    select: {
      id: true,
      strainType: true
    }
  })

  console.log(`📦 Found ${products.length} products to sync`)

  let synced = 0
  let skipped = 0

  // Process in chunks
  const chunkSize = 100
  for (let i = 0; i < products.length; i += chunkSize) {
    const chunk = products.slice(i, i + chunkSize)

    await Promise.all(chunk.map(async (product) => {
      if (product.strainType && product.strainType !== 'N/A') {
        const classificationId = classificationMap.get(product.strainType.toLowerCase())

        if (classificationId) {
          await context.entities.ProductCatalog.update({
            where: { id: product.id },
            data: { classificationId }
          })
          synced++
        } else {
          skipped++
        }
      } else {
        skipped++
      }
    }))

    console.log(`Progress: ${Math.min(i + chunkSize, products.length)}/${products.length}`)
  }

  console.log(`✅ Classification sync complete: ${synced} synced, ${skipped} skipped`)

  return {
    totalProducts: products.length,
    synced,
    skipped
  }
}

export const syncAllProductEnrichments = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }

  console.log('🔄 Starting comprehensive product enrichment sync...')

  // Sync classifications
  const classificationResult = await syncProductClassifications(args, context)

  // Sync categories
  const categoryResult = await syncProductCategoriesToDefinitions(args, context)

  console.log('\n📊 Enrichment Sync Summary:');
  console.log(`   Classifications: ${classificationResult.synced} synced`);
  console.log(`   Categories: ${categoryResult.synced} synced (${categoryResult.categoryMatched} matched, ${categoryResult.categoryNotFound} not found)`);
  console.log(`   Subcategories: ${categoryResult.subcategoryMatched} matched, ${categoryResult.subcategoryNotFound} not found`);
  console.log(`   Total: ${classificationResult.synced + categoryResult.synced} products updated\n`);

  return {
    classifications: classificationResult,
    categories: categoryResult,
    totalSynced: classificationResult.synced + categoryResult.synced
  }
}

export const configureS3CORS = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  console.log('🔧 Configuring CORS on S3 bucket...')

  try {
    await configureBucketCORS()
    return { success: true, message: 'CORS configured successfully' }
  } catch (error) {
    console.error('❌ Failed to configure CORS:', error.message)
    throw new HttpError(500, `Failed to configure CORS: ${error.message}`)
  }
}

export const migrateProductImages = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }

  console.log('🖼️ Starting product image migration...')

  const batchSize = args?.batchSize || 10

  try {
    const results = await migrateAllProductImages(context, batchSize)

    console.log(`✅ Image migration complete: ${results.migrated.length} migrated, ${results.failed.length} failed, ${results.skipped.length} skipped`)

    return {
      migrated: results.migrated.length,
      failed: results.failed.length,
      skipped: results.skipped.length,
      total: results.total,
      details: {
        migrated: results.migrated.slice(0, 10), // Return first 10 for preview
        failed: results.failed.slice(0, 10),
      }
    }
  } catch (error) {
    console.error('❌ Image migration error:', error)
    throw new HttpError(500, `Image migration failed: ${error.message}`)
  }
}

export const checkS3Storage = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  try {
    const { listS3Objects } = await import('./services/imageMigration.js')
    const result = await listS3Objects('productimages/', 1000)

    return {
      objectCount: result.count,
      sampleObjects: result.objects.slice(0, 20).map(obj => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified
      })),
      isTruncated: result.isTruncated,
      message: `Found ${result.count} objects in S3 bucket${result.isTruncated ? ' (showing first 1000)' : ''}`
    }
  } catch (error) {
    console.error('❌ Error checking S3 storage:', error.message)
    throw new HttpError(500, `Failed to check S3 storage: ${error.message}`)
  }
}

export const checkImageMigrationStatus = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  try {
    const stats = await context.entities.ProductCatalog.groupBy({
      by: ['imageMigrationStatus'],
      _count: { id: true }
    })

    const totalWithImages = await context.entities.ProductCatalog.count({
      where: { imageUrl: { not: null } }
    })

    const migrated = await context.entities.ProductCatalog.count({
      where: { imageMigrationStatus: 'MIGRATED' }
    })

    const withS3Paths = await context.entities.ProductCatalog.count({
      where: {
        OR: [
          { imageStoragePath: { not: null } },
          { imageThumbnailPath: { not: null } }
        ]
      }
    })

    return {
      totalWithImages,
      migrated,
      withS3Paths,
      statusBreakdown: stats.reduce((acc, stat) => {
        acc[stat.imageMigrationStatus || 'NULL'] = stat._count.id
        return acc
      }, {}),
      message: `${migrated} products migrated, ${withS3Paths} have S3 paths stored`
    }
  } catch (error) {
    console.error('❌ Error checking migration status:', error.message)
    throw new HttpError(500, `Failed to check migration status: ${error.message}`)
  }
}

/**
 * Cleanup action to delete all data for October and November 2025
 * This allows re-uploading those files with proper deduplication
 */
export const cleanupOctoberNovember2025 = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  const startTime = Date.now();
  const ts = () => new Date().toISOString().split('T')[1].split('.')[0];

  console.log(`\n[${ts()}] 🧹 STARTING CLEANUP: October & November 2025`);

  try {
    // Date range: October 1, 2025 to November 30, 2025
    const startDate = new Date('2025-10-01T00:00:00.000Z');
    const endDate = new Date('2025-11-30T23:59:59.999Z');

    // Calculate week boundaries for summary tables
    // Week start is Monday, so we need to include weeks that overlap with Oct-Nov
    // Oct 1, 2025 is a Wednesday, so the week starts Sept 29, 2025
    // Nov 30, 2025 is a Sunday, so the week ends Dec 1, 2025
    const weekStartDate = new Date('2025-09-29T00:00:00.000Z'); // Monday before Oct 1
    const weekEndDate = new Date('2025-12-02T00:00:00.000Z'); // Monday after Nov 30

    console.log(`[${ts()}] Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    console.log(`[${ts()}] Week range: ${weekStartDate.toISOString().split('T')[0]} to ${weekEndDate.toISOString().split('T')[0]}`);

    // Get user's store IDs
    const userStores = await context.entities.Store.findMany({
      where: { userId: context.user.id },
      select: { id: true }
    });

    if (userStores.length === 0) {
      throw new HttpError(400, 'No stores found for user');
    }

    const storeIds = userStores.map(s => s.id);
    console.log(`[${ts()}] Processing ${storeIds.length} stores...`);

    // 1. Delete InventoryMovement records
    console.log(`[${ts()}] Step 1/5: Deleting InventoryMovement records...`);
    const movementDeleteResult = await context.entities.InventoryMovement.deleteMany({
      where: {
        storeId: { in: storeIds },
        date: { gte: startDate, lte: endDate }
      }
    });
    console.log(`[${ts()}] ✓ Deleted ${movementDeleteResult.count} InventoryMovement records`);

    // 2. Delete WeeklySalesSummary records
    console.log(`[${ts()}] Step 2/5: Deleting WeeklySalesSummary records...`);
    const weeklySalesDeleteResult = await context.entities.WeeklySalesSummary.deleteMany({
      where: {
        storeId: { in: storeIds },
        weekStart: { gte: weekStartDate, lt: weekEndDate }
      }
    });
    console.log(`[${ts()}] ✓ Deleted ${weeklySalesDeleteResult.count} WeeklySalesSummary records`);

    // 3. Delete WeeklyCategorySummary records
    console.log(`[${ts()}] Step 3/5: Deleting WeeklyCategorySummary records...`);
    const weeklyCategoryDeleteResult = await context.entities.WeeklyCategorySummary.deleteMany({
      where: {
        storeId: { in: storeIds },
        weekStart: { gte: weekStartDate, lt: weekEndDate }
      }
    });
    console.log(`[${ts()}] ✓ Deleted ${weeklyCategoryDeleteResult.count} WeeklyCategorySummary records`);

    // 4. Delete WeeklyBrandSummary records
    console.log(`[${ts()}] Step 4/5: Deleting WeeklyBrandSummary records...`);
    const weeklyBrandDeleteResult = await context.entities.WeeklyBrandSummary.deleteMany({
      where: {
        storeId: { in: storeIds },
        weekStart: { gte: weekStartDate, lt: weekEndDate }
      }
    });
    console.log(`[${ts()}] ✓ Deleted ${weeklyBrandDeleteResult.count} WeeklyBrandSummary records`);

    // 5. Delete InventorySnapshot records from that period (optional but helpful)
    console.log(`[${ts()}] Step 5/5: Deleting InventorySnapshot records...`);
    const snapshotDeleteResult = await context.entities.InventorySnapshot.deleteMany({
      where: {
        storeId: { in: storeIds },
        uploadedAt: { gte: startDate, lte: endDate }
      }
    });
    console.log(`[${ts()}] ✓ Deleted ${snapshotDeleteResult.count} InventorySnapshot records`);

    // Invalidate all caches
    console.log(`[${ts()}] Invalidating caches...`);
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

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n[${ts()}] ✅ CLEANUP COMPLETE!`);
    console.log(`[${ts()}] 📊 Total time: ${duration}s`);
    console.log(`[${ts()}] Summary:`);
    console.log(`[${ts()}]   - InventoryMovements: ${movementDeleteResult.count}`);
    console.log(`[${ts()}]   - WeeklySalesSummary: ${weeklySalesDeleteResult.count}`);
    console.log(`[${ts()}]   - WeeklyCategorySummary: ${weeklyCategoryDeleteResult.count}`);
    console.log(`[${ts()}]   - WeeklyBrandSummary: ${weeklyBrandDeleteResult.count}`);
    console.log(`[${ts()}]   - InventorySnapshots: ${snapshotDeleteResult.count}\n`);

    return {
      success: true,
      deleted: {
        movements: movementDeleteResult.count,
        weeklySales: weeklySalesDeleteResult.count,
        weeklyCategories: weeklyCategoryDeleteResult.count,
        weeklyBrands: weeklyBrandDeleteResult.count,
        snapshots: snapshotDeleteResult.count
      },
      dateRange: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      },
      duration: parseFloat(duration),
      message: `Successfully deleted ${movementDeleteResult.count} movements and related summary data for October-November 2025`
    };

  } catch (error) {
    console.error(`[${ts()}] ❌ Cleanup failed:`, error.message);
    throw new HttpError(500, `Cleanup failed: ${error.message}`);
  }
}

export const deleteInventoryMovementsByDateRange = async ({ startDate, endDate, storeIds = null, preview = false }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const ts = () => new Date().toISOString().split('T')[1].split('.')[0];

  try {
    // Parse dates as Central Time (UTC-6)
    // When user selects "2025-11-01", they mean Nov 1 midnight Central Time
    // which is Nov 1 at 06:00:00 UTC
    const [yearStart, monthStart, dayStart] = startDate.split('-').map(Number);
    const start = new Date(Date.UTC(yearStart, monthStart - 1, dayStart, 6, 0, 0, 0));

    // End date should be 23:59:59.999 Central Time of selected day
    // Nov 30 23:59:59 Central = Dec 1 05:59:59 UTC
    const [yearEnd, monthEnd, dayEnd] = endDate.split('-').map(Number);
    const end = new Date(Date.UTC(yearEnd, monthEnd - 1, dayEnd + 1, 5, 59, 59, 999));

    console.log(`\n[${ts()}] 🗑️  ${preview ? 'PREVIEW' : 'DELETE'} Inventory Movements`);
    console.log(`[${ts()}] Date range: ${start.toISOString()} to ${end.toISOString()}`);

    // Build store filter
    let targetStoreIds;
    if (storeIds && storeIds.length > 0) {
      targetStoreIds = storeIds.map(id => parseInt(id));
      console.log(`[${ts()}] Stores: ${targetStoreIds.join(', ')}`);
    } else {
      // Get all user's stores
      const userStores = await context.entities.Store.findMany({
        where: { userId: context.user.id },
        select: { id: true, name: true }
      });

      if (userStores.length === 0) {
        throw new HttpError(400, 'No stores found for user');
      }

      targetStoreIds = userStores.map(s => s.id);
      console.log(`[${ts()}] Stores: All (${targetStoreIds.length} stores)`);
    }

    // Build where clause
    const whereClause = {
      storeId: { in: targetStoreIds },
      date: { gte: start, lte: end }
    };

    if (preview) {
      // Preview mode: just count the records
      const count = await context.entities.InventoryMovement.count({
        where: whereClause
      });

      console.log(`[${ts()}] Preview: ${count} movements would be deleted`);

      return {
        success: true,
        preview: true,
        count,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString()
        },
        stores: targetStoreIds.length
      };
    }

    // Delete mode: actually delete the records
    const startTime = Date.now();

    console.log(`[${ts()}] Deleting InventoryMovement records...`);
    const deleteResult = await context.entities.InventoryMovement.deleteMany({
      where: whereClause
    });

    console.log(`[${ts()}] ✓ Deleted ${deleteResult.count} InventoryMovement records`);

    // Invalidate all caches
    console.log(`[${ts()}] Invalidating caches...`);
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

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[${ts()}] ✅ Deletion complete in ${duration}s\n`);

    return {
      success: true,
      preview: false,
      deletedCount: deleteResult.count,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString()
      },
      stores: targetStoreIds.length,
      duration: parseFloat(duration)
    };

  } catch (error) {
    console.error(`[${ts()}] ❌ Delete failed:`, error.message);
    throw new HttpError(500, `Failed to delete inventory movements: ${error.message}`);
  }
}

// ============================================================================
// PRODUCT ACTIONS - Task/Flag Management
// ============================================================================

export const createProductAction = async ({ productId, actionType, notes, metadata }, context) => {
  if (!context.user) throw new HttpError(401);

  try {
    const action = await context.entities.ProductAction.create({
      data: {
        productId: parseInt(productId),
        userId: context.user.id,
        actionType,
        notes: notes || null,
        metadata: metadata || null,
        status: 'ACTIVE'
      },
      include: {
        product: {
          select: { id: true, name: true, brand: true, gtin: true }
        }
      }
    });

    console.log(`✅ Created ${actionType} action for product ${productId}`);
    return action;
  } catch (error) {
    throw new HttpError(500, `Failed to create product action: ${error.message}`);
  }
};

export const updateProductAction = async ({ actionId, notes, metadata }, context) => {
  if (!context.user) throw new HttpError(401);

  try {
    const action = await context.entities.ProductAction.update({
      where: { id: parseInt(actionId) },
      data: {
        notes: notes !== undefined ? notes : undefined,
        metadata: metadata !== undefined ? metadata : undefined
      },
      include: {
        product: {
          select: { id: true, name: true, brand: true }
        }
      }
    });

    return action;
  } catch (error) {
    throw new HttpError(500, `Failed to update product action: ${error.message}`);
  }
};

export const completeProductAction = async ({ actionId }, context) => {
  if (!context.user) throw new HttpError(401);

  try {
    const action = await context.entities.ProductAction.update({
      where: { id: parseInt(actionId) },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      }
    });

    console.log(`✅ Completed action ${actionId}`);
    return action;
  } catch (error) {
    throw new HttpError(500, `Failed to complete product action: ${error.message}`);
  }
};

export const reactivateProductAction = async ({ actionId }, context) => {
  if (!context.user) throw new HttpError(401);

  try {
    const action = await context.entities.ProductAction.update({
      where: { id: parseInt(actionId) },
      data: {
        status: 'ACTIVE',
        completedAt: null
      }
    });

    console.log(`🔄 Reactivated action ${actionId}`);
    return action;
  } catch (error) {
    throw new HttpError(500, `Failed to reactivate product action: ${error.message}`);
  }
};

export const deleteProductAction = async ({ actionId }, context) => {
  if (!context.user) throw new HttpError(401);

  try {
    await context.entities.ProductAction.delete({
      where: { id: parseInt(actionId) }
    });

    return { success: true };
  } catch (error) {
    throw new HttpError(500, `Failed to delete product action: ${error.message}`);
  }
};

export const exportProductActions = async ({ status = 'ACTIVE', actionType }, context) => {
  if (!context.user) throw new HttpError(401);

  try {
    const whereClause = {
      userId: context.user.id,
      status: status || undefined
    };

    if (actionType) {
      whereClause.actionType = actionType;
    }

    const actions = await context.entities.ProductAction.findMany({
      where: whereClause,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            brand: true,
            gtin: true,
            parentCategory: true,
            subcategory: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Convert to CSV format
    const headers = [
      'Product Name',
      'Brand',
      'GTIN',
      'Category',
      'Subcategory',
      'Action Type',
      'Status',
      'Notes',
      'Created Date',
      'Completed Date'
    ];

    const rows = actions.map(a => [
      a.product.name,
      a.product.brand || '',
      a.product.gtin,
      a.product.parentCategory || '',
      a.product.subcategory || '',
      a.actionType,
      a.status,
      a.notes || '',
      new Date(a.createdAt).toLocaleDateString('en-US', { timeZone: 'America/Chicago' }),
      a.completedAt ? new Date(a.completedAt).toLocaleDateString('en-US', { timeZone: 'America/Chicago' }) : ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return { csvContent, count: actions.length };
  } catch (error) {
    throw new HttpError(500, `Failed to export product actions: ${error.message}`);
  }
};

// ============================================================================
// POS Account Management
// ============================================================================

import { encrypt, decrypt } from './server/encryption.js';

/**
 * Create a new POS account with encrypted credentials
 */
export const createPOSAccount = async ({ name, posType, username, password, loginUrl }, context) => {
  if (!context.user) { throw new HttpError(401); }

  try {
    const encryptedUsername = encrypt(username);
    const encryptedPassword = encrypt(password);

    const account = await context.entities.POSAccount.create({
      data: {
        userId: context.user.id,
        name,
        posType,
        username: encryptedUsername,
        password: encryptedPassword,
        loginUrl: loginUrl || null
      }
    });

    console.log(`✅ Created POS account: ${name} (${posType})`);
    return { id: account.id, name: account.name, posType: account.posType };
  } catch (error) {
    console.error('Failed to create POS account:', error);
    throw new HttpError(500, `Failed to create POS account: ${error.message}`);
  }
};

/**
 * Update an existing POS account
 */
export const updatePOSAccount = async ({ id, name, posType, username, password, loginUrl }, context) => {
  if (!context.user) { throw new HttpError(401); }

  const account = await context.entities.POSAccount.findUnique({
    where: { id }
  });

  if (!account || account.userId !== context.user.id) {
    throw new HttpError(403, 'Not authorized to update this account');
  }

  const updateData = {
    name,
    posType,
    loginUrl: loginUrl || null
  };

  // Only encrypt and update credentials if provided
  if (username) {
    updateData.username = encrypt(username);
  }
  if (password) {
    updateData.password = encrypt(password);
  }

  await context.entities.POSAccount.update({
    where: { id },
    data: updateData
  });

  console.log(`✅ Updated POS account: ${name}`);
  return { success: true };
};

/**
 * Delete a POS account
 */
export const deletePOSAccount = async ({ id }, context) => {
  if (!context.user) { throw new HttpError(401); }

  const account = await context.entities.POSAccount.findUnique({
    where: { id }
  });

  if (!account || account.userId !== context.user.id) {
    throw new HttpError(403, 'Not authorized to delete this account');
  }

  await context.entities.POSAccount.delete({
    where: { id }
  });

  console.log(`✅ Deleted POS account: ${account.name}`);
  return { success: true };
};

/**
 * Link a store to a POS account
 */
export const linkStoreToPOSAccount = async ({ storeId, posAccountId, externalStoreId }, context) => {
  if (!context.user) { throw new HttpError(401); }

  const store = await context.entities.Store.findUnique({
    where: { id: storeId }
  });

  if (!store || store.userId !== context.user.id) {
    throw new HttpError(403, 'Not authorized to update this store');
  }

  const account = await context.entities.POSAccount.findUnique({
    where: { id: posAccountId }
  });

  if (!account || account.userId !== context.user.id) {
    throw new HttpError(403, 'Not authorized to use this POS account');
  }

  await context.entities.Store.update({
    where: { id: storeId },
    data: {
      posAccountId,
      externalStoreId: externalStoreId || null
    }
  });

  console.log(`✅ Linked store ${store.name} to POS account ${account.name}`);
  return { success: true };
};
