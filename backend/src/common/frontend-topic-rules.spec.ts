import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CUSTOM_TOPIC_CHARACTERS,
  CUSTOM_TOPIC_MAX_LENGTH,
  CUSTOM_TOPIC_MIN_LENGTH,
  FIXED_EXPERTISE_TOPICS,
  MAX_CUSTOM_TOPICS,
  MAX_TOPICS,
  tidyTopics,
  topicKey,
} from './expertise-topics';

// The frontend helper imports its fixed topic list through the "@/" alias,
// which this package does not map, so that import is answered with the
// frontend's own list file.
jest.mock(
  '@/constants/profileOptions/shared',
  () =>
    jest.requireActual<object>(
      '../../../frontend/src/constants/profileOptions/shared',
    ),
  { virtual: true },
);

interface FrontendTopics {
  withFixedTopicSpelling: (topics: string[]) => string[];
  topicMatchKey: (topic: string) => string;
}
const frontendTopics = jest.requireActual<FrontendTopics>(
  '../../../frontend/src/utils/customTopics',
);

// The frontend is a separate package with no code shared with the backend, so
// it holds its own copy of the topic rules. These tests read the copied values
// as text and run the copied matching code, and fail when either drifts from
// the backend.
const frontend = join(__dirname, '..', '..', '..', 'frontend', 'src');
const sharedOptions = readFileSync(
  join(frontend, 'constants', 'profileOptions', 'shared.ts'),
  'utf8',
);
const customTopics = readFileSync(
  join(frontend, 'utils', 'customTopics.ts'),
  'utf8',
);

function found(match: RegExpExecArray | null, what: string): string {
  if (!match) {
    throw new Error(`${what} was not found in the frontend source`);
  }
  return match[1];
}

function frontendNumber(name: string): number {
  return Number(
    found(
      new RegExp(`export const ${name} = (\\d+);`).exec(customTopics),
      name,
    ),
  );
}

describe('topic rules copied into the frontend', () => {
  it('lists the same fixed topics in the same order', () => {
    const list = found(
      /export const expertiseTopics: string\[\] = \[([^\]]*)\]/.exec(
        sharedOptions,
      ),
      'expertiseTopics',
    );
    const topics = [...list.matchAll(/"([^"]*)"/g)].map((match) => match[1]);

    expect(topics).toEqual([...FIXED_EXPERTISE_TOPICS]);
  });

  it('allows the same number of topics and of custom topics', () => {
    expect(frontendNumber('MAX_TOPICS')).toBe(MAX_TOPICS);
    expect(frontendNumber('MAX_CUSTOM_TOPICS')).toBe(MAX_CUSTOM_TOPICS);
  });

  it('allows the same custom topic length', () => {
    expect(frontendNumber('CUSTOM_TOPIC_MIN_LENGTH')).toBe(
      CUSTOM_TOPIC_MIN_LENGTH,
    );
    expect(frontendNumber('CUSTOM_TOPIC_MAX_LENGTH')).toBe(
      CUSTOM_TOPIC_MAX_LENGTH,
    );
  });

  it('allows the same custom topic characters', () => {
    const literal = /const CUSTOM_TOPIC_CHARACTERS = \/(.+)\/([a-z]*);/.exec(
      customTopics,
    );
    const pattern = new RegExp(found(literal, 'CUSTOM_TOPIC_CHARACTERS'));

    expect(pattern.source).toBe(CUSTOM_TOPIC_CHARACTERS.source);
    expect(literal?.[2]).toBe(CUSTOM_TOPIC_CHARACTERS.flags);
  });
});

describe('topic matching copied into the frontend', () => {
  const inputs = [
    'banking-finance',
    'Banking and Finance',
    'ESG/Sustainability',
    'BANKING & FINANCE',
    'Banking + Finance',
    'Supply/Chain',
    'Supply Chain',
    'AI',
  ];

  // The fixed topic a string is stored as, or null when it is a custom topic.
  const backendFixedTopic = (topic: string) => {
    const [stored] = tidyTopics([topic]) as string[];
    return FIXED_EXPERTISE_TOPICS.includes(stored) ? stored : null;
  };
  const frontendFixedTopic = (topic: string) => {
    const [shown] = frontendTopics.withFixedTopicSpelling([topic]);
    return FIXED_EXPERTISE_TOPICS.includes(shown) ? shown : null;
  };
  // The server compares topics by topicKey once they are stored.
  const backendKey = (topic: string) =>
    topicKey((tidyTopics([topic]) as string[])[0]);

  it('agree on which fixed topic a string is', () => {
    expect(inputs.map(frontendFixedTopic)).toEqual(
      inputs.map(backendFixedTopic),
    );
    expect(inputs.map(backendFixedTopic)).toEqual([
      'Banking & Finance',
      'Banking & Finance',
      'ESG & Sustainability',
      'Banking & Finance',
      null,
      null,
      null,
      null,
    ]);
  });

  it('agree on whether two strings are the same topic', () => {
    const pairs = inputs.flatMap((first) =>
      inputs.map((second): [string, string] => [first, second]),
    );
    const sameOnBackend = pairs.map(
      ([first, second]) => backendKey(first) === backendKey(second),
    );
    const sameOnFrontend = pairs.map(
      ([first, second]) =>
        frontendTopics.topicMatchKey(first) ===
        frontendTopics.topicMatchKey(second),
    );

    expect(sameOnFrontend).toEqual(sameOnBackend);
    expect(backendKey('banking-finance')).toBe(backendKey('BANKING & FINANCE'));
    expect(backendKey('Supply/Chain')).toBe(backendKey('Supply Chain'));
    expect(backendKey('AI')).not.toBe(backendKey('Supply Chain'));
  });
});
