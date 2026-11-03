/**
 * Readable names for the school or department codes stored on a profile.
 *
 * The values match the options on the profile form in the student app, which
 * this app cannot import, so the list is repeated here.
 */
const facultyLabels: Record<string, string> = {
  "accounting-economics-finance": "School of Accounting, Economics and Finance",
  "management-marketing": "School of Management and Marketing",
  "business-law": "Curtin Law School",
  "information-systems": "Information Systems and Business Analytics",
  other: "Other Faculty of Business and Law area",
};

/** Two or more lower-case words joined by hyphens, which is how an unlisted code looks. */
const codePattern = /^[a-z]+(?:-[a-z]+)+$/;

/**
 * A stored school code as the name people read.
 *
 * Only an exact code is replaced. A code with no entry becomes its words in
 * title case; anything else is free text already written for people and is
 * returned as stored.
 */
export function facultyLabel(stored: string): string {
  if (Object.prototype.hasOwnProperty.call(facultyLabels, stored)) {
    return facultyLabels[stored];
  }
  if (!codePattern.test(stored)) {
    return stored;
  }
  return stored
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
