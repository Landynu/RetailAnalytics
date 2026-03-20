import { HttpError } from 'wasp/server';
import { encrypt } from '../server/encryption.js';

/**
 * Create a new POS account with encrypted credentials
 */
export const createPOSAccount = async ({ name, posType, username, password, loginUrl }, context) => {
  if (!context.user) { throw new HttpError(401); }

  try {
    const encryptedUsername = encrypt(username);
    const encryptedPassword = encrypt(password);

    const account = await context.entities.POSAccount.create({
      data: {
        userId: context.user.id,
        name,
        posType,
        username: encryptedUsername,
        password: encryptedPassword,
        loginUrl: loginUrl || null
      }
    });

    return { id: account.id, name: account.name, posType: account.posType };
  } catch (error) {
    console.error('Failed to create POS account:', error);
    throw new HttpError(500, `Failed to create POS account: ${error.message}`);
  }
};

/**
 * Update an existing POS account
 */
export const updatePOSAccount = async ({ id, name, posType, username, password, loginUrl }, context) => {
  if (!context.user) { throw new HttpError(401); }

  const account = await context.entities.POSAccount.findUnique({
    where: { id }
  });

  if (!account) {
    throw new HttpError(404, 'POS account not found');
  }

  const updateData = {
    name,
    posType,
    loginUrl: loginUrl || null
  };

  // Only encrypt and update credentials if provided
  if (username) {
    updateData.username = encrypt(username);
  }
  if (password) {
    updateData.password = encrypt(password);
  }

  await context.entities.POSAccount.update({
    where: { id },
    data: updateData
  });

  return { success: true };
};

/**
 * Delete a POS account
 */
export const deletePOSAccount = async ({ id }, context) => {
  if (!context.user) { throw new HttpError(401); }

  const account = await context.entities.POSAccount.findUnique({
    where: { id }
  });

  if (!account) {
    throw new HttpError(404, 'POS account not found');
  }

  await context.entities.POSAccount.delete({
    where: { id }
  });

  return { success: true };
};

/**
 * Link a store to a POS account
 */
export const linkStoreToPOSAccount = async ({ storeId, posAccountId, externalStoreId }, context) => {
  if (!context.user) { throw new HttpError(401); }

  const store = await context.entities.Store.findUnique({
    where: { id: storeId }
  });

  if (!store) {
    throw new HttpError(404, 'Store not found');
  }

  const account = await context.entities.POSAccount.findUnique({
    where: { id: posAccountId }
  });

  if (!account) {
    throw new HttpError(404, 'POS account not found');
  }

  await context.entities.Store.update({
    where: { id: storeId },
    data: {
      posAccountId,
      externalStoreId: externalStoreId || null
    }
  });

  return { success: true };
};
