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

  // Helper function to extract format from product name
  const extractFormat = (productName) => {
    if (!productName) return null;
    
    // Extract format from last part after "-" or within parentheses
    const lastDashPart = productName.split('-').pop().trim();
    
    // Look for patterns like "1g", "100mg", "0.5g", "10ml", etc.
    const formatMatch = lastDashPart.match(/(\d+\.?\d*\s*(g|mg|ml|oz|ml|%))/i);
    if (formatMatch) {
      return formatMatch[0].trim();
    }
    
    // Also check within parentheses
    const parenMatch = productName.match(/\(([^)]*(?:g|mg|ml|oz|%))\)/i);
    if (parenMatch) {
      return parenMatch[1].trim();
    }
    
    return null;
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

  // Helper function to normalize location names
  const normalizeLocationName = (locationName) => {
    // Normalize common variations
    const normalizations = {
      'South Albert Regina': 'Albert',
      'South Albert': 'Albert'
    };
    
    return normalizations[locationName] || locationName;
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
              const normalizedName = normalizeLocationName(key);
              if (!locationColumns.includes(normalizedName)) {
                locationColumns.push(normalizedName);
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
            updated,
            stockLevels: []
          };
          
          // Collect stock levels for all locations
          Object.keys(data).forEach(key => {
            const normalizedLocation = normalizeLocationName(key);
            if (locationColumns.includes(normalizedLocation)) {
              const quantity = parseInt(data[key]) || 0;
              productData.stockLevels.push({
                location: normalizedLocation,
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

  // Batch create new products in chunks of 100
  let createdProducts = [];
  if (newProducts.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < newProducts.length; i += chunkSize) {
      const chunk = newProducts.slice(i, i + chunkSize).map(p => ({
        ...p,
        description: truncateField(p.description, 1000),
        imageUrl: truncateField(p.imageUrl, 500)
      }));
      
      try {
        await context.entities.ProductCatalog.createMany({
          data: chunk
        });
      } catch (error) {
        // If batch insert fails (e.g., due to duplicates), insert one by one
        for (const product of chunk) {
          try {
            await context.entities.ProductCatalog.create({
              data: product
            });
          } catch (err) {
            // Skip duplicates silently
            console.log(`Skipping duplicate product: ${product.gtin}`);
          }
        }
      }
    }
    
    // Fetch the created products to get their IDs
    createdProducts = await context.entities.ProductCatalog.findMany({
      where: { gtin: { in: newProducts.map(p => p.gtin) } }
    });
  }

  // Batch update existing products in chunks of 50
  if (existingProductsToUpdate.length > 0) {
    const chunkSize = 50;
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

  // Batch upsert stock levels in smaller chunks to avoid SQLite timeouts
  if (stockLevelUpdates.length > 0) {
    const chunkSize = 10; // Reduced for SQLite performance
    console.log(`Upserting ${stockLevelUpdates.length} stock levels in chunks of ${chunkSize}...`);
    
    for (let i = 0; i < stockLevelUpdates.length; i += chunkSize) {
      const chunk = stockLevelUpdates.slice(i, i + chunkSize);
      
      // Process chunk with retry logic
      try {
        await Promise.all(chunk.map(stock => 
          context.entities.StockLevel.upsert({
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
          })
        ));
        console.log(`Stock levels: ${i + chunk.length}/${stockLevelUpdates.length} completed`);
      } catch (error) {
        console.error(`Error in stock level chunk ${Math.floor(i / chunkSize) + 1}:`, error.message);
        // Try one by one for this chunk
        for (const stock of chunk) {
          try {
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
          } catch (err) {
            console.error(`Failed to upsert stock level for product ${stock.productId}:`, err.message);
          }
        }
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
  console.log(`Processing inventory logs CSV: ${(csvSize / 1024 / 1024).toFixed(2)}MB`);

  // Helper function to extract brand from product name (text in parentheses)
  const extractBrand = (productName) => {
    if (!productName) return null;
    
    const match = productName.match(/\(([^)]+)\)/);
    return match ? match[1].trim() : null;
  };

  // Helper function to normalize location names
  const normalizeLocationName = (locationName) => {
    const normalizations = {
      'South Albert Regina': 'Albert',
      'South Albert': 'Albert'
    };
    
    return normalizations[locationName] || locationName;
  };

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
          const normalizedLocation = normalizeLocationName(data.Location);
          
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
            location: normalizedLocation,
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

  // Get user's first store for snapshot (if they have stores)
  const userStores = await context.entities.Store.findMany({
    where: { userId: context.user.id }
  });
  
  if (userStores.length === 0) {
    throw new HttpError(400, 'No stores found. Please create a store first.');
  }

  // Create inventory snapshot
  const snapshot = await context.entities.InventorySnapshot.create({
    data: {
      storeId: userStores[0].id,
      fileType: 'LOG',
      rawData: csvData
    }
  });

  // Process movements with better error tracking
  const results = [];
  const errors = [];
  const skippedRows = [];
  
  for (const movement of movements) {
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

      if (!product) {
        skippedRows.push({
          row: movement.productName,
          reason: `Product not found by GTIN: ${movement.barcode || 'N/A'}`
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

  return {
    snapshot,
    movementsProcessed: results.length,
    totalMovements: movements.length,
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
