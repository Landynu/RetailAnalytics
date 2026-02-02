import { HttpError } from 'wasp/server';

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
