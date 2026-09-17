import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Demonstration data.
 *
 * A working application with an empty list looks broken, and an empty list is
 * also indistinguishable from a broken query. This gives every page something
 * real to show and gives the integration something to actually prove.
 *
 * Safe to run more than once: each record is keyed on something stable and
 * upserted, so re-seeding does not pile up duplicates.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const people = [
    { auth0Id: 'demo|guest_speaker', email: 'guest.speaker@glmp.test', role: 'guest_speaker' },
    { auth0Id: 'demo|unit_coordinator', email: 'unit.coordinator@glmp.test', role: 'unit_coordinator' },
    { auth0Id: 'demo|ccae_admin', email: 'ccae.admin@glmp.test', role: 'ccae_admin' },
  ];

  const users: { userid: bigint }[] = [];
  for (const person of people) {
    const existing = await prisma.users.findFirst({ where: { auth0Id: person.auth0Id } });
    users.push(
      existing ??
        (await prisma.users.create({ data: { ...person, createdat: new Date() } })),
    );
  }

  const speakers = [
    { first_name: 'Grace', last_name: 'Hopper', field: 'Computer Science', role: 'Rear Admiral', bio: 'Compilers, and the first bug.' },
    { first_name: 'Karen', last_name: 'Spark Jones', field: 'Information Retrieval', role: 'Professor', bio: 'Inverse document frequency.' },
    { first_name: 'Barbara', last_name: 'Liskov', field: 'Software Engineering', role: 'Institute Professor', bio: 'Substitution, and abstraction.' },
    { first_name: 'Radia', last_name: 'Perlman', field: 'Computer Networks', role: 'Fellow', bio: 'Spanning tree protocol.' },
  ];

  for (const [index, speaker] of speakers.entries()) {
    const existing = await prisma.guests.findFirst({
      where: { first_name: speaker.first_name, last_name: speaker.last_name },
    });
    if (!existing) {
      await prisma.guests.create({
        data: {
          ...speaker,
          user_id: index === 0 ? users[0].userid : null,
          location: 'Perth',
          duration: '60 minutes',
          audience: '30 to 60',
          format_online: true,
          format_inperson: index % 2 === 0,
        },
      });
    }
  }

  const counts = {
    users: await prisma.users.count(),
    guests: await prisma.guests.count(),
  };
  console.log('seeded:', counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
