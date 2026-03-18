import { HttpError } from 'wasp/server';

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
            subcategory: true,
            wholesaleCost: true,
            retailPrice: true,
            stockLevels: {
              where: {
                store: {
                  isFavourite: true
                }
              },
              select: {
                quantity: true,
                store: {
                  select: {
                    name: true,
                    friendlyName: true
                  }
                }
              }
            }
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
      'Wholesale Cost',
      'Retail Price',
      'Locations',
      'Action Type',
      'Status',
      'Notes',
      'Created Date',
      'Completed Date'
    ];

    const rows = actions.map(a => {
      // Get locations with inventory > 0
      const locationsWithStock = (a.product.stockLevels || [])
        .filter(sl => sl.quantity > 0)
        .map(sl => `${sl.store.friendlyName || sl.store.name} (${sl.quantity})`)
        .join('; ');

      return [
        a.product.name,
        a.product.brand || '',
        a.product.gtin,
        a.product.parentCategory || '',
        a.product.subcategory || '',
        a.product.wholesaleCost != null ? a.product.wholesaleCost.toFixed(2) : '',
        a.product.retailPrice != null ? a.product.retailPrice.toFixed(2) : '',
        locationsWithStock,
        a.actionType,
        a.status,
        a.notes || '',
        new Date(a.createdAt).toLocaleDateString('en-US', { timeZone: 'America/Chicago' }),
        a.completedAt ? new Date(a.completedAt).toLocaleDateString('en-US', { timeZone: 'America/Chicago' }) : ''
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return { csvContent, count: actions.length };
  } catch (error) {
    throw new HttpError(500, `Failed to export product actions: ${error.message}`);
  }
};
