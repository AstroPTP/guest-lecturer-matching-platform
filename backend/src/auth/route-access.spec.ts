import 'reflect-metadata';
import {
  ExecutionContext,
  ForbiddenException,
  RequestMethod,
  Type,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { CcaeAdministratorsController } from '../ccae-administrators/ccae-administrators.controller';
import { GuestSpeakersController } from '../guest-speakers/guest-speakers.controller';
import { ImagesController } from '../images/images.controller';
import { UnitCoordinatorsController } from '../unit-coordinators/unit-coordinators.controller';
import { UsersController } from '../users/users.controller';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AppRole } from './roles';
import { RolesGuard } from './roles.guard';

/**
 * Who may reach the routes that handle accounts and profiles.
 *
 * Each row is checked with the real RolesGuard against the metadata the
 * controller actually carries, so deleting a @Roles() decorator turns the
 * matching rows red. A route that is deliberately open to every signed-in user
 * is listed too, so closing one by mistake (a role requirement added to
 * /users/me, say) fails here as well. The last block fails when a route is
 * added to one of these controllers without being listed.
 */

const ANY_SIGNED_IN = 'any signed-in role';
type Access = readonly AppRole[] | typeof ANY_SIGNED_IN;

const ADMIN = [AppRole.CcaeAdmin];
const GUEST = [AppRole.GuestSpeaker];
const COORDINATOR = [AppRole.UnitCoordinator];

interface Row {
  controller: Type<object>;
  handler: string;
  route: string;
  access: Access;
}

/**
 * The routes both profile controllers share: reading your own profile open to
 * any signed-in role, the Discovery list limited to the role on the other side,
 * and the four setup steps limited to the role that owns the profile.
 */
function profileRoutes(
  controller: Type<object>,
  path: string,
  owner: readonly AppRole[],
  browser: readonly AppRole[],
): Row[] {
  const steps = [
    ['saveBasicInformation', 'basic-information'],
    ['saveExpertise', 'expertise'],
    ['saveEngagement', 'engagement'],
    ['saveConsent', 'consent'],
  ];
  return [
    {
      controller,
      handler: 'findMine',
      route: `GET /${path}/me`,
      access: ANY_SIGNED_IN,
    },
    {
      controller,
      handler: 'findAll',
      route: `GET /${path}`,
      access: browser,
    },
    ...steps.map(([handler, step]) => ({
      controller,
      handler,
      route: `PATCH /${path}/me/${step}`,
      access: owner,
    })),
  ];
}

const matrix: Row[] = [
  {
    controller: UsersController,
    handler: 'findAll',
    route: 'GET /users',
    access: ADMIN,
  },
  {
    controller: UsersController,
    handler: 'create',
    route: 'POST /users',
    access: ADMIN,
  },
  {
    controller: UsersController,
    handler: 'me',
    route: 'GET /users/me',
    access: ANY_SIGNED_IN,
  },
  {
    controller: CcaeAdministratorsController,
    handler: 'findAll',
    route: 'GET /ccae-administrators',
    access: ADMIN,
  },
  {
    controller: CcaeAdministratorsController,
    handler: 'create',
    route: 'POST /ccae-administrators',
    access: ADMIN,
  },
  ...profileRoutes(
    GuestSpeakersController,
    'guest-speakers',
    GUEST,
    COORDINATOR,
  ),
  ...profileRoutes(
    UnitCoordinatorsController,
    'unit-coordinators',
    COORDINATOR,
    GUEST,
  ),
  {
    controller: ImagesController,
    handler: 'getImage',
    route: 'GET /images/:id',
    access: ANY_SIGNED_IN,
  },
  {
    controller: ImagesController,
    handler: 'setGuestImage',
    route: 'POST /guest-speakers/me/profile-image',
    access: GUEST,
  },
  {
    controller: ImagesController,
    handler: 'removeGuestImage',
    route: 'DELETE /guest-speakers/me/profile-image',
    access: GUEST,
  },
  {
    controller: ImagesController,
    handler: 'setCoordinatorImage',
    route: 'POST /unit-coordinators/me/profile-image',
    access: COORDINATOR,
  },
  {
    controller: ImagesController,
    handler: 'removeCoordinatorImage',
    route: 'DELETE /unit-coordinators/me/profile-image',
    access: COORDINATOR,
  },
];

const callers: Array<[string, AppRole[]]> = [
  ['a CCAE administrator', [AppRole.CcaeAdmin]],
  ['a guest speaker', [AppRole.GuestSpeaker]],
  ['a unit coordinator', [AppRole.UnitCoordinator]],
  [
    'a guest speaker who is also a unit coordinator',
    [AppRole.GuestSpeaker, AppRole.UnitCoordinator],
  ],
  ['a caller whose token carries no roles', []],
];

function handlerOf(row: Row): object {
  return (row.controller.prototype as Record<string, object>)[row.handler];
}

/** "GET /users/me", read back from the decorators rather than typed twice. */
function routeOf(row: Row): string {
  const method = Reflect.getMetadata(
    METHOD_METADATA,
    handlerOf(row),
  ) as RequestMethod;
  const parts = [
    Reflect.getMetadata(PATH_METADATA, row.controller) as string,
    Reflect.getMetadata(PATH_METADATA, handlerOf(row)) as string,
  ].filter((part) => part && part !== '/');
  return `${RequestMethod[method]} /${parts.join('/')}`;
}

const guard = new RolesGuard(new Reflector());

function contextFor(row: Row, roles: AppRole[]): ExecutionContext {
  return {
    getHandler: () => handlerOf(row),
    getClass: () => row.controller,
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: 'auth0|someone', roles } }),
    }),
  } as unknown as ExecutionContext;
}

describe.each(matrix)('$route', (row) => {
  it(`is the ${row.handler} handler`, () => {
    expect(routeOf(row)).toBe(row.route);
  });

  it('still needs a signed-in caller, because it is not marked public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handlerOf(row))).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, row.controller)).toBeUndefined();
  });

  for (const [caller, roles] of callers) {
    const permitted =
      row.access === ANY_SIGNED_IN ||
      roles.some((held) => (row.access as readonly AppRole[]).includes(held));

    it(`${permitted ? 'admits' : 'refuses'} ${caller}`, () => {
      if (permitted) {
        expect(guard.canActivate(contextFor(row, roles))).toBe(true);
      } else {
        expect(() => guard.canActivate(contextFor(row, roles))).toThrow(
          ForbiddenException,
        );
      }
    });
  }
});

describe('route coverage', () => {
  const controllers = [...new Set(matrix.map((row) => row.controller))];

  it.each(
    controllers.map((controller) => ({ name: controller.name, controller })),
  )(
    'lists every route of $name, so a new route cannot arrive unreviewed',
    ({ controller }) => {
      const handlers = Object.getOwnPropertyNames(controller.prototype).filter(
        (name) => name !== 'constructor',
      );
      const listed = matrix
        .filter((row) => row.controller === controller)
        .map((row) => row.handler);

      expect([...listed].sort()).toEqual([...handlers].sort());
    },
  );
});
