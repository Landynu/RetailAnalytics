import { TRANSFER_DEFAULTS } from './constants.js';

/**
 * Calculate per-store metrics for a product at a specific store.
 */
function getStoreMetrics(product, storeId, periodDays) {
  const inv = product.locationInventory?.find(l => l.storeId === storeId);
  const sales = product.locationSales?.find(l => l.storeId === storeId);
  const lastSale = product.locationLastSale?.find(l => l.storeId === storeId);

  const quantity = inv ? inv.quantity : 0;
  const unitsSold = sales ? sales.units : 0;
  const weeksInPeriod = periodDays / 7;
  const velocity = weeksInPeriod > 0 ? unitsSold / weeksInPeriod : 0;
  const daysSinceLastSale = lastSale?.daysSinceLastSale ?? null;

  return { quantity, unitsSold, velocity, daysSinceLastSale };
}

/**
 * Compute a priority score for a transfer recommendation.
 * Higher score = more urgent. Returns { score, label }.
 *
 * Factors:
 *   - Velocity (higher = more urgent to restock)
 *   - Stock coverage (fewer weeks left = more urgent)
 *   - Days since last sale at store (recent sale = product is flowing = urgent to restock)
 *   - Category rank (top sellers get boost)
 *   - Days since last PO (longer = more urgent)
 */
function computePriority(product, storeMetrics, deficit) {
  let score = 0;

  // Velocity component (0-40 points): fast sellers are urgent
  score += Math.min(40, storeMetrics.velocity * 8);

  // Stock coverage (0-30 points): less stock = more urgent
  const weeksLeft = storeMetrics.velocity > 0
    ? storeMetrics.quantity / storeMetrics.velocity
    : (storeMetrics.quantity > 0 ? 999 : 0);
  if (weeksLeft < 0.5) score += 30;
  else if (weeksLeft < 1) score += 25;
  else if (weeksLeft < 2) score += 15;
  else if (weeksLeft < 3) score += 5;

  // Recency of sales (0-15 points): recent sales = product flowing = restock fast
  const dsl = storeMetrics.daysSinceLastSale;
  if (dsl !== null && dsl <= 3) score += 15;
  else if (dsl !== null && dsl <= 7) score += 10;
  else if (dsl !== null && dsl <= 14) score += 5;

  // Category rank (0-10 points): top sellers get priority
  if (product.isTop10) score += 10;
  else if (product.categoryRank && product.categoryTotal) {
    const pct = product.categoryRank / product.categoryTotal;
    if (pct <= 0.25) score += 7;
    else if (pct <= 0.5) score += 3;
  }

  // Days since last PO (0-5 points): been a while = need fresh stock
  if (product.daysSinceLastPO != null) {
    if (product.daysSinceLastPO > 30) score += 5;
    else if (product.daysSinceLastPO > 14) score += 3;
  }

  // Label based on score
  let label;
  if (score >= 50) label = 'URGENT';
  else if (score >= 30) label = 'HIGH';
  else if (score >= 15) label = 'MEDIUM';
  else label = 'LOW';

  return { score, label };
}

/**
 * Compute transfer plan from hub to satellite stores.
 *
 * @param {Array} products - sortedProducts from getOrderingAnalytics
 * @param {Array} stores - all active stores from getUserStores
 * @param {number} periodDays - analysis period in days
 * @param {Object} options - override defaults
 * @param {Object} overrides - user quantity overrides { "productId:storeId": qty }
 * @returns {Object} transfer plan
 */
export function computeTransferPlan(products, stores, periodDays, options = {}, overrides = {}) {
  const {
    targetWeeks = TRANSFER_DEFAULTS.TARGET_WEEKS,
    topSellerBonusWeeks = TRANSFER_DEFAULTS.TOP_SELLER_BONUS_WEEKS,
    staleDaysThreshold = TRANSFER_DEFAULTS.STALE_DAYS_THRESHOLD,
  } = options;

  const hubStore = stores.find(s => s.isPrimary);
  if (!hubStore) {
    return { transfers: [], staleFlags: [], storeSummaries: [], hubRemaining: null };
  }

  const satelliteStores = stores.filter(s => s.isActive && s.id !== hubStore.id);

  // Track hub available stock per product (decrements as we allocate)
  const hubAvailable = new Map();
  products.forEach(product => {
    const hubMetrics = getStoreMetrics(product, hubStore.id, periodDays);
    hubAvailable.set(product.id, hubMetrics.quantity);
  });

  // Apply user overrides first — lock those allocations
  const lockedAllocations = new Map(); // "productId:storeId" -> qty
  for (const [key, qty] of Object.entries(overrides)) {
    const [productId] = key.split(':');
    const currentHub = hubAvailable.get(productId) || 0;
    const locked = Math.min(qty, currentHub);
    lockedAllocations.set(key, locked);
    hubAvailable.set(productId, currentHub - locked);
  }

  // Build transfer recommendations
  const transfers = [];
  const staleFlags = [];

  for (const product of products) {
    const hubMetrics = getStoreMetrics(product, hubStore.id, periodDays);

    // For each satellite, compute needs
    const satelliteNeeds = [];
    for (const store of satelliteStores) {
      const metrics = getStoreMetrics(product, store.id, periodDays);
      const effectiveTargetWeeks = product.isTop10
        ? targetWeeks + topSellerBonusWeeks
        : targetWeeks;

      let targetQty;
      let isNewPush = false;

      if (metrics.velocity > 0) {
        // Product is selling at this store — use its own velocity
        targetQty = Math.ceil(metrics.velocity * effectiveTargetWeeks);
      } else if (metrics.quantity === 0 && hubMetrics.velocity > 0 && product.isTop10) {
        // NEW PRODUCT PUSH: Not at this satellite, but selling well at hub (top 10)
        // Use hub velocity as proxy, scaled to 1 week starter quantity
        targetQty = Math.ceil(hubMetrics.velocity * 1);
        isNewPush = true;
      } else {
        targetQty = 0;
      }

      const deficit = Math.max(0, targetQty - metrics.quantity);

      satelliteNeeds.push({
        store,
        metrics,
        targetQty,
        deficit,
        isNewPush,
      });

      // Stale detection
      if (metrics.quantity > 0 && !product.isTop10) {
        const isStale = metrics.daysSinceLastSale === null || metrics.daysSinceLastSale > staleDaysThreshold;
        if (isStale) {
          const recommendation = hubMetrics.velocity > 0 ? 'TRANSFER_TO_HUB' : 'PUT_ON_SALE';
          staleFlags.push({
            productId: product.id,
            productName: product.name,
            brand: product.brand,
            category: product.parentCategory,
            subcategory: product.subcategory,
            format: product.format,
            storeId: store.id,
            storeName: store.name,
            qty: metrics.quantity,
            daysSinceLastSale: metrics.daysSinceLastSale,
            categoryRank: product.categoryRank,
            categoryTotal: product.categoryTotal,
            recommendation,
          });
        }
      }
    }

    // Sort by velocity descending — fastest sellers get priority allocation
    satelliteNeeds.sort((a, b) => b.metrics.velocity - a.metrics.velocity);

    // Allocate from hub
    for (const need of satelliteNeeds) {
      const overrideKey = `${product.id}:${need.store.id}`;

      // If user locked this allocation, use it
      if (lockedAllocations.has(overrideKey)) {
        const lockedQty = lockedAllocations.get(overrideKey);
        if (lockedQty > 0) {
          const priority = computePriority(product, need.metrics, lockedQty);
          transfers.push({
            productId: product.id,
            productName: product.name,
            brand: product.brand,
            category: product.parentCategory,
            subcategory: product.subcategory,
            format: product.format,
            fromStoreId: hubStore.id,
            toStoreId: need.store.id,
            toStoreName: need.store.name,
            qty: lockedQty,
            hubQty: hubMetrics.quantity,
            currentQty: need.metrics.quantity,
            targetQty: need.targetQty,
            storeVelocity: need.metrics.velocity,
            daysSinceLastSale: need.metrics.daysSinceLastSale,
            priority: priority.label,
            priorityScore: priority.score,
            isOverride: true,
            isNewPush: need.isNewPush || false,
            reason: `User override: ${lockedQty} units`,
          });
        }
        continue;
      }

      if (need.deficit <= 0) continue;

      const available = hubAvailable.get(product.id) || 0;
      if (available <= 0) continue;

      const transferQty = Math.min(need.deficit, available);
      hubAvailable.set(product.id, available - transferQty);

      const priority = computePriority(product, need.metrics, transferQty);

      let reason;
      if (need.isNewPush) {
        reason = `New: top seller at hub (${hubMetrics.velocity.toFixed(1)}/wk), not at this store`;
      } else if (transferQty < need.deficit) {
        reason = `Partial: hub has ${transferQty} of ${need.deficit} needed`;
      } else {
        reason = `Need ${need.deficit} to reach ${need.targetQty} target`;
      }

      transfers.push({
        productId: product.id,
        productName: product.name,
        brand: product.brand,
        category: product.parentCategory,
        subcategory: product.subcategory,
        format: product.format,
        fromStoreId: hubStore.id,
        toStoreId: need.store.id,
        toStoreName: need.store.name,
        qty: transferQty,
        hubQty: hubMetrics.quantity,
        currentQty: need.metrics.quantity,
        targetQty: need.targetQty,
        storeVelocity: need.metrics.velocity,
        hubVelocity: hubMetrics.velocity,
        daysSinceLastSale: need.metrics.daysSinceLastSale,
        priority: priority.label,
        priorityScore: priority.score,
        isOverride: false,
        isNewPush: need.isNewPush || false,
        reason,
      });
    }
  }

  // Sort transfers by priority score descending
  transfers.sort((a, b) => b.priorityScore - a.priorityScore);

  // Build store summaries
  const storeSummaries = satelliteStores.map(store => {
    const storeTransfers = transfers.filter(t => t.toStoreId === store.id);
    const storeStale = staleFlags.filter(f => f.storeId === store.id);
    return {
      storeId: store.id,
      storeName: store.name,
      transfersIn: storeTransfers.length,
      transferUnits: storeTransfers.reduce((sum, t) => sum + t.qty, 0),
      staleCount: storeStale.length,
      staleUnits: storeStale.reduce((sum, f) => sum + f.qty, 0),
    };
  });

  // Hub remaining summary
  let totalAllocated = 0;
  transfers.forEach(t => { totalAllocated += t.qty; });

  const hubTotalInventory = products.reduce((sum, p) => {
    const inv = p.locationInventory?.find(l => l.storeId === hubStore.id);
    return sum + (inv ? inv.quantity : 0);
  }, 0);

  return {
    transfers,
    staleFlags,
    storeSummaries,
    hubRemaining: {
      storeId: hubStore.id,
      storeName: hubStore.name,
      totalInventory: hubTotalInventory,
      allocatedOut: totalAllocated,
      remaining: hubTotalInventory - totalAllocated,
    },
  };
}

/**
 * Get the category group key for a product.
 * Flower groups by parentCategory|format, others by parentCategory|subcategory.
 */
export function getCategoryGroupKey(product) {
  return product.parentCategory === 'Flower'
    ? `${product.parentCategory}|${product.format || 'Unknown'}`
    : `${product.parentCategory}|${product.subcategory || 'Unknown'}`;
}

/**
 * Build a category matrix: current SKU counts per group per store.
 * Used both for gap detection and the threshold editor.
 *
 * Returns: {
 *   groups: [{ groupKey, category, subcategory }],
 *   storeCounts: { "groupKey:storeId": count },
 *   maxCounts: { groupKey: maxCountAcrossStores }
 * }
 */
export function buildCategoryMatrix(products, stores) {
  const activeStores = stores.filter(s => s.isActive);
  const groupMap = new Map(); // groupKey -> Map(storeId -> Set(productId))

  for (const product of products) {
    const groupKey = getCategoryGroupKey(product);

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, new Map());
    }
    const storeMap = groupMap.get(groupKey);

    for (const loc of (product.locationInventory || [])) {
      if (loc.quantity > 0) {
        const store = activeStores.find(s => s.id === loc.storeId);
        if (!store) continue;
        if (!storeMap.has(store.id)) {
          storeMap.set(store.id, new Set());
        }
        storeMap.get(store.id).add(product.id);
      }
    }
  }

  const groups = [];
  const storeCounts = {};
  const maxCounts = {};

  // Sort groups by category then subcategory
  const sortedKeys = [...groupMap.keys()].sort();

  for (const groupKey of sortedKeys) {
    const [category, subcategory] = groupKey.split('|');
    groups.push({ groupKey, category, subcategory });

    const storeMap = groupMap.get(groupKey);
    let maxCount = 0;

    for (const store of activeStores) {
      const count = storeMap.get(store.id)?.size || 0;
      storeCounts[`${groupKey}:${store.id}`] = count;
      if (count > maxCount) maxCount = count;
    }

    maxCounts[groupKey] = maxCount;
  }

  return { groups, storeCounts, maxCounts };
}

/**
 * Detect category gaps using custom per-store thresholds.
 *
 * @param {Array} products
 * @param {Array} stores
 * @param {Object} thresholds - { "groupKey:storeId": targetSkuCount } — if missing, uses fallback
 * @param {Object} options - { gapThreshold } fallback ratio of avg when no custom threshold
 */
export function detectCategoryGaps(products, stores, thresholds = {}, options = {}) {
  const { gapThreshold = TRANSFER_DEFAULTS.CATEGORY_GAP_THRESHOLD } = options;

  const hubStore = stores.find(s => s.isPrimary);
  const activeStores = stores.filter(s => s.isActive);
  const { groups, storeCounts, maxCounts } = buildCategoryMatrix(products, stores);

  // Build product index by group for suggestions
  const productsByGroup = new Map(); // groupKey -> [{ product, hubVelocity }]
  for (const product of products) {
    const groupKey = getCategoryGroupKey(product);
    if (!productsByGroup.has(groupKey)) {
      productsByGroup.set(groupKey, []);
    }
    productsByGroup.get(groupKey).push(product);
  }

  const gaps = [];

  for (const { groupKey, category, subcategory } of groups) {
    // Calculate average for fallback
    const counts = activeStores.map(s => storeCounts[`${groupKey}:${s.id}`] || 0);
    const avgCount = counts.reduce((a, b) => a + b, 0) / activeStores.length;

    for (const store of activeStores) {
      if (hubStore && store.id === hubStore.id) continue; // Skip hub

      const storeCount = storeCounts[`${groupKey}:${store.id}`] || 0;
      const thresholdKey = `${groupKey}:${store.id}`;

      let targetCount;
      if (thresholds[thresholdKey] != null) {
        // Use custom threshold
        targetCount = thresholds[thresholdKey];
      } else {
        // Fallback: percentage of average
        targetCount = Math.ceil(avgCount * gapThreshold);
        if (avgCount < 2) continue; // Skip tiny categories with no custom threshold
      }

      if (targetCount > 0 && storeCount < targetCount) {
        // Find products in this group that are NOT at this store but exist elsewhere
        const groupProducts = productsByGroup.get(groupKey) || [];
        const suggestedProducts = groupProducts
          .filter(p => {
            // Product has no inventory at this store
            const storeInv = p.locationInventory?.find(l => l.storeId === store.id);
            if (storeInv && storeInv.quantity > 0) return false;
            // But does have inventory somewhere (hub or other stores)
            return p.totalInventory > 0;
          })
          .map(p => ({
            id: p.id,
            name: p.name,
            brand: p.brand,
            velocity: p.velocity || 0,
            totalSales: p.totalSales || 0,
            categoryRank: p.categoryRank,
            categoryTotal: p.categoryTotal,
          }))
          // Best sellers first
          .sort((a, b) => b.velocity - a.velocity)
          .slice(0, targetCount - storeCount); // Only suggest enough to fill the gap

        gaps.push({
          storeId: store.id,
          storeName: store.name,
          category,
          subcategory,
          groupKey,
          storeSkuCount: storeCount,
          targetSkuCount: targetCount,
          avgSkuCount: Math.round(avgCount * 10) / 10,
          deficit: targetCount - storeCount,
          suggestedProducts,
        });
      }
    }
  }

  gaps.sort((a, b) => b.deficit - a.deficit);

  return gaps;
}

// CSV helpers
function escapeCsvCell(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(cells) {
  return cells.map(escapeCsvCell).join(',');
}

/**
 * Generate a store-manager-friendly CSV for a specific store.
 * No prices, margins, or wholesale costs.
 */
export function generateManagerCsv(transferPlan, storeId, overrides = {}) {
  const { transfers, staleFlags } = transferPlan;

  const rows = [];

  // Transfers IN for this store
  const storeTransfers = transfers.filter(t => t.toStoreId === storeId);
  for (const t of storeTransfers) {
    const overrideKey = `${t.productId}:${storeId}`;
    const qty = overrides[overrideKey] != null ? overrides[overrideKey] : t.qty;

    const velNote = t.storeVelocity > 0
      ? `Selling ${t.storeVelocity.toFixed(1)}/wk`
      : 'No recent sales';
    const stockNote = `have ${t.currentQty}, target ${t.targetQty}`;
    const notes = `${velNote}, ${stockNote}`;

    rows.push({
      priority: t.priority,
      priorityScore: t.priorityScore,
      product: t.productName,
      brand: t.brand,
      category: t.category,
      format: t.format || '',
      action: 'RECEIVE',
      qty,
      currentStock: t.currentQty,
      notes,
    });
  }

  // Stale flags for this store
  const storeStale = staleFlags.filter(f => f.storeId === storeId);
  for (const f of storeStale) {
    const dslNote = f.daysSinceLastSale != null
      ? `No sale in ${f.daysSinceLastSale} days`
      : 'Never sold at this location';
    const rankNote = f.categoryRank
      ? `rank ${f.categoryRank}/${f.categoryTotal}`
      : '';
    const notes = [dslNote, rankNote].filter(Boolean).join(', ');

    rows.push({
      priority: 'LOW',
      priorityScore: 0,
      product: f.productName,
      brand: f.brand,
      category: f.category,
      format: f.format || '',
      action: f.recommendation === 'TRANSFER_TO_HUB' ? 'RETURN TO HUB' : 'PUT ON SALE',
      qty: f.qty,
      currentStock: f.qty,
      notes,
    });
  }

  // Sort: URGENT > HIGH > MEDIUM > LOW, then by score within
  const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  rows.sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 4;
    const pb = priorityOrder[b.priority] ?? 4;
    if (pa !== pb) return pa - pb;
    return b.priorityScore - a.priorityScore;
  });

  if (rows.length === 0) return null;

  const header = buildCsvRow(['Priority', 'Product', 'Brand', 'Category', 'Format', 'Action', 'Quantity', 'Current Stock', 'Notes']);
  const csvRows = rows.map(r => buildCsvRow([
    r.priority, r.product, r.brand, r.category, r.format,
    r.action, r.qty, r.currentStock, r.notes,
  ]));

  return [header, ...csvRows].join('\n');
}

/**
 * Generate a combined CSV for all stores.
 */
export function generateAllStoresCsv(transferPlan, satelliteStores, overrides = {}) {
  const { transfers, staleFlags } = transferPlan;
  const rows = [];

  for (const store of satelliteStores) {
    // Transfers
    const storeTransfers = transfers.filter(t => t.toStoreId === store.id);
    for (const t of storeTransfers) {
      const overrideKey = `${t.productId}:${store.id}`;
      const qty = overrides[overrideKey] != null ? overrides[overrideKey] : t.qty;
      rows.push({
        store: store.name,
        priority: t.priority,
        priorityScore: t.priorityScore,
        product: t.productName,
        brand: t.brand,
        category: t.category,
        format: t.format || '',
        action: 'RECEIVE',
        qty,
        currentStock: t.currentQty,
        notes: t.storeVelocity > 0
          ? `Selling ${t.storeVelocity.toFixed(1)}/wk, have ${t.currentQty}, target ${t.targetQty}`
          : `No recent sales, have ${t.currentQty}, target ${t.targetQty}`,
      });
    }

    // Stale
    const storeStale = staleFlags.filter(f => f.storeId === store.id);
    for (const f of storeStale) {
      rows.push({
        store: store.name,
        priority: 'LOW',
        priorityScore: 0,
        product: f.productName,
        brand: f.brand,
        category: f.category,
        format: f.format || '',
        action: f.recommendation === 'TRANSFER_TO_HUB' ? 'RETURN TO HUB' : 'PUT ON SALE',
        qty: f.qty,
        currentStock: f.qty,
        notes: f.daysSinceLastSale != null
          ? `No sale in ${f.daysSinceLastSale} days`
          : 'Never sold here',
      });
    }
  }

  // Sort by store, then priority
  const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  rows.sort((a, b) => {
    if (a.store !== b.store) return a.store.localeCompare(b.store);
    const pa = priorityOrder[a.priority] ?? 4;
    const pb = priorityOrder[b.priority] ?? 4;
    if (pa !== pb) return pa - pb;
    return b.priorityScore - a.priorityScore;
  });

  if (rows.length === 0) return null;

  const header = buildCsvRow(['Store', 'Priority', 'Product', 'Brand', 'Category', 'Format', 'Action', 'Quantity', 'Current Stock', 'Notes']);
  const csvRows = rows.map(r => buildCsvRow([
    r.store, r.priority, r.product, r.brand, r.category, r.format,
    r.action, r.qty, r.currentStock, r.notes,
  ]));

  return [header, ...csvRows].join('\n');
}
