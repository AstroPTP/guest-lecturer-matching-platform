import {
  buildPrefill,
  chooseFormat,
  formatsAllowedBy,
  parseDurationMinutes,
  sharedTopicsOf,
  suggestTitle,
  type CoordinatorSide,
  type GuestSide,
} from './event-prefill';

const none = {
  format_online: false,
  format_inperson: false,
  format_prerecorded: false,
};

describe('event prefill', () => {
  const coordinator: CoordinatorSide = {
    first_name: 'Cara',
    last_name: 'Coord',
    learning_objective: 'Apply consumer behaviour theory to a live campaign',
    discipline: 'Marketing',
    duration: '90-minutes',
    location: 'Building 402, Room 201',
    ...none,
    format_inperson: true,
    format_online: true,
  };
  const guest: GuestSide = {
    first_name: 'Greta',
    last_name: 'Gray',
    ...none,
    format_online: true,
  };

  describe('format', () => {
    it('lists what a profile allows in the form’s order', () => {
      expect(
        formatsAllowedBy({
          format_online: true,
          format_inperson: true,
          format_prerecorded: true,
        }),
      ).toEqual(['face-to-face', 'online', 'pre-recorded']);
      expect(formatsAllowedBy({ ...none, format_prerecorded: true })).toEqual([
        'pre-recorded',
      ]);
      expect(
        formatsAllowedBy({
          format_online: null,
          format_inperson: null,
          format_prerecorded: null,
        }),
      ).toEqual([]);
    });

    it('picks the one format both allow', () => {
      expect(chooseFormat(coordinator, guest)).toBe('online');
    });

    it('picks the first shared format when several are shared', () => {
      const both = { ...none, format_inperson: true, format_online: true };
      expect(chooseFormat(both, both)).toBe('face-to-face');
    });

    it('falls back to the coordinator’s own choice when nothing is shared', () => {
      expect(
        chooseFormat(
          { ...none, format_inperson: true },
          { ...none, format_prerecorded: true },
        ),
      ).toBe('face-to-face');
      expect(
        chooseFormat(
          { ...none, format_online: true, format_prerecorded: true },
          { ...none, format_inperson: true },
        ),
      ).toBe('online');
    });

    it('uses the coordinator’s choice when the guest has set none', () => {
      expect(chooseFormat({ ...none, format_prerecorded: true }, none)).toBe(
        'pre-recorded',
      );
    });

    it('is face-to-face when neither has set any', () => {
      expect(chooseFormat(none, none)).toBe('face-to-face');
    });
  });

  describe('duration', () => {
    it.each([
      ['30-minutes', 30],
      ['60-minutes', 60],
      ['90-minutes', 90],
      ['2-hours', 120],
      ['1.5-hours', 90],
      ['45 minutes', 45],
      [' 1-hour ', 60],
    ])('reads %s as %i minutes', (value, minutes) => {
      expect(parseDurationMinutes(value)).toBe(minutes);
    });

    it.each(['flexible', '', '0-minutes', 'a while', null, undefined])(
      'gives no length for %p',
      (value) => {
        expect(parseDurationMinutes(value)).toBeNull();
      },
    );
  });

  describe('topics', () => {
    it('keeps the topics both chose, in the coordinator’s order and spelling', () => {
      expect(
        sharedTopicsOf(
          ['Marketing Strategy', 'Management', 'Economics'],
          ['economics', 'MARKETING STRATEGY', 'Accounting'],
        ),
      ).toEqual(['Marketing Strategy', 'Economics']);
    });

    it('has none in common', () => {
      expect(sharedTopicsOf(['Accounting'], ['Economics'])).toEqual([]);
      expect(sharedTopicsOf([], ['Economics'])).toEqual([]);
    });

    it('lists a topic once', () => {
      expect(sharedTopicsOf(['Economics', 'economics'], ['Economics'])).toEqual(
        ['Economics'],
      );
    });
  });

  describe('title', () => {
    it('is the learning objective', () => {
      expect(suggestTitle('  Apply theory\n to a campaign ', 'Marketing')).toBe(
        'Apply theory to a campaign',
      );
    });

    it('is the discipline when there is no objective', () => {
      expect(suggestTitle(null, 'Marketing')).toBe('Guest lecture: Marketing');
      expect(suggestTitle('   ', 'Marketing')).toBe('Guest lecture: Marketing');
    });

    it('is empty when there is neither', () => {
      expect(suggestTitle(null, null)).toBe('');
    });

    it('cuts a long objective at a word', () => {
      const title = suggestTitle('word '.repeat(60), null);
      expect(title.length).toBeLessThanOrEqual(100);
      expect(title.endsWith('word...')).toBe(true);
    });
  });

  describe('the whole suggestion', () => {
    const input = {
      matchId: 6007n,
      guestProfileId: 3002n,
      coordinator,
      guest,
      coordinatorTopics: ['Marketing Strategy', 'Management'],
      guestTopics: ['Management', 'Marketing Strategy', 'Economics'],
    };

    it('fills every field from the stored details', () => {
      expect(buildPrefill(input)).toEqual({
        matchId: '6007',
        guestLecturerId: '3002',
        guestLecturerName: 'Greta Gray',
        coordinatorName: 'Cara Coord',
        title: 'Apply consumer behaviour theory to a live campaign',
        description:
          'Guest lecture by Greta Gray, invited by Cara Coord. Shared topics: Marketing Strategy, Management.',
        format: 'online',
        location: 'Building 402, Room 201',
        durationMinutes: 90,
        sharedTopics: ['Marketing Strategy', 'Management'],
      });
    });

    it('names both people even with no topics in common', () => {
      const { description, sharedTopics } = buildPrefill({
        ...input,
        guestTopics: ['Economics'],
      });
      expect(sharedTopics).toEqual([]);
      expect(description).toBe(
        'Guest lecture by Greta Gray, invited by Cara Coord.',
      );
    });

    it('leaves the end time open when the coordinator is flexible', () => {
      expect(
        buildPrefill({
          ...input,
          coordinator: { ...coordinator, duration: 'flexible' },
        }).durationMinutes,
      ).toBeNull();
    });

    it('says Online for an online session when the coordinator has no location', () => {
      expect(
        buildPrefill({
          ...input,
          coordinator: { ...coordinator, location: null },
        }).location,
      ).toBe('Online');
    });

    it('leaves the location empty for a face-to-face session with none stored', () => {
      expect(
        buildPrefill({
          ...input,
          coordinator: { ...coordinator, location: ' ' },
          guest: { ...guest, ...none, format_inperson: true },
        }),
      ).toEqual(
        expect.objectContaining({ format: 'face-to-face', location: '' }),
      );
    });

    it('copes with profiles that are mostly empty', () => {
      const prefill = buildPrefill({
        ...input,
        coordinator: {
          ...none,
          first_name: null,
          last_name: null,
          learning_objective: null,
          discipline: null,
          duration: null,
          location: null,
        },
        guest: { ...none, first_name: 'Greta', last_name: null },
        coordinatorTopics: [],
        guestTopics: [],
      });
      expect(prefill).toEqual(
        expect.objectContaining({
          coordinatorName: 'the coordinator',
          guestLecturerName: 'Greta',
          title: '',
          format: 'face-to-face',
          durationMinutes: null,
        }),
      );
    });
  });
});
