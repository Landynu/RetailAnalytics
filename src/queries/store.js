import { HttpError } from 'wasp/server';

export const getUserStores = async (args, context) => {
  if (!context.user) { throw new HttpError(401) };

  return context.entities.Store.findMany();
}

export const getStoreById = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store) {
    throw new HttpError(404)
  }

  return store;
}
