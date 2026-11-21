import { Prisma } from '@prisma/client';

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type RawUserRecord = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;

export interface PublicUserProfile {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export function toPublicUserProfile(user: RawUserRecord): PublicUserProfile {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}
