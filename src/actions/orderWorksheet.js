import { HttpError } from 'wasp/server';

export const getOrCreateOrderWorksheet = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Find or create the user's current order worksheet
  let worksheet = await context.entities.OrderWorksheet.findFirst({
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

  if (!item) {
    throw new HttpError(404);
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

  if (!item) {
    throw new HttpError(404);
  }

  await context.entities.OrderWorksheetItem.delete({
    where: { id: parseInt(itemId) }
  });

  return { success: true };
};

export const clearOrderWorksheet = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  const worksheet = await context.entities.OrderWorksheet.findFirst({
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
