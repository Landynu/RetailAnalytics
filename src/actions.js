import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { HttpError } from 'wasp/server';

export const uploadInventory = async ({ storeId, csvData, autoCreateStores = false }, context) => {
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

export const uploadInventoryExport = async ({ csvData, autoCreateStores = true }, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Log file size for monitoring (no limit enforcement)
  const csvSize = new Blob([csvData]).size;
  console.log(`Processing inventory export CSV: ${(csvSize / 1024 / 1024).toFixed(2)}MB`);

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
        imageUrl: truncateField(p.imageUrl, 500)
      }));
      
      try {
        await context.entities.ProductCatalog.createMany({
          data: chunk,
          skipDuplicates: true // PostgreSQL supports this
        });
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

  // Batch update existing products - PostgreSQL handles this well
  if (existingProductsToUpdate.length > 0) {
    const chunkSize = 500; // Increased from 50 for PostgreSQL
    for (let i = 0; i < existingProductsToUpdate.length; i += chunkSize) {
      const chunk = existingProductsToUpdate.slice(i, i + chunkSize);
      await Promise.all(chunk.map(product => 
        context.entities.ProductCatalog.update({
          where: { gtin: product.gtin },
          data: {
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
            description: truncateField(product.description, 1000),
            imageUrl: truncateField(product.imageUrl, 500),
            lastSeen: new Date()
          }
        })
      ));
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
        }
      }
    }
  }

  // Batch upsert stock levels - SEQUENTIAL processing to avoid connection pool exhaustion
  if (stockLevelUpdates.length > 0) {
    const chunkSize = 100; // Smaller chunks for better connection management
    console.log(`Upserting ${stockLevelUpdates.length} stock levels in chunks of ${chunkSize}...`);
    
    for (let i = 0; i < stockLevelUpdates.length; i += chunkSize) {
      const chunk = stockLevelUpdates.slice(i, i + chunkSize);
      
      // Process chunk SEQUENTIALLY to avoid overwhelming connection pool
      try {
        for (const stock of chunk) {
          await context.entities.StockLevel.upsert({
            where: {
              storeId_productId: {
                storeId: stock.storeId,
                productId: stock.productId
              }
            },
            update: {
              quantity: stock.quantity,
              lastUpdated: new Date(),
              snapshotId: stock.snapshotId
            },
            create: {
              storeId: stock.storeId,
              productId: stock.productId,
              quantity: stock.quantity,
              snapshotId: stock.snapshotId
            }
          });
        }
        console.log(`Stock levels: ${i + chunk.length}/${stockLevelUpdates.length} completed`);
      } catch (error) {
        console.error(`Error in stock level chunk ${Math.floor(i / chunkSize) + 1}:`, error.message);
        // Continue processing remaining chunks even if one fails
        console.log('Continuing with next chunk...');
      }
    }
  }

  const results = {
    newProducts: newProducts.length,
    updatedProducts: existingProductsToUpdate.length,
    unchangedProducts: unchangedProducts.length,
    totalProcessed: products.length
  };

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

  // Log file size for monitoring (no limit enforcement)
  const csvSize = new Blob([csvData]).size;
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 STARTING INVENTORY LOGS UPLOAD');
  console.log(`📁 File size: ${(csvSize / 1024 / 1024).toFixed(2)}MB`);
  console.log('═══════════════════════════════════════════════════════');

  // Helper function to extract brand from product name (text in parentheses)
  const extractBrand = (productName) => {
    if (!productName) return null;
    
    const match = productName.match(/\(([^)]+)\)/);
    return match ? match[1].trim() : null;
  };

  // No longer normalizing location names - using reportName/friendlyName instead

  // Set a timeout for large file processing (5 minutes)
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Processing timeout: File is too large or complex. Please try splitting your CSV into smaller files.'));
    }, 5 * 60 * 1000); // 5 minutes
  });

  const movements = [];
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
        
        if (data.Product && data.Location && data.Date) {
          const changeQty = parseInt(data.Change) || 0;
          const unitsSold = Math.abs(changeQty); // Absolute value for units sold
          const brand = extractBrand(data.Product);
          const location = data.Location.trim();
          
          // Handle date validation - default to specific date if invalid
          let parsedDate;
          try {
            parsedDate = new Date(data.Date);
            if (isNaN(parsedDate.getTime())) {
              parsedDate = new Date('2023-10-31'); // Default date for invalid entries
            }
          } catch (e) {
            parsedDate = new Date('2023-10-31');
          }
          
          movements.push({
            productName: data.Product.trim(),
            sku: data.SKU?.trim() || null,
            barcode: data.Barcode?.trim() || null,
            location,
            originalLocation: data.Location,
            brand,
            date: parsedDate,
            type: data.Type?.trim() || 'Unknown',
            employee: data.Employee?.trim() || null,
            openingQty: parseInt(data.Opening) || 0,
            changeQty,
            unitsSold,
            closingQty: parseInt(data.Closing) || 0,
            notes: data.Notes?.trim() || null
          });
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  // Race between processing and timeout
  await Promise.race([processingPromise, timeoutPromise]);
  
  console.log(`✅ CSV parsing complete: ${movements.length} movement records found`);
  console.log(`📊 Validating dates and normalizing locations...`);

  // Get user's first store for snapshot (if they have stores)
  const userStores = await context.entities.Store.findMany({
    where: { userId: context.user.id }
  });
  
  if (userStores.length === 0) {
    throw new HttpError(400, 'No stores found. Please create a store first.');
  }
  
  console.log(`🏪 Found ${userStores.length} store(s) in your account`);

  // Create inventory snapshot
  console.log(`📸 Creating snapshot record...`);
  const snapshot = await context.entities.InventorySnapshot.create({
    data: {
      storeId: userStores[0].id,
      fileType: 'LOG',
      rawData: csvData
    }
  });

  // Process movements with better error tracking
  console.log(`\n🔄 PROCESSING ${movements.length} MOVEMENT RECORDS...`);
  console.log(`This may take a few moments. Progress will be logged every 100 records.\n`);
  
  const results = [];
  const errors = [];
  const skippedRows = [];
  let productsCreated = 0; // Track minimal products created from logs
  
  for (let i = 0; i < movements.length; i++) {
    const movement = movements[i];
    
    // Log progress every 100 records
    if (i > 0 && i % 100 === 0) {
      console.log(`📈 Progress: ${i}/${movements.length} (${((i / movements.length) * 100).toFixed(1)}%) - ${results.length} processed, ${skippedRows.length} skipped`);
    }
    try {
      // Find store by normalized location name
      const store = await context.entities.Store.findFirst({
        where: { 
          OR: [
            { name: movement.location },
            { reportName: movement.location },
            { reportName: movement.originalLocation }
          ],
          userId: context.user.id 
        }
      });

      if (!store) {
        skippedRows.push({
          row: movement.productName,
          reason: `Store not found: ${movement.location}`
        });
        continue;
      }

      // Find product by GTIN (primary key in industry)
      let product = null;
      if (movement.barcode) {
        product = await context.entities.ProductCatalog.findUnique({
          where: { gtin: movement.barcode }
        });
      }

      // If product doesn't exist but we have a GTIN, create minimal product
      if (!product && movement.barcode) {
        console.log(`📦 Creating minimal product from log: ${movement.productName} (${movement.barcode})`);
        product = await context.entities.ProductCatalog.create({
          data: {
            gtin: movement.barcode,
            name: movement.productName,
            brand: movement.brand,
            strainType: 'N/A', // Will be enriched by inventory export
            // All other fields nullable - will be filled by export upload
          }
        });
        productsCreated++;
      }

      // Only skip if we have no GTIN at all (can't create or match product)
      if (!product) {
        skippedRows.push({
          row: movement.productName,
          reason: `Missing GTIN - cannot create or match product`
        });
        
        // Save to UnmatchedRecord for review
        await context.entities.UnmatchedRecord.create({
          data: {
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
          }
        });
        continue;
      }

      const inventoryMovement = await context.entities.InventoryMovement.create({
        data: {
          storeId: store.id,
          productId: product.id,
          date: movement.date,
          type: movement.type,
          employee: movement.employee,
          openingQty: movement.openingQty,
          changeQty: movement.changeQty,
          closingQty: movement.closingQty,
          notes: movement.notes
        }
      });

      // Update stock level to match closing quantity
      await context.entities.StockLevel.upsert({
        where: {
          storeId_productId: {
            storeId: store.id,
            productId: product.id
          }
        },
        update: {
          quantity: movement.closingQty,
          lastUpdated: movement.date
        },
        create: {
          storeId: store.id,
          productId: product.id,
          quantity: movement.closingQty
        }
      });

      results.push(inventoryMovement);
    } catch (error) {
      errors.push({
        row: movement.productName,
        error: error.message
      });
    }
  }
  
  // Final summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅ INVENTORY LOGS UPLOAD COMPLETE!');
  console.log(`📊 Processed: ${results.length}/${movements.length} movements`);
  if (productsCreated > 0) {
    console.log(`📦 Products auto-created: ${productsCreated} (minimal entries - will be enriched by inventory export)`);
  }
  console.log(`⚠️  Skipped: ${skippedRows.length} rows`);
  console.log(`❌ Errors: ${errors.length}`);
  if (skippedRows.length > 0) {
    console.log(`\n⚠️  Top reasons for skipped rows:`);
    const reasons = {};
    skippedRows.forEach(skip => {
      reasons[skip.reason] = (reasons[skip.reason] || 0) + 1;
    });
    Object.entries(reasons).forEach(([reason, count]) => {
      console.log(`   - ${reason}: ${count} rows`);
    });
  }
  console.log('═══════════════════════════════════════════════════════\n');

  return {
    snapshot,
    movementsProcessed: results.length,
    totalMovements: movements.length,
    productsCreated, // Number of minimal products auto-created from logs
    skippedRows: skippedRows.length,
    errors: errors.length,
    skippedDetails: skippedRows.slice(0, 10), // First 10 for reporting
    errorDetails: errors.slice(0, 10) // First 10 for reporting
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

  // Batch update existing products
  if (updatedProducts.length > 0) {
    await Promise.all(updatedProducts.map(product => 
      context.entities.ProductCatalog.update({
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
      })
    ));
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

export const generatePrintableMenu = async ({ storeId, options = {} }, context) => {
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

// Ordering Actions

export const getOrCreateOrderWorksheet = async (args, context) => {
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

export const clearOrderWorksheet = async (args, context) => {
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

export const exportOrderWorksheet = async (args, context) => {
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

export const enrichProductFormats = async (args, context) => {
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
  
  return {
    success: true,
    weeksProcessed,
    storesProcessed: stores.length,
    startDate: start.toISOString(),
    endDate: end.toISOString()
  };
};
