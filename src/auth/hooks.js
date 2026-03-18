import { HttpError } from 'wasp/server';

export const onBeforeSignup = async ({ providerId, prisma }) => {
  const email = providerId.providerUserId?.toLowerCase();

  // Allow signup if no users exist yet (first user)
  const userCount = await prisma.user.count();
  if (userCount === 0) return;

  // Otherwise require a valid invitation
  const invitation = await prisma.invitation.findUnique({
    where: { email }
  });

  if (!invitation || invitation.status === 'ACCEPTED') {
    throw new HttpError(403, 'Signup requires an invitation. Please ask an admin to invite you.');
  }

  if (new Date() > invitation.expiresAt) {
    throw new HttpError(403, 'This invitation has expired. Please ask an admin to resend it.');
  }
};

export const onAfterSignup = async ({ user, prisma }) => {
  // Get the user's email from the auth identity
  const auth = await prisma.auth.findFirst({
    where: { userId: user.id },
    include: { identities: true }
  });

  const emailIdentity = auth?.identities?.find(i => i.providerName === 'email');
  const email = emailIdentity?.providerUserId?.toLowerCase();

  // Auto-promote first user to ADMIN
  const userCount = await prisma.user.count();
  if (userCount <= 1) {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN' }
    });
    console.log(`First user ${email} auto-promoted to ADMIN`);
  }

  // Mark invitation as ACCEPTED if one exists for this email
  if (email) {
    try {
      await prisma.invitation.updateMany({
        where: { email, status: 'PENDING' },
        data: { status: 'ACCEPTED' }
      });
    } catch (err) {
      // Invitation may not exist (e.g., first user) — that's fine
      console.log(`No pending invitation found for ${email}`);
    }
  }
};
