interface Nameable {
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
}

/**
 * What a notice calls a person: their name, else their job title, else
 * "Someone". A profile can be saved with the name left blank, and a sentence
 * such as "<name> sent you a message" should still read properly then.
 */
export function personLabel(person: Nameable | null | undefined): string {
  const name = [person?.first_name, person?.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

  return name || person?.role?.trim() || 'Someone';
}
