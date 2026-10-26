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

/** Lower-case words joined by hyphens, which is how a stored code looks. */
const codePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A stored school code as the name people read.
 *
 * A code with no entry becomes its words in title case; a value that is not
 * shaped like a code is already written for people and is returned as stored.
 */
export function facultyLabel(stored: string): string {
  const value = stored.trim();
  const key = value.toLowerCase().replace(/\s+/g, "-");

  if (Object.prototype.hasOwnProperty.call(facultyLabels, key)) {
    return facultyLabels[key];
  }
  if (!codePattern.test(value)) {
    return value;
  }
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
