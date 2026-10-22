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

function findFixedTopic(topic: string): string | undefined {
  const name = asciiLowerCase(topic);
  return expertiseTopics.find((fixed) => asciiLowerCase(fixed) === name);
}

export function isCustomTopic(topic: string): boolean {
  return findFixedTopic(topic) === undefined;
}

// Spells each fixed topic as the list does, so a topic saved as "ACCOUNTING"
// shows as the selected "Accounting" chip.
export function withFixedTopicSpelling(topics: string[]): string[] {
  return topics.map((topic) => findFixedTopic(topic) ?? topic);
}

export function expertiseWithFixedTopicSpelling<T extends { selectedTopics: string[] }>(expertise: T): T {
  return { ...expertise, selectedTopics: withFixedTopicSpelling(expertise.selectedTopics) };
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
  const fixedMatch = expertiseTopics.find((fixed) => topicKey(fixed) === key);
  if (fixedMatch) {
    return "\"" + fixedMatch + "\" is already in the list. Select it there instead.";
  }
  if (selectedTopics.some((selected) => topicKey(selected) === key)) {
    return "You have already added this topic.";
  }
  return "";
}
