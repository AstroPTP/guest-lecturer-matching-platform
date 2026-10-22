import { prisma } from '../prisma';
import { openReportRows, type ReportFixture } from './open-reports';

/**
 * Stand-ins for the transaction that writes a batch of notices, for the specs
 * of everything that raises one. The notifications service reads who was told
 * lately and writes the rest inside one transaction, under a lock, so a spec
 * has to supply the transaction's client.
 */

interface NoticeRow {
  user_id: bigint;
  type: string;
  title: string;
  href: string;
}

interface FindArgs {
  where: {
    user_id: { in: bigint[] };
    type: string;
    title: string;
    href: string;
    created_at: { gte: Date };
  };
}

interface CreateArgs {
  data: NoticeRow[];
}

type Run = (tx: unknown) => Promise<unknown>;

/**
 * Runs the transaction against a client of its own. `alreadyTold` are the
 * people the 24-hour read finds a matching notice for. The returned mocks are
 * the client's read, insert and lock, so a spec can check what was done inside
 * the transaction and that nothing was done outside it.
 */
export function useNoticeTransaction(options: { alreadyTold?: bigint[] } = {}) {
  const earlier = jest.fn((_args: FindArgs) =>
    Promise.resolve(
      (options.alreadyTold ?? []).map((user_id) => ({ user_id })),
    ),
  );
  const insert = jest.fn((args: CreateArgs) =>
    Promise.resolve({ count: args.data.length }),
  );
  const lock = jest.fn((..._args: unknown[]) => Promise.resolve(0));
  const tx = {
    $executeRaw: lock,
    notifications: { findMany: earlier, createMany: insert },
  };
  const transaction = jest
    .spyOn(prisma, '$transaction')
    .mockImplementation((run: Run) => run(tx));
  return { earlier, insert, lock, transaction };
}

/**
 * A notifications table in memory, with a transaction lock that makes a second
 * transaction wait for the first to finish, as the database's advisory lock
 * does. Each read and write yields to other work first, so without the lock two
 * transactions started together would interleave. `rows` is what was stored.
 */
export function useLockingNoticeTable() {
  const rows: (NoticeRow & { created_at: Date })[] = [];
  let holder: Promise<void> = Promise.resolve();
  const yieldToOthers = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 0));

  jest.spyOn(prisma, '$transaction').mockImplementation((run: Run) => {
    let release!: () => void;
    const finished = new Promise<void>((resolve) => (release = resolve));
    const tx = {
      $executeRaw: async () => {
        const previous = holder;
        holder = finished;
        await previous;
        return 0;
      },
      notifications: {
        findMany: async (args: FindArgs) => {
          await yieldToOthers();
          return rows
            .filter(
              (row) =>
                args.where.user_id.in.includes(row.user_id) &&
                row.type === args.where.type &&
                row.title === args.where.title &&
                row.href === args.where.href &&
                row.created_at >= args.where.created_at.gte,
            )
            .map((row) => ({ user_id: row.user_id }));
        },
        createMany: async (args: CreateArgs) => {
          await yieldToOthers();
          rows.push(
            ...args.data.map((row) => ({ ...row, created_at: new Date() })),
          );
          return { count: args.data.length };
        },
      },
    };
    return run(tx).finally(release);
  });

  return { rows };
}

/**
 * Answers the query for people who share a topic with these user ids, and the
 * other raw read, which is the open reports, with the given reports. The two
 * are told apart by what they select from, so the order they run in does not
 * matter.
 */
export function answerTopicQuery(
  userIds: bigint[],
  reports: ReportFixture[] = [],
) {
  return jest
    .spyOn(prisma, '$queryRaw')
    .mockImplementation(((strings: TemplateStringsArray) =>
      Promise.resolve(
        strings.join('?').includes('user_expertise')
          ? userIds.map((user_id) => ({ user_id }))
          : openReportRows(reports),
      )) as never);
}

/** The calls made to answerTopicQuery's spy that were the topic query: its text and its parameters. */
export function topicQueries(query: jest.SpyInstance) {
  return (query.mock.calls as [TemplateStringsArray, ...unknown[]][])
    .filter(([strings]) => strings.join('?').includes('user_expertise'))
    .map(([strings, ...values]) => ({ sql: strings.join('?'), values }));
}
