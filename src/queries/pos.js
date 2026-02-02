import { HttpError } from 'wasp/server';

export const getPOSAccounts = async (args, context) => {
  if (!context.user) { throw new HttpError(401); }

  const accounts = await context.entities.POSAccount.findMany({
    where: {
      userId: context.user.id
    },
    include: {
      stores: {
        select: {
          id: true,
          name: true,
          friendlyName: true,
          location: true,
          externalStoreId: true,
          isActive: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Return accounts without decrypted credentials
  return accounts.map(account => ({
    id: account.id,
    name: account.name,
    posType: account.posType,
    loginUrl: account.loginUrl,
    isActive: account.isActive,
    stores: account.stores,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    hasCredentials: !!(account.username && account.password)
  }));
};
