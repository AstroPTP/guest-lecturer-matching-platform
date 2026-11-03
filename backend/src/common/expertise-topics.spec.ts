import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import {
  FIXED_EXPERTISE_TOPICS,
  tidyTopics,
  topicKey,
  topicListProblem,
} from './expertise-topics';
import { ExpertiseDto as GuestExpertiseDto } from '../guest-speakers/dto/expertise.dto';
import { ExpertiseDto as CoordinatorExpertiseDto } from '../unit-coordinators/dto/expertise.dto';
import { GuestSpeakersService } from '../guest-speakers/guest-speakers.service';
import { UnitCoordinatorsService } from '../unit-coordinators/unit-coordinators.service';
import { prisma } from '../prisma';

describe('topicKey', () => {
  it('lower-cases and turns every run of other characters into one hyphen', () => {
    expect(topicKey('Supply Chain')).toBe('supply-chain');
    expect(topicKey('  supply -- chain ')).toBe('supply-chain');
    expect(topicKey('Banking & Finance')).toBe('banking-finance');
  });
});

// "Banking & Finance" with the Kelvin sign (U+212A) in place of the "k".
// String.toLowerCase turns that sign into an ASCII "k".
const KELVIN_BANKING = 'Ban\u212Aing & Finance';

describe('tidyTopics', () => {
  it('trims topics and collapses their inner spaces', () => {
    expect(tidyTopics(['  Supply   Chain '])).toEqual(['Supply Chain']);
  });

  it('spells a fixed topic in any letter case as the fixed list does', () => {
    expect(
      tidyTopics(['ACCOUNTING', 'risk management', '  banking  &  FINANCE ']),
    ).toEqual(['Accounting', 'Risk Management', 'Banking & Finance']);
  });

  it('spells an older form of a fixed topic as the fixed list does', () => {
    expect(
      tidyTopics([
        'banking-finance',
        'Banking and Finance',
        'esg-sustainability',
        'human-resource-management',
        'RISK   MANAGEMENT',
        'ESG/Sustainability',
        'Banking/Finance',
        'Marketing. Strategy',
        "Taxation' Law",
      ]),
    ).toEqual([
      'Banking & Finance',
      'Banking & Finance',
      'ESG & Sustainability',
      'Human Resource Management',
      'Risk Management',
      'ESG & Sustainability',
      'Banking & Finance',
      'Marketing Strategy',
      'Taxation Law',
    ]);
  });

  it.each(FIXED_EXPERTISE_TOPICS)(
    'spells the hyphenated form of %p as the fixed list does',
    (topic) => {
      expect(tidyTopics([topicKey(topic)])).toEqual([topic]);
    },
  );

  it('leaves a topic that only resembles a fixed one as it is', () => {
    expect(tidyTopics(['Corporate Law Reform', 'Account'])).toEqual([
      'Corporate Law Reform',
      'Account',
    ]);
  });

  it('does not treat a non-ASCII look-alike as a fixed topic', () => {
    expect(KELVIN_BANKING.toLowerCase()).toBe('banking & finance');
    expect(tidyTopics([KELVIN_BANKING])).toEqual([KELVIN_BANKING]);
  });

  it('leaves values that are not strings and lists that are not arrays', () => {
    expect(tidyTopics([42, null])).toEqual([42, null]);
    expect(tidyTopics('Accounting')).toBe('Accounting');
  });
});

describe('topicListProblem', () => {
  it('accepts every fixed topic in the fixed spelling', () => {
    expect(topicListProblem([...FIXED_EXPERTISE_TOPICS])).toBeNull();
  });

  it('treats a fixed topic in another spelling as a custom one', () => {
    expect(topicListProblem(['ACCOUNTING'])).toBe(
      'has a custom topic that repeats a fixed topic',
    );
  });

  it('refuses a non-ASCII look-alike of a fixed topic', () => {
    expect(topicListProblem([KELVIN_BANKING])).toBe(
      "has a custom topic with characters other than letters, numbers, spaces and & - / ' .",
    );
  });

  it('accepts an empty list', () => {
    expect(topicListProblem([])).toBeNull();
  });

  it('accepts up to three custom topics beside fixed ones', () => {
    expect(
      topicListProblem([
        'Accounting',
        'Management',
        'Supply Chain',
        "R&D / Owner's Tax Credits",
        'U.S. GAAP',
      ]),
    ).toBeNull();
  });

  it('refuses a fourth custom topic', () => {
    expect(
      topicListProblem(['Supply Chain', 'Logistics', 'Procurement', 'Fintech']),
    ).toBe('has more than 3 custom topics');
  });

  it('does not count fixed topics towards the custom limit', () => {
    expect(
      topicListProblem([
        'Accounting',
        'Economics',
        'Supply Chain',
        'Logistics',
        'Procurement',
      ]),
    ).toBeNull();
  });

  it('accepts custom topics of exactly 2 and exactly 40 characters', () => {
    expect(topicListProblem(['AI', 'a'.repeat(40)])).toBeNull();
  });

  it.each([['A'], ['a'.repeat(41)], ['']])(
    'refuses a custom topic of the wrong length (%p)',
    (topic) => {
      expect(topicListProblem([topic])).toBe(
        'has a custom topic that is not 2 to 40 characters long',
      );
    },
  );

  it.each([
    ['<script>'],
    ['Tax (GST)'],
    ['Cafe, Bars'],
    ['Café Management'],
    ['Line\nBreak'],
  ])('refuses a custom topic with other characters (%p)', (topic) => {
    expect(topicListProblem([topic])).toBe(
      "has a custom topic with characters other than letters, numbers, spaces and & - / ' .",
    );
  });

  it('refuses a custom topic with no letters or numbers', () => {
    expect(topicListProblem(['&/-'])).toBe(
      'has a custom topic with no letters or numbers',
    );
  });

  it.each([['Corporate-Law'], ['ESG/Sustainability'], ['Banking/Finance']])(
    'refuses a custom topic that repeats a fixed topic (%p)',
    (topic) => {
      expect(topicListProblem([topic])).toBe(
        'has a custom topic that repeats a fixed topic',
      );
    },
  );

  it('refuses the same custom topic twice in different forms', () => {
    expect(topicListProblem(['Supply Chain', 'supply-chain'])).toBe(
      'lists the same topic more than once',
    );
  });

  it('refuses the same fixed topic twice', () => {
    expect(topicListProblem(['Accounting', 'Accounting'])).toBe(
      'lists the same topic more than once',
    );
  });

  it('leaves values that are not strings to the type check', () => {
    expect(topicListProblem([42, null])).toBeNull();
  });
});

// The same options the application applies to every request body.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const body = (metatype: ArgumentMetadata['metatype']) =>
  ({ type: 'body', metatype }) as ArgumentMetadata;

const guestBody = (selectedTopics: unknown) => ({
  selectedTopics,
  experienceLevel: 'mid-career',
  hasSpeakingExperience: false,
  speakingDetails: '',
  hasInternationalExperience: false,
  internationalDetails: '',
  linkedin: '',
});

const coordinatorBody = (selectedTopics: unknown) => ({
  selectedTopics,
  experienceLevelsRequired: ['mid-career'],
  industryRelevance: 'Logistics',
  learningObjective: 'Apply supply chain models to a real business.',
});

describe.each([
  ['guest lecturer', GuestExpertiseDto, guestBody],
  ['unit coordinator', CoordinatorExpertiseDto, coordinatorBody],
] as const)('%s expertise request', (_role, metatype, makeBody) => {
  async function rejection(selectedTopics: unknown) {
    try {
      await pipe.transform(makeBody(selectedTopics), body(metatype));
    } catch (error) {
      return error as BadRequestException;
    }
    throw new Error('expected the request to be refused');
  }

  it('passes five fixed topics in the fixed spelling through unchanged', async () => {
    const fiveFixed = FIXED_EXPERTISE_TOPICS.slice(0, 5);
    const result = (await pipe.transform(
      makeBody([...fiveFixed]),
      body(metatype),
    )) as { selectedTopics: string[] };

    expect(result.selectedTopics).toEqual(fiveFixed);
  });

  it('stores a fixed topic in any letter case with the fixed spelling', async () => {
    const result = (await pipe.transform(
      makeBody(['ACCOUNTING', 'banking & finance']),
      body(metatype),
    )) as { selectedTopics: string[] };

    expect(result.selectedTopics).toEqual(['Accounting', 'Banking & Finance']);
  });

  it('stores an older form of a fixed topic with the fixed spelling', async () => {
    const result = (await pipe.transform(
      makeBody([
        'banking-finance',
        'corporate law',
        'ESG/Sustainability',
        'Supply Chain',
      ]),
      body(metatype),
    )) as { selectedTopics: string[] };

    expect(result.selectedTopics).toEqual([
      'Banking & Finance',
      'Corporate Law',
      'ESG & Sustainability',
      'Supply Chain',
    ]);
  });

  it('answers an older form of a fixed topic beside the fixed one with 400', async () => {
    const error = await rejection(['Banking & Finance', 'banking-finance']);

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      message: ['selectedTopics lists the same topic more than once'],
    });
  });

  it('answers a non-ASCII look-alike of a fixed topic with 400', async () => {
    const error = await rejection([KELVIN_BANKING]);

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      message: [
        "selectedTopics has a custom topic with characters other than letters, numbers, spaces and & - / ' .",
      ],
    });
  });

  it('answers the same fixed topic in two letter cases with 400', async () => {
    const error = await rejection(['Accounting', 'ACCOUNTING']);

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      message: ['selectedTopics lists the same topic more than once'],
    });
  });

  it('answers six topics with 400', async () => {
    const error = await rejection(FIXED_EXPERTISE_TOPICS.slice(0, 6));

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      message: ['selectedTopics must contain no more than 5 elements'],
    });
  });

  it('trims custom topics and collapses their inner spaces', async () => {
    const result = (await pipe.transform(
      makeBody(['  Supply   Chain ', 'Accounting']),
      body(metatype),
    )) as { selectedTopics: string[] };

    expect(result.selectedTopics).toEqual(['Supply Chain', 'Accounting']);
  });

  it('answers a fourth custom topic with 400', async () => {
    const error = await rejection([
      'Supply Chain',
      'Logistics',
      'Procurement',
      'Fintech',
    ]);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      message: ['selectedTopics has more than 3 custom topics'],
    });
  });

  it.each([
    [['   ']],
    [['<b>Tax</b>']],
    [['Corporate law', 'corporate-law']],
    ['Accounting'],
    [[42]],
  ])('answers %p with 400', async (selectedTopics) => {
    const error = await rejection(selectedTopics);

    expect(error.getStatus()).toBe(400);
  });
});

describe('custom topics round trip', () => {
  type Row = { user_id: bigint; expertise: string };
  let rows: Row[];

  beforeEach(() => {
    rows = [];
    jest
      .spyOn(prisma.users, 'findUnique')
      .mockResolvedValue({ userid: 1n } as never);
    jest
      .spyOn(prisma.guests, 'findUnique')
      .mockResolvedValue({ user_id: 1n, profile_image_id: null } as never);
    jest
      .spyOn(prisma.coordinators, 'findUnique')
      .mockResolvedValue({ user_id: 1n, profile_image_id: null } as never);
    jest.spyOn(prisma.user_expertise, 'deleteMany').mockImplementation((() => {
      const count = rows.length;
      rows = [];
      return Promise.resolve({ count });
    }) as never);
    jest.spyOn(prisma.user_expertise, 'createMany').mockImplementation(((args: {
      data: Row[];
    }) => {
      rows.push(...args.data);
      return Promise.resolve({ count: args.data.length });
    }) as never);
    jest
      .spyOn(prisma.user_expertise, 'findMany')
      .mockImplementation((() => Promise.resolve([...rows])) as never);
  });

  afterEach(() => jest.restoreAllMocks());

  const topics = ['ACCOUNTING', ' Supply  Chain ', "R&D / Owner's Tax Credits"];
  const saved = ['Accounting', 'Supply Chain', "R&D / Owner's Tax Credits"];

  it('stores guest lecturer custom topics as expertise rows and reads them back', async () => {
    const service = new GuestSpeakersService();
    const dto = (await pipe.transform(
      guestBody(topics),
      body(GuestExpertiseDto),
    )) as GuestExpertiseDto;

    const afterSave = await service.saveExpertise('auth0|jane', dto);
    const reloaded = await service.findByUserId('auth0|jane');

    expect(rows).toEqual(
      saved.map((expertise) => ({ user_id: 1n, expertise })),
    );
    expect(afterSave?.expertise.selectedTopics).toEqual(saved);
    expect(reloaded?.expertise.selectedTopics).toEqual(saved);
  });

  it('stores unit coordinator custom topics as expertise rows and reads them back', async () => {
    const service = new UnitCoordinatorsService();
    const dto = (await pipe.transform(
      coordinatorBody(topics),
      body(CoordinatorExpertiseDto),
    )) as CoordinatorExpertiseDto;

    await service.saveExpertise('auth0|sam', dto);
    const reloaded = await service.findByUserId('auth0|sam');

    expect(rows).toEqual(
      saved.map((expertise) => ({ user_id: 1n, expertise })),
    );
    expect(reloaded?.expertise.selectedTopics).toEqual(saved);
  });
});
