import { Prisma } from '@prisma/client';

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  avatarUrl: true,
  googleId: true,
  googleEmail: true,
  telegramId: true,
  telegramUsername: true,
  telegramFirstName: true,
  telegramPhotoUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type RawUserRecord = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;

export interface PublicUserProfile {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  hasPassword: boolean;
  googleConnected: boolean;
  googleEmail: string | null;
  telegramConnected: boolean;
  telegramId: string | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  createdAt: Date;
}

export function toPublicUserProfile(user: RawUserRecord): PublicUserProfile {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || user.telegramPhotoUrl || null,
    hasPassword: Boolean(user.passwordHash),
    googleConnected: Boolean(user.googleId),
    googleEmail: user.googleEmail,
    telegramConnected: Boolean(user.telegramId),
    telegramId: user.telegramId,
    telegramUsername: user.telegramUsername,
    telegramFirstName: user.telegramFirstName,
    createdAt: user.createdAt,
  };
}
