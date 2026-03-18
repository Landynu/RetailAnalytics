import { HttpError } from 'wasp/server';

export const getProductActions = async ({ status = 'ACTIVE', actionType, groupBy }, context) => {
  if (!context.user) throw new HttpError(401);

  try {
    const whereClause = {};

    if (status) {
      whereClause.status = status;
    }

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
            margin: true,
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
                    id: true,
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

    // Group actions if requested
    if (groupBy === 'actionType') {
      const grouped = actions.reduce((acc, action) => {
        if (!acc[action.actionType]) {
          acc[action.actionType] = [];
        }
        acc[action.actionType].push(action);
        return acc;
      }, {});

      return { grouped: grouped || {}, total: actions.length, actions: [] };
    }

    return { grouped: null, actions, total: actions.length };
  } catch (error) {
    throw new HttpError(500, `Failed to get product actions: ${error.message}`);
  }
};

export const getActiveActionsByProduct = async ({ productId }, context) => {
  if (!context.user) throw new HttpError(401);

  try {
    const actions = await context.entities.ProductAction.findMany({
      where: {
        productId: parseInt(productId),
        status: 'ACTIVE'
      },
      orderBy: { createdAt: 'desc' }
    });

    return actions;
  } catch (error) {
    throw new HttpError(500, `Failed to get product actions: ${error.message}`);
  }
};
