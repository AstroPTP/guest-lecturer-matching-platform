import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

let realClient: PrismaClient | undefined;

function getClient(): PrismaClient {
  if (!realClient) {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });
    realClient = new PrismaClient({ adapter });
  }
  return realClient;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

/**
 * Resolves the numeric user id the schema uses from the Auth0 subject string.
 *
 * The tables key on `users.userid`, a BigInt, while everything above the
 * database carries the Auth0 `sub` as a string. Looking the row up here keeps
 * that translation in one place instead of every service guessing at it, and it
 * is the arrangement the team settled on: the provider's id is for identifying
 * the person, the numeric id is for joining rows.
 *
 * Creates the row on first sight, because a profile can be saved before
 * anything else has written a user record.
 */
export async function resolveUserId(auth0Id: string): Promise<bigint> {
  const existing = await prisma.users.findFirst({
    where: { auth0Id },
    select: { userid: true },
  });

  if (existing) {
    return existing.userid;
  }

  const created = await prisma.users.create({
    data: { auth0Id, createdat: new Date() },
    select: { userid: true },
  });

  return created.userid;
}

/** Splits a display name into the two columns the schema stores. */
export function splitName(fullName?: string): {
  first_name?: string;
  last_name?: string;
} {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return {};
  }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' ') || undefined,
  };
}

/**
 * Converts an id carried as a string into the BigInt the schema stores.
 *
 * Ids travel as strings above the database and arrive back from the browser the
 * same way. Converting here means a bad value fails with a message naming the
 * field, rather than as an unhandled BigInt conversion error halfway through a
 * write.
 */
export function toId(value: string | number | bigint, field: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new BadRequestException(`${field} must be a numeric id`);
  }
}