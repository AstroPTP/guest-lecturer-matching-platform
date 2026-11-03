import { registerDecorator, ValidationOptions } from 'class-validator';

/** The topics every profile can pick from. */
export const FIXED_EXPERTISE_TOPICS: readonly string[] = [
  'Accounting',
  'Banking & Finance',
  'Business Analytics',
  'Business Ethics',
  'Corporate Governance',
  'Corporate Law',
  'Economics',
  'Employment Law',
  'Entrepreneurship',
  'Finance & Investment',
  'Human Resource Management',
  'International Business',
  'International Trade Law',
  'Management',
  'Marketing Strategy',
  'Risk Management',
  'Taxation Law',
  'ESG & Sustainability',
];

/** How many topics a profile may list, fixed and custom together. */
export const MAX_TOPICS = 5;
/** How many topics of their own a profile may add to the fixed ones. */
export const MAX_CUSTOM_TOPICS = 3;
export const CUSTOM_TOPIC_MIN_LENGTH = 2;
export const CUSTOM_TOPIC_MAX_LENGTH = 40;
const CUSTOM_TOPIC_CHARACTERS = /^[A-Za-z0-9 &\-/'.]+$/;

/**
 * The form two topics are compared in: lower case, with every run of other
 * characters as one hyphen. "Supply Chain" and "supply-chain" are the same
 * topic, so a profile cannot hold both.
 */
export function topicKey(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Lower-cases A to Z only. String.toLowerCase also folds look-alikes such as
 * the Kelvin sign into "k", which would let them pass as a fixed topic.
 */
function asciiLowerCase(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/**
 * The form a topic is matched to the fixed list in: lower case (A to Z only),
 * with the word "and" and then every & - / ' . and space left out.
 * "banking-finance", "Banking/Finance" and "Banking and Finance" all match
 * "Banking & Finance".
 */
function looseTopicKey(topic: string): string {
  return asciiLowerCase(topic)
    .replace(/\band\b/g, '')
    .replace(/[&\-/'.\s]+/g, '');
}

const FIXED_TOPIC_NAMES = new Set(FIXED_EXPERTISE_TOPICS);
const FIXED_TOPIC_BY_LOOSE_KEY = new Map(
  FIXED_EXPERTISE_TOPICS.map((topic) => [looseTopicKey(topic), topic]),
);
const FIXED_TOPIC_KEYS = new Set(FIXED_EXPERTISE_TOPICS.map(topicKey));

/**
 * Trims each topic, collapses the spaces inside it, and spells a fixed topic
 * as the fixed list does, whatever its letter case, punctuation, spaces or "&"
 * versus "and". "ACCOUNTING" is stored as "Accounting" and "banking-finance"
 * as "Banking & Finance". Values that are not strings are left for the type
 * validators.
 */
export function tidyTopics(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((topic: unknown) => {
    if (typeof topic !== 'string') {
      return topic;
    }
    const tidy = topic.trim().replace(/\s+/g, ' ');
    return FIXED_TOPIC_BY_LOOSE_KEY.get(looseTopicKey(tidy)) ?? tidy;
  });
}

/**
 * Why a topic list cannot be saved, or null when it can. A fixed topic must be
 * spelled exactly as the fixed list spells it, which tidyTopics takes care of.
 * Anything else is a custom topic and has to meet its rules.
 */
export function topicListProblem(topics: readonly unknown[]): string | null {
  const seen = new Set<string>();
  let customCount = 0;

  for (const topic of topics) {
    if (typeof topic !== 'string') {
      continue;
    }
    const key = topicKey(topic);

    if (!FIXED_TOPIC_NAMES.has(topic)) {
      customCount += 1;
      if (
        topic.length < CUSTOM_TOPIC_MIN_LENGTH ||
        topic.length > CUSTOM_TOPIC_MAX_LENGTH
      ) {
        return `has a custom topic that is not ${CUSTOM_TOPIC_MIN_LENGTH} to ${CUSTOM_TOPIC_MAX_LENGTH} characters long`;
      }
      if (!CUSTOM_TOPIC_CHARACTERS.test(topic)) {
        return "has a custom topic with characters other than letters, numbers, spaces and & - / ' .";
      }
      if (key === '') {
        return 'has a custom topic with no letters or numbers';
      }
      if (FIXED_TOPIC_KEYS.has(key)) {
        return 'has a custom topic that repeats a fixed topic';
      }
    }

    if (seen.has(key)) {
      return 'lists the same topic more than once';
    }
    seen.add(key);
  }

  if (customCount > MAX_CUSTOM_TOPICS) {
    return `has more than ${MAX_CUSTOM_TOPICS} custom topics`;
  }
  return null;
}

/** Checks a topic list against the fixed and custom topic rules. */
export function IsExpertiseTopicList(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isExpertiseTopicList',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          !Array.isArray(value) || topicListProblem(value) === null,
        defaultMessage: (args) =>
          `${args?.property ?? propertyName} ${
            topicListProblem(args?.value as unknown[]) ?? 'is not valid'
          }`,
      },
    });
  };
}
