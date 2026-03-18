import { HttpError } from 'wasp/server';
import { emailSender } from 'wasp/server/email';

export const sendInvitation = async ({ email }, context) => {
  if (!context.user) { throw new HttpError(401); }

  // Only admins can invite (first user is auto-admin)
  const inviter = await context.entities.User.findUnique({
    where: { id: context.user.id }
  });
  if (inviter.role !== 'ADMIN') {
    throw new HttpError(403, 'Only admins can send invitations');
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check if invitation already exists
  const existing = await context.entities.Invitation.findUnique({
    where: { email: normalizedEmail }
  });
  if (existing && existing.status === 'ACCEPTED') {
    throw new HttpError(400, 'This email has already been registered');
  }

  // Upsert invitation (re-send if pending/expired)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 day expiry

  const invitation = await context.entities.Invitation.upsert({
    where: { email: normalizedEmail },
    create: {
      email: normalizedEmail,
      invitedBy: context.user.id,
      status: 'PENDING',
      expiresAt
    },
    update: {
      status: 'PENDING',
      expiresAt,
      // Regenerate token on re-send
      token: crypto.randomUUID()
    }
  });

  // Build signup URL with token
  const baseUrl = process.env.WASP_WEB_CLIENT_URL || 'http://localhost:3000';
  const signupUrl = `${baseUrl}/signup?token=${invitation.token}`;

  // Send invitation email via Postmark
  await emailSender.send({
    to: normalizedEmail,
    subject: 'You\'ve been invited to RetailAnalytics',
    text: `You've been invited to RetailAnalytics.\n\nClick the link below to create your account:\n${signupUrl}\n\nThis invitation expires in 7 days.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #047857;">You've been invited to RetailAnalytics</h2>
        <p>Click the button below to create your account:</p>
        <a href="${signupUrl}" style="display: inline-block; background: #059669; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Create Account
        </a>
        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
          Or copy this link: ${signupUrl}
        </p>
        <p style="color: #9ca3af; font-size: 12px;">This invitation expires in 7 days.</p>
      </div>
    `
  });

  return { success: true, email: normalizedEmail };
};

export const revokeInvitation = async ({ id }, context) => {
  if (!context.user) { throw new HttpError(401); }

  const inviter = await context.entities.User.findUnique({
    where: { id: context.user.id }
  });
  if (inviter.role !== 'ADMIN') {
    throw new HttpError(403, 'Only admins can revoke invitations');
  }

  await context.entities.Invitation.delete({ where: { id } });
  return { success: true };
};
