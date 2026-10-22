import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';

describe('ImagesController.getImage', () => {
  const caller: AuthenticatedUser = { id: 'auth0|me', roles: [] };
  const bytes = new Uint8Array([1, 2, 3]);

  function setup(getVisibleTo: jest.Mock) {
    const controller = new ImagesController({
      getVisibleTo,
    } as unknown as ImagesService);
    const res = { setHeader: jest.fn(), send: jest.fn() };
    return { controller, res, response: res as unknown as Response };
  }

  it('asks the service on behalf of the signed-in caller, not the id in the URL', async () => {
    const getVisibleTo = jest.fn().mockResolvedValue({
      mime_type: 'image/png',
      image_data: bytes,
    });
    const { controller, response } = setup(getVisibleTo);

    await controller.getImage('42', caller, response);

    expect(getVisibleTo).toHaveBeenCalledWith(42n, 'auth0|me');
  });

  it('sends the stored type and bytes, cached privately', async () => {
    const { controller, res, response } = setup(
      jest
        .fn()
        .mockResolvedValue({ mime_type: 'image/webp', image_data: bytes }),
    );

    await controller.getImage('42', caller, response);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/webp');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, max-age=3600',
    );
    expect(res.send).toHaveBeenCalledWith(bytes);
  });

  it('sends nothing when the service says the image is missing or hidden', async () => {
    const { controller, res, response } = setup(
      jest.fn().mockRejectedValue(new NotFoundException('Image not found')),
    );

    await expect(
      controller.getImage('42', caller, response),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('refuses an id that is not a number before asking the service', async () => {
    const getVisibleTo = jest.fn();
    const { controller, response } = setup(getVisibleTo);

    await expect(
      controller.getImage('abc', caller, response),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(getVisibleTo).not.toHaveBeenCalled();
  });
});
