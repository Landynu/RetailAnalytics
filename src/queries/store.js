import { HttpError } from 'wasp/server';

export const getUserStores = async (args, context) => {
  if (!context.user) { throw new HttpError(401) };

  return context.entities.Store.findMany({
    where: { userId: context.user.id }
  });
}

export const getStoreById = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store || store.userId !== context.user.id) {
    throw new HttpError(404)
  }

  return store;
}
