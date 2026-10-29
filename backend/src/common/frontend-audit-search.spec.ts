import { correlationIdFromSearch } from '../../../frontend/admin/lib/auditSearch';
import { ulid } from './ulid';

/**
 * The administrator portal has no test runner of its own, so the rule that
 * decides whether Audit log search text is a correlation id is pinned here.
 */
describe('correlationIdFromSearch', () => {
  it('recognises an id the API made', () => {
    const id = ulid();

    expect(correlationIdFromSearch(id)).toBe(id);
  });

  it('ignores the spaces around a pasted id', () => {
    expect(correlationIdFromSearch('  01HZX3K9QJ0000000000000000 \n')).toBe(
      '01HZX3K9QJ0000000000000000',
    );
  });

  it('returns a ULID typed in lower case in capitals, the way it is stored', () => {
    expect(correlationIdFromSearch('01hzx3k9qj0000000000000000')).toBe(
      '01HZX3K9QJ0000000000000000',
    );
  });

  it('recognises the UUID the proxy shows when the API is unreachable', () => {
    expect(
      correlationIdFromSearch('C0FFEE00-0000-4000-8000-000000000001'),
    ).toBe('c0ffee00-0000-4000-8000-000000000001');
  });

  it.each([
    ['empty', ''],
    ['a name', 'ann@example.com'],
    ['an action', 'user.signed_in'],
    ['a short word of letters', 'admin'],
    ['a prefix of an id', '01HZX3K9QJ'],
    ['an id with a character on the end', '01HZX3K9QJ00000000000000000'],
    ['an id with a letter Crockford leaves out', '01HZX3K9QJ000000000000000U'],
    ['an id with a space inside', '01HZX3K9QJ 0000000000000000'],
    ['two ids', '01HZX3K9QJ0000000000000000 01HZX3K9QJ0000000000000001'],
  ])('leaves %s as ordinary search text', (_label, text) => {
    expect(correlationIdFromSearch(text)).toBeUndefined();
  });
});
