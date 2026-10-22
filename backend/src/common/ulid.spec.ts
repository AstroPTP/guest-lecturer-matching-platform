import { ulid } from './ulid';

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

describe('ulid', () => {
  it('is 26 characters of Crockford base32', () => {
    expect(ulid()).toMatch(ULID_PATTERN);
  });

  it('never uses I, L, O or U', () => {
    const sample = Array.from({ length: 200 }, () => ulid()).join('');
    expect(sample).not.toMatch(/[ILOU]/);
  });

  it('encodes the time in the first ten characters', () => {
    expect(ulid(0).slice(0, 10)).toBe('0000000000');
    expect(ulid(31).slice(0, 10)).toBe('000000000Z');
    expect(ulid(32).slice(0, 10)).toBe('0000000010');
    // 2^48 - 1, the largest time there is, is all ones in every digit.
    expect(ulid(2 ** 48 - 1).slice(0, 10)).toBe('7ZZZZZZZZZ');
  });

  it('decodes back to the time it was given', () => {
    const time = 1_792_000_000_123;
    const decoded = [...ulid(time).slice(0, 10)].reduce(
      (total, char) => total * 32 + ALPHABET.indexOf(char),
      0,
    );
    expect(decoded).toBe(time);
  });

  it('sorts ids from different milliseconds in the order they were made', () => {
    const times = [1, 999, 1_000, 86_400_000, 1_792_000_000_000, 2 ** 48 - 1];
    const ids = times.map((time) => ulid(time));

    expect([...ids].sort()).toEqual(ids);
  });

  it('sorts later ids after earlier ones even when the random part would say otherwise', () => {
    // Fifty pairs a millisecond apart. The random part is independent of the
    // order, so a pair only sorts correctly if the time comes first.
    for (let i = 0; i < 50; i += 1) {
      const base = 1_792_000_000_000 + i * 1_000;
      expect(ulid(base) < ulid(base + 1)).toBe(true);
    }
  });

  it('reads the clock when no time is given', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_792_000_000_000);
    const id = ulid();
    now.mockRestore();

    expect(id.slice(0, 10)).toBe(ulid(1_792_000_000_000).slice(0, 10));
  });

  it('gives two ids in the same millisecond different random parts', () => {
    const ids = new Set(
      Array.from({ length: 1_000 }, () => ulid(1_792_000_000_000).slice(10)),
    );
    expect(ids.size).toBe(1_000);
  });

  it('draws every character of the alphabet in the random part', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      for (const char of ulid(0).slice(10)) seen.add(char);
    }
    expect([...seen].sort().join('')).toBe(ALPHABET);
  });

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['past 48 bits', 2 ** 48],
    ['not a number', Number.NaN],
  ])('refuses a time that is %s', (_label, time) => {
    expect(() => ulid(time)).toThrow(RangeError);
  });
});
