import { HttpError } from 'wasp/server';

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
