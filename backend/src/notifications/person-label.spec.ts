import { personLabel } from './person-label';

describe('personLabel', () => {
  it('uses the full name when there is one', () => {
    expect(personLabel({ first_name: 'Ada', last_name: 'Lee' })).toBe(
      'Ada Lee',
    );
  });

  it('uses a first name on its own', () => {
    expect(personLabel({ first_name: 'Ada', last_name: null })).toBe('Ada');
  });

  it('ignores blank name parts and falls back to the role', () => {
    expect(
      personLabel({
        first_name: '  ',
        last_name: '',
        role: ' Senior Lecturer ',
      }),
    ).toBe('Senior Lecturer');
  });

  it('prefers the name to the role', () => {
    expect(
      personLabel({ first_name: 'Ada', last_name: 'Lee', role: 'Lecturer' }),
    ).toBe('Ada Lee');
  });

  it('says "Someone" when the profile has neither', () => {
    expect(personLabel({ first_name: null, role: null })).toBe('Someone');
    expect(personLabel(null)).toBe('Someone');
    expect(personLabel(undefined)).toBe('Someone');
  });
});
