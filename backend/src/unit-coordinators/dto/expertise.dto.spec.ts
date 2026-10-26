import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { ExpertiseDto, MAX_EXPERTISE_TEXT_LENGTH } from './expertise.dto';

describe('ExpertiseDto', () => {
  // The same options the application applies to every request body.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const body = { type: 'body', metatype: ExpertiseDto } as ArgumentMetadata;

  const valid = {
    selectedTopics: ['Marketing Strategy'],
    experienceLevelsRequired: ['Senior'],
    industryRelevance: 'Retail and consumer marketing',
    learningObjective: 'Apply consumer behaviour theory to a live campaign',
  };

  it('has a ceiling of 2000 characters, far above the 350 the form allows', () => {
    expect(MAX_EXPERTISE_TEXT_LENGTH).toBe(2000);
  });

  it('accepts what the profile form can send', async () => {
    await expect(pipe.transform(valid, body)).resolves.toMatchObject(valid);
    const longest = {
      ...valid,
      industryRelevance: 'x'.repeat(350),
      learningObjective: 'y'.repeat(350),
    };
    await expect(pipe.transform(longest, body)).resolves.toMatchObject(longest);
  });

  it('accepts exactly 2000 characters in each description', async () => {
    const edge = {
      ...valid,
      industryRelevance: 'x'.repeat(2000),
      learningObjective: 'y'.repeat(2000),
    };
    await expect(pipe.transform(edge, body)).resolves.toMatchObject(edge);
  });

  it('refuses a learning objective over 2000 characters', async () => {
    await expect(
      pipe.transform({ ...valid, learningObjective: 'y'.repeat(2001) }, body),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a discipline or industry relevance over 2000 characters', async () => {
    await expect(
      pipe.transform({ ...valid, industryRelevance: 'x'.repeat(2001) }, body),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a huge value without taking long to say so', async () => {
    const started = performance.now();
    await expect(
      pipe.transform(
        { ...valid, learningObjective: '. '.repeat(500_000) + 'x' },
        body,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(performance.now() - started).toBeLessThan(250);
  });

  it('still refuses an empty description', async () => {
    await expect(
      pipe.transform({ ...valid, learningObjective: '' }, body),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
