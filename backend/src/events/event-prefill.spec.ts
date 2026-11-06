import {
  buildPrefill,
  chooseFormat,
  formatsAllowedBy,
  parseDurationMinutes,
  sharedTopicsOf,
  suggestTitle,
  trimTrailingStops,
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
    it('is the discipline and the guest lecturer’s name', () => {
      expect(suggestTitle('Marketing', 'Greta Gray')).toBe(
        'Guest lecture: Marketing with Greta Gray',
      );
      expect(suggestTitle('  Consumer\n behaviour ', ' Greta  Gray ')).toBe(
        'Guest lecture: Consumer behaviour with Greta Gray',
      );
    });

    it('is short, and never the long learning objective', () => {
      const title = buildPrefill({
        matchId: 1n,
        guestProfileId: 2n,
        coordinator: {
          ...coordinator,
          learning_objective:
            'Students will apply consumer behaviour theory to plan, run and evaluate a live campaign for a real client, and explain the ethical choices they made along the way.',
        },
        guest,
        coordinatorTopics: [],
        guestTopics: [],
      }).title;
      expect(title).toBe('Guest lecture: Marketing with Greta Gray');
      expect(title).not.toContain('Students will');
    });

    it('is just the guest lecturer when there is no discipline', () => {
      expect(suggestTitle(null, 'Greta Gray')).toBe(
        'Guest lecture with Greta Gray',
      );
      expect(suggestTitle('   ', 'Greta Gray')).toBe(
        'Guest lecture with Greta Gray',
      );
    });

    it('is never empty, and says so plainly when it knows neither', () => {
      expect(suggestTitle(null, '')).toBe('Guest lecture');
    });

    it('cuts a long discipline at a word and keeps the guest’s name whole', () => {
      const title = suggestTitle('word '.repeat(60), 'Greta Gray');
      expect(title.length).toBeLessThanOrEqual(100);
      expect(title.startsWith('Guest lecture: word word')).toBe(true);
      expect(title.endsWith('word... with Greta Gray')).toBe(true);
    });

    it('stays within 100 characters for any length of discipline or name', () => {
      for (const field of ['', 'a', 'x'.repeat(500), 'word '.repeat(90)]) {
        for (const name of ['', 'Greta', 'Gwendolyn '.repeat(30)]) {
          expect(suggestTitle(field, name).length).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  describe('trimming the end of the learning objective', () => {
    /**
     * The fastest of a few runs, in milliseconds. A slow machine or a busy one
     * can make a single run slow for no reason of the code's own; a quadratic
     * trim takes seconds on every run, so the fastest still shows it.
     */
    const fastest = (run: () => void, runs = 5) => {
      let best = Infinity;
      for (let i = 0; i < runs; i += 1) {
        const started = performance.now();
        run();
        best = Math.min(best, performance.now() - started);
      }
      return best;
    };

    it('removes trailing full stops and whitespace and nothing else', () => {
      expect(trimTrailingStops('Apply theory. ')).toBe('Apply theory');
      expect(trimTrailingStops('Apply theory...')).toBe('Apply theory');
      expect(trimTrailingStops(' . .\n\t. ')).toBe('');
      expect(trimTrailingStops('')).toBe('');
      expect(trimTrailingStops('No stop')).toBe('No stop');
      expect(trimTrailingStops('A. B')).toBe('A. B');
      expect(trimTrailingStops('Costs 3.5')).toBe('Costs 3.5');
    });

    it('takes a 100,000-character run of dots and spaces ending in a letter in under 50 ms', () => {
      const hostile = '. '.repeat(50_000) + 'x';
      expect(hostile).toHaveLength(100_001);
      let prefill: ReturnType<typeof buildPrefill> | undefined;

      const elapsed = fastest(() => {
        expect(trimTrailingStops(hostile)).toBe(hostile);
        prefill = buildPrefill({
          matchId: 1n,
          guestProfileId: 2n,
          coordinator: { ...coordinator, learning_objective: hostile },
          guest,
          coordinatorTopics: [],
          guestTopics: [],
        });
      });

      expect(prefill?.description).toContain('Learning objective: ');
      expect(elapsed).toBeLessThan(50);
    });

    it('is just as quick when the whole text is dots and spaces', () => {
      let prefill: ReturnType<typeof buildPrefill> | undefined;
      const elapsed = fastest(() => {
        prefill = buildPrefill({
          matchId: 1n,
          guestProfileId: 2n,
          coordinator: {
            ...coordinator,
            learning_objective: '. '.repeat(50_000),
          },
          guest,
          coordinatorTopics: [],
          guestTopics: [],
        });
      });
      expect(elapsed).toBeLessThan(50);
      expect(prefill?.description).not.toContain('Learning objective');
    });

    it('is just as quick for a very long discipline in the title', () => {
      let title = '';
      const elapsed = fastest(() => {
        title = suggestTitle('. '.repeat(50_000) + 'x', 'Greta Gray');
      });
      expect(elapsed).toBeLessThan(50);
      expect(title.length).toBeLessThanOrEqual(100);
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
        title: 'Guest lecture: Marketing with Greta Gray',
        description:
          'Guest lecture by Greta Gray, invited by Cara Coord. Learning objective: Apply consumer behaviour theory to a live campaign. Shared topics: Marketing Strategy, Management.',
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
        'Guest lecture by Greta Gray, invited by Cara Coord. Learning objective: Apply consumer behaviour theory to a live campaign.',
      );
    });

    it('keeps the whole learning objective in the description, tidied, with no doubled full stop', () => {
      const { description } = buildPrefill({
        ...input,
        coordinator: {
          ...coordinator,
          learning_objective: '  Apply theory\n to a campaign.  ',
        },
        guestTopics: [],
      });
      expect(description).toBe(
        'Guest lecture by Greta Gray, invited by Cara Coord. Learning objective: Apply theory to a campaign.',
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
          title: 'Guest lecture with Greta',
          format: 'face-to-face',
          durationMinutes: null,
        }),
      );
    });
  });
});
