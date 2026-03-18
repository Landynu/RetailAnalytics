import { HttpError } from 'wasp/server';

export const getInvitations = async (_args, context) => {
  if (!context.user) { throw new HttpError(401); }

  return context.entities.Invitation.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      inviter: {
        select: { id: true }
      }
    }
  });
};

export const validateInvitationToken = async ({ token }, context) => {
  if (!token) return { valid: false };

  const invitation = await context.entities.Invitation.findUnique({
    where: { token }
  });

  if (!invitation) return { valid: false, reason: 'Invalid invitation' };
  if (invitation.status === 'ACCEPTED') return { valid: false, reason: 'Invitation already used' };
  if (new Date() > invitation.expiresAt) return { valid: false, reason: 'Invitation expired' };

  return { valid: true, email: invitation.email };
};
