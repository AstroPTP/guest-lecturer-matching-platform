import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { MAX_ATTACHMENT_BYTES, validateAttachment } from './attachments';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

const PDF = Buffer.from('%PDF-1.7 1 0 obj <<>> ');

/**
 * The upload route through the real HTTP stack: the multipart parser, the
 * limits on it and the validation pipe the application uses. The service is
 * replaced, because what is under test is what reaches it.
 */
describe('POST /support/threads/:id/messages (multipart)', () => {
  let app: INestApplication<App>;
  const service = {
    postMine: jest.fn(),
    getAttachment: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SupportController],
      providers: [{ provide: SupportService, useValue: service }],
    }).compile();

    app = moduleRef.createNestApplication();
    // Stands in for the JWT guard, which is registered by AuthModule.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user: unknown }).user = {
        id: 'auth0|alice',
        roles: [],
      };
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    service.postMine.mockReset().mockResolvedValue({ id: '1' });
    service.getAttachment.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('hands the text and the one attached file to the service, for the caller in the token', async () => {
    await request(app.getHttpServer())
      .post('/support/threads/7/messages')
      .field('content', 'Staff card attached')
      .attach('attachment', PDF, {
        filename: 'card.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(service.postMine).toHaveBeenCalledTimes(1);
    const [caller, threadId, content, file] = service.postMine.mock
      .calls[0] as [string, string, string, Express.Multer.File];
    expect(caller).toBe('auth0|alice');
    expect(threadId).toBe('7');
    expect(content).toBe('Staff card attached');
    expect(file.mimetype).toBe('application/pdf');
    expect(file.originalname).toBe('card.pdf');
    expect(file.buffer.equals(PDF)).toBe(true);
  });

  it('accepts text with no file', async () => {
    await request(app.getHttpServer())
      .post('/support/threads/7/messages')
      .field('content', 'Just words')
      .expect(201);

    expect(service.postMine).toHaveBeenCalledWith(
      'auth0|alice',
      '7',
      'Just words',
      undefined,
    );
  });

  it('accepts a file of exactly 5MB', async () => {
    const exact = Buffer.concat([
      PDF,
      Buffer.alloc(MAX_ATTACHMENT_BYTES - PDF.length),
    ]);

    await request(app.getHttpServer())
      .post('/support/threads/7/messages')
      .attach('attachment', exact, {
        filename: 'big.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(service.postMine).toHaveBeenCalledTimes(1);
  });

  it('stops a file over 5MB while it is being read, before the service sees it', async () => {
    const tooBig = Buffer.concat([
      PDF,
      Buffer.alloc(MAX_ATTACHMENT_BYTES + 1 - PDF.length),
    ]);

    await request(app.getHttpServer())
      .post('/support/threads/7/messages')
      .attach('attachment', tooBig, {
        filename: 'big.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);

    expect(service.postMine).not.toHaveBeenCalled();
  });

  it('tells the user the file is too large, in the support error code and message', async () => {
    const tooBig = Buffer.concat([
      PDF,
      Buffer.alloc(MAX_ATTACHMENT_BYTES + 1 - PDF.length),
    ]);

    const response = await request(app.getHttpServer())
      .post('/support/threads/7/messages')
      .attach('attachment', tooBig, {
        filename: 'big.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);

    const body = response.body as { code: string; message: string };
    expect(body.code).toBe('SUPPORT_ATTACHMENT_TOO_LARGE');
    expect(body.message).toBe('File too large. Max 5MB.');
  });

  it('refuses a second file', async () => {
    await request(app.getHttpServer())
      .post('/support/threads/7/messages')
      .attach('attachment', PDF, {
        filename: 'one.pdf',
        contentType: 'application/pdf',
      })
      .attach('attachment', PDF, {
        filename: 'two.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    expect(service.postMine).not.toHaveBeenCalled();
  });

  it('refuses a file sent under any other field name', async () => {
    await request(app.getHttpServer())
      .post('/support/threads/7/messages')
      .attach('file', PDF, {
        filename: 'card.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    expect(service.postMine).not.toHaveBeenCalled();
  });

  it('refuses a field the route does not know', async () => {
    await request(app.getHttpServer())
      .post('/support/threads/7/messages')
      .field('content', 'hi')
      .field('threadId', '8')
      .expect(400);

    expect(service.postMine).not.toHaveBeenCalled();
  });

  it('refuses text over 2000 characters', async () => {
    await request(app.getHttpServer())
      .post('/support/threads/7/messages')
      .field('content', 'x'.repeat(2001))
      .expect(400);

    expect(service.postMine).not.toHaveBeenCalled();
  });

  it('reaches the user with the reason, not a generic message, when a file is refused', async () => {
    service.postMine.mockImplementation(
      (
        _caller: string,
        _id: string,
        _text: string,
        file: Express.Multer.File,
      ) => Promise.resolve(validateAttachment(file)),
    );

    const response = await request(app.getHttpServer())
      .post('/support/threads/7/messages')
      .attach(
        'attachment',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        {
          filename: 'logo.svg',
          contentType: 'image/svg+xml',
        },
      )
      .expect(400);

    const body = response.body as { code: string; message: string };
    expect(body.code).toBe('SUPPORT_ATTACHMENT_INVALID');
    expect(body.message).toBe(
      'Unsupported file. Attach a JPEG, PNG, WebP or PDF.',
    );
  });
});
