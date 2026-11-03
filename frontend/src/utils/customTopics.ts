import { expertiseTopics } from "@/constants/profileOptions/shared";

// Topics a profile adds beyond the fixed list. The backend applies the same
// rules and refuses a list that breaks them.

export const MAX_TOPICS = 5;
export const MAX_CUSTOM_TOPICS = 3;
export const CUSTOM_TOPIC_MIN_LENGTH = 2;
export const CUSTOM_TOPIC_MAX_LENGTH = 40;
const CUSTOM_TOPIC_CHARACTERS = /^[A-Za-z0-9 &\-/'.]+$/;

// Lower case, with every run of other characters as one hyphen, so
// "Supply Chain" and "supply-chain" count as the same topic.
export function topicKey(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function tidyTopic(topic: string): string {
  return topic.trim().replace(/\s+/g, " ");
}

// Lower-cases A to Z only, as the backend does, so a look-alike such as the
// Kelvin sign is not taken for the "k" of a fixed topic.
function asciiLowerCase(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

// Lower case (A to Z only), with the word "and" and then every & - / ' . and
// space left out, so "banking-finance", "Banking/Finance" and "Banking and
// Finance" all match "Banking & Finance". The backend matches stored topics to
// the fixed list the same way.
function looseTopicKey(topic: string): string {
  return asciiLowerCase(topic).replace(/\band\b/g, "").replace(/[&\-/'.\s]+/g, "");
}

function findFixedTopic(topic: string): string | undefined {
  const key = looseTopicKey(topic);
  return expertiseTopics.find((fixed) => looseTopicKey(fixed) === key);
}

export function isCustomTopic(topic: string): boolean {
  return findFixedTopic(topic) === undefined;
}

// Spells each fixed topic as the list does, whatever older spelling it was
// saved in, and leaves custom topics exactly as stored.
export function withFixedTopicSpelling(topics: string[]): string[] {
  return topics.map((topic) => findFixedTopic(topic) ?? topic);
}

// The form two topics are compared in when filtering, the same sameness rule
// the server uses: a fixed topic by its fixed spelling, any other topic by
// topicKey. "banking-finance" matches "Banking & Finance", and "Supply/Chain"
// matches "Supply Chain".
export function topicMatchKey(topic: string): string {
  return topicKey(findFixedTopic(topic) ?? topic);
}

// Tidies the topics of a saved profile before they go into a form, so a list
// saved under older rules still saves. A fixed topic is spelled as the list
// spells it ("ACCOUNTING" shows as the selected "Accounting" chip), repeats are
// dropped, and the list is cut to the topic limits with fixed topics kept
// first. A custom topic is kept only when customTopicError accepts it on its
// own, so one the backend would refuse (length, characters, no letters or
// numbers) does not block the save. Returns the topics kept and the topics
// dropped, so the person can be told before they save. A topic merged into a
// fixed topic or into an earlier copy of itself is not dropped. The saved
// profile only changes when the person saves.
export function cleanStoredTopics(topics: string[]): { kept: string[]; dropped: string[] } {
  const tidy = topics.map(tidyTopic).filter((topic) => topic !== "");
  const fixed = Array.from(new Set(tidy.map(findFixedTopic).filter((topic): topic is string => topic !== undefined)));
  const seen = new Set(fixed.map(topicKey));
  const custom: string[] = [];
  const refused: string[] = [];
  for (const topic of tidy) {
    const key = topicKey(topic);
    if (findFixedTopic(topic) !== undefined || (key !== "" && seen.has(key))) {
      continue;
    }
    seen.add(key);
    (customTopicError(topic, []) === "" ? custom : refused).push(topic);
  }
  const kept = [...fixed, ...custom.slice(0, MAX_CUSTOM_TOPICS)].slice(0, MAX_TOPICS);
  const overLimit = [...fixed, ...custom].filter((topic) => !kept.includes(topic));
  return { kept, dropped: [...refused, ...overLimit] };
}

export function expertiseWithCleanTopics<T extends { selectedTopics: string[] }>(expertise: T): T {
  return { ...expertise, selectedTopics: cleanStoredTopics(expertise.selectedTopics).kept };
}

// Why a new custom topic cannot be added to the selected ones, or "" if it can.
export function customTopicError(topic: string, selectedTopics: string[]): string {
  if (selectedTopics.filter(isCustomTopic).length >= MAX_CUSTOM_TOPICS) {
    return "You can add up to " + MAX_CUSTOM_TOPICS + " topics of your own.";
  }
  if (selectedTopics.length >= MAX_TOPICS) {
    return "You can select up to " + MAX_TOPICS + " topics.";
  }
  if (topic.length < CUSTOM_TOPIC_MIN_LENGTH || topic.length > CUSTOM_TOPIC_MAX_LENGTH) {
    return "A topic must be " + CUSTOM_TOPIC_MIN_LENGTH + " to " + CUSTOM_TOPIC_MAX_LENGTH + " characters long.";
  }
  if (!CUSTOM_TOPIC_CHARACTERS.test(topic)) {
    return "Use only letters, numbers, spaces and & - / ' .";
  }
  const key = topicKey(topic);
  if (key === "") {
    return "A topic must include a letter or number.";
  }
  const fixedMatch = findFixedTopic(topic) ?? expertiseTopics.find((fixed) => topicKey(fixed) === key);
  if (fixedMatch) {
    return "\"" + fixedMatch + "\" is already in the list. Select it there instead.";
  }
  if (selectedTopics.some((selected) => topicKey(selected) === key)) {
    return "You have already added this topic.";
  }
  return "";
}
