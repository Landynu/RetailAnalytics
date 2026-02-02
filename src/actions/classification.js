import { HttpError } from 'wasp/server';

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
