import { randomBytes } from 'node:crypto';

/**
 * Crockford's base32: the digits and the capital letters without I, L, O and
 * U, so an id read aloud or copied by hand cannot be confused with a digit and
 * cannot spell a word.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;

/** 48 bits of milliseconds, the most the ten time characters can hold. */
const MAX_TIME = 2 ** 48 - 1;

/**
 * A ULID: 26 characters, the first ten a millisecond timestamp and the last
 * sixteen random.
 *
 * Used as the request correlation id because, unlike a UUID, two ids sort in
 * the order they were minted, so a run of log lines or audit rows can be
 * ordered by id alone, and the id says roughly when it was made.
 *
 * Ids minted in different milliseconds sort in order. Ids minted in the same
 * millisecond share their time characters and are ordered by the random part,
 * which is to say not at all.
 *
 * @param time milliseconds since the epoch; a parameter so a test can fix it.
 */
export function ulid(time: number = Date.now()): string {
  if (!Number.isInteger(time) || time < 0 || time > MAX_TIME) {
    throw new RangeError('ULID time must be an integer within 48 bits');
  }

  // Most significant character first. 48 bits is past what bitwise operators
  // handle (they work on 32), so the time is peeled off by division.
  let timePart = '';
  for (let remaining = time, i = 0; i < TIME_LENGTH; i += 1) {
    timePart = ALPHABET[remaining % 32] + timePart;
    remaining = Math.floor(remaining / 32);
  }

  // Ten bytes are 80 bits, which is exactly sixteen characters of five bits.
  // Five bits at a time from a BigInt, so no byte boundary is straddled by
  // hand and every character is equally likely.
  let bits = BigInt(`0x${randomBytes(10).toString('hex')}`);
  let randomPart = '';
  for (let i = 0; i < RANDOM_LENGTH; i += 1) {
    randomPart = ALPHABET[Number(bits & 31n)] + randomPart;
    bits >>= 5n;
  }

  return timePart + randomPart;
}
