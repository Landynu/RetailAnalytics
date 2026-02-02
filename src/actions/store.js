import { HttpError } from 'wasp/server';

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

export const toggleStoreActive = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store || store.userId !== context.user.id) {
    throw new HttpError(403);
  }

  const updatedStore = await context.entities.Store.update({
    where: { id: parseInt(storeId) },
    data: {
      isActive: !store.isActive,
      // If disabling, also unfavourite
      ...(store.isActive && { isFavourite: false })
    }
  });

  return updatedStore;
};

export const toggleStoreFavourite = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store || store.userId !== context.user.id) {
    throw new HttpError(403);
  }

  // Can only favourite active stores
  if (!store.isActive && !store.isFavourite) {
    throw new HttpError(400, 'Cannot favourite a disabled store');
  }

  const updatedStore = await context.entities.Store.update({
    where: { id: parseInt(storeId) },
    data: {
      isFavourite: !store.isFavourite
    }
  });

  return updatedStore;
};

export const toggleStorePrimary = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store || store.userId !== context.user.id) {
    throw new HttpError(403);
  }

  // Can only set primary on active stores
  if (!store.isActive && !store.isPrimary) {
    throw new HttpError(400, 'Cannot set a disabled store as primary');
  }

  // If setting as primary, unset all other stores for this user
  if (!store.isPrimary) {
    await context.entities.Store.updateMany({
      where: {
        userId: context.user.id,
        isPrimary: true
      },
      data: {
        isPrimary: false
      }
    });
  }

  const updatedStore = await context.entities.Store.update({
    where: { id: parseInt(storeId) },
    data: {
      isPrimary: !store.isPrimary
    }
  });

  return updatedStore;
};
