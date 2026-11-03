import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CUSTOM_TOPIC_CHARACTERS,
  CUSTOM_TOPIC_MAX_LENGTH,
  CUSTOM_TOPIC_MIN_LENGTH,
  FIXED_EXPERTISE_TOPICS,
  MAX_CUSTOM_TOPICS,
  MAX_TOPICS,
} from './expertise-topics';

// The frontend is a separate package with no code shared with the backend, so
// it holds its own copy of the topic rules. These tests read those copies as
// text and fail when one drifts from the backend.
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
