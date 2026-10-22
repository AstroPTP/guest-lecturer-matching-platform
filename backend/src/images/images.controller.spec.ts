import { ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { ImagesController } from './images.controller';
import { ImagesService, MAX_IMAGE_SIZE_BYTES } from './images.service';

/**
 * Runs the controller inside a Nest application with the service replaced, so
 * the upload limits, the route shapes and the response headers are exercised
 * as a browser would meet them. Nothing leaves the process.
 */

const caller: AuthenticatedUser = { id: 'auth0|ann', roles: [] };
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('ImagesController', () => {
  let app: INestApplication<App>;
  const images = {
    get: jest.fn(),
    replaceProfileImage: jest.fn(),
    removeProfileImage: jest.fn(),
  };

  beforeEach(async () => {
    images.replaceProfileImage.mockResolvedValue({ image_id: '5' });
    images.removeProfileImage.mockResolvedValue({ success: true });

    const moduleRef = await Test.createTestingModule({
      controllers: [ImagesController],
      providers: [
        { provide: ImagesService, useValue: images },
        {
          // Stands in for JwtAuthGuard: attaches the verified caller.
          provide: APP_GUARD,
          useValue: {
            canActivate: (context: ExecutionContext) => {
              context
                .switchToHttp()
                .getRequest<{ user: AuthenticatedUser }>().user = caller;
              return true;
            },
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.resetAllMocks();
  });

  describe('serving an image', () => {
    it('sends the stored bytes with their content type', async () => {
      images.get.mockResolvedValue({
        mime_type: 'image/png',
        image_data: PNG_HEAD,
      });

      const res = await request(app.getHttpServer())
        .get('/images/42')
        .expect(200);

      expect(res.headers['content-type']).toContain('image/png');
      expect(Buffer.from(res.body as Buffer).equals(PNG_HEAD)).toBe(true);
      expect(images.get).toHaveBeenCalledWith(42n);
    });

    it('lets only the browser of the person asking cache a photo', async () => {
      images.get.mockResolvedValue({
        mime_type: 'image/png',
        image_data: PNG_HEAD,
      });

      const res = await request(app.getHttpServer()).get('/images/42');

      expect(res.headers['cache-control']).toBe('private, max-age=3600');
    });

    it('answers 400 for an id that is not a number, without a lookup', async () => {
      await request(app.getHttpServer())
        .get('/images/not-a-number')
        .expect(400);
      expect(images.get).not.toHaveBeenCalled();
    });
  });

  describe('changing a profile photo', () => {
    it("uploads to and removes from the signed-in user's own profile, by role", async () => {
      const routes = [
        ['unit-coordinators', 'coordinator'],
        ['guest-speakers', 'guest'],
      ];
      for (const [path, owner] of routes) {
        const res = await request(app.getHttpServer())
          .post(`/${path}/me/profile-image`)
          .attach('file', PNG_HEAD, {
            filename: 'me.png',
            contentType: 'image/png',
          })
          .expect(201);
        expect(res.body).toEqual({ image_id: '5' });
        expect(images.replaceProfileImage).toHaveBeenLastCalledWith(
          owner,
          'auth0|ann',
          expect.objectContaining({
            mimetype: 'image/png',
            originalname: 'me.png',
            size: PNG_HEAD.length,
          }),
        );

        await request(app.getHttpServer())
          .delete(`/${path}/me/profile-image`)
          .expect(200);
        expect(images.removeProfileImage).toHaveBeenLastCalledWith(
          owner,
          'auth0|ann',
        );
      }
    });

    it('ignores a user id sent along with the upload', async () => {
      await request(app.getHttpServer())
        .post('/guest-speakers/me/profile-image')
        .field('user_id', '2')
        .field('auth0Id', 'auth0|ben')
        .attach('file', PNG_HEAD, {
          filename: 'me.png',
          contentType: 'image/png',
        })
        .expect(201);

      expect(images.replaceProfileImage).toHaveBeenCalledWith(
        'guest',
        'auth0|ann',
        expect.anything(),
      );
    });

    it("has no route for changing someone else's photo", async () => {
      await request(app.getHttpServer())
        .post('/guest-speakers/auth0|ben/profile-image')
        .attach('file', PNG_HEAD, { filename: 'me.png' })
        .expect(404);
      await request(app.getHttpServer())
        .delete('/unit-coordinators/2/profile-image')
        .expect(404);
      expect(images.replaceProfileImage).not.toHaveBeenCalled();
      expect(images.removeProfileImage).not.toHaveBeenCalled();
    });
  });

  describe('upload limits', () => {
    it('stops an upload over 5MB with 413 before it reaches the service', async () => {
      await request(app.getHttpServer())
        .post('/guest-speakers/me/profile-image')
        .attach('file', Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1), {
          filename: 'huge.png',
          contentType: 'image/png',
        })
        .expect(413);

      expect(images.replaceProfileImage).not.toHaveBeenCalled();
    });

    it('refuses a request that carries more than one file', async () => {
      await request(app.getHttpServer())
        .post('/guest-speakers/me/profile-image')
        .attach('file', PNG_HEAD, { filename: 'a.png' })
        .attach('file', PNG_HEAD, { filename: 'b.png' })
        .expect(400);

      expect(images.replaceProfileImage).not.toHaveBeenCalled();
    });

    it('refuses a file sent under a field name other than "file"', async () => {
      await request(app.getHttpServer())
        .post('/guest-speakers/me/profile-image')
        .attach('avatar', PNG_HEAD, { filename: 'a.png' })
        .expect(400);

      expect(images.replaceProfileImage).not.toHaveBeenCalled();
    });
  });
});
