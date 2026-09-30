import { BadRequestException } from '@nestjs/common';
/**
 * Stands in for the Prisma client in unit tests.
 *
 * The generated client lives outside `rootDir`, so jest cannot transform it,
 * and a unit test should not be reaching a database in any case. Mapping the
 * module here keeps the controller and service tests about their own logic.
 *
 * Integration behaviour is covered by running the application, not from here.
 */
type AnyFn = (...args: unknown[]) => Promise<unknown>;

function model(): Record<string, AnyFn> {
  return {
    create: () => Promise.resolve({}),
    findMany: () => Promise.resolve([]),
    findFirst: () => Promise.resolve(null),
    findUnique: () => Promise.resolve(null),
    update: () => Promise.resolve({}),
    upsert: () => Promise.resolve({}),
    delete: () => Promise.resolve({}),
    createMany: () => Promise.resolve({ count: 0 }),
    deleteMany: () => Promise.resolve({ count: 0 }),
  };
}

export const prisma = {
  users: model(),
  guests: model(),
  coordinators: model(),
  admins: model(),
  units: model(),
  match_requests: model(),
  dismissals: model(),
  messages: model(),
  availability: model(),
  user_expertise: model(),
};

export function resolveUserId(): Promise<bigint> {
  return Promise.resolve(1n);
}

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

export function toId(value: string | number | bigint, field = 'id'): bigint {
  try {
    return BigInt(value);
  } catch {
    // Mirrors the real helper. A double that throws a different error teaches
    // the tests the wrong thing about how the code behaves.
    throw new BadRequestException(`${field} must be a numeric id`);
  }
}
