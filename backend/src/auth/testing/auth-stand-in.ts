import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import type { Provider } from '@nestjs/common';
import { APP_ENV } from '../../config/app-env.token';
import type { AppEnv } from '../../config/env.validation';
import { JwtAuthGuard } from '../jwt.guard';
import { JwtStrategy } from '../jwt.strategy';
import { RolesGuard } from '../roles.guard';
import {
  generateKeyPair,
  signToken,
  TEST_AUDIENCE,
  TEST_ROLES_CLAIM,
  type KeyPair,
} from './token-factory';

/**
 * A local stand-in for the Auth0 tenant, so a spec can run a Nest application
 * with the real JwtStrategy, JwtAuthGuard and RolesGuard and nothing mocked.
 *
 * A small HTTP server publishes the key set, the way the guard specs do, and
 * the strategy is pointed at it with the same derivation it uses in production.
 * Tokens are signed with the matching private key, so a request with no token
 * is a real 401 and a token with the wrong role is a real 403.
 *
 *   const auth = await startAuthStandIn();
 *   Test.createTestingModule({
 *     imports: auth.imports,
 *     providers: [...auth.providers, ...],
 *   });
 *   auth.tokenFor(['unit_coordinator'])
 *   await auth.stop();
 */
export interface AuthStandIn {
  imports: [ReturnType<typeof PassportModule.register>];
  /** The strategy and both guards, registered in the order the app registers them. */
  providers: Provider[];
  /** A token the strategy accepts, for these roles. */
  tokenFor: (roles: string[], subject?: string) => string;
  /** A token structurally perfect but signed with a key the tenant does not publish. */
  forgedToken: (roles: string[]) => string;
  stop: () => Promise<void>;
}

export async function startAuthStandIn(): Promise<AuthStandIn> {
  const keys: KeyPair = generateKeyPair();
  const server: Server = createServer((req, res) => {
    if (req.url?.includes('jwks.json')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ keys: [keys.jwk] }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const issuer = `http://127.0.0.1:${port}/`;

  const env = {
    nodeEnv: 'test',
    port: 0,
    allowedOrigins: ['http://localhost:3000'],
    auth0Domain: `127.0.0.1:${port}`,
    auth0Audience: TEST_AUDIENCE,
    auth0RolesClaim: TEST_ROLES_CLAIM,
    databaseUrl: 'postgresql://localhost:5432/test',
    directUrl: 'postgresql://localhost:5432/test',
  } satisfies AppEnv;

  return {
    imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
    providers: [
      { provide: APP_ENV, useValue: env },
      JwtStrategy,
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
    tokenFor: (roles, subject = 'auth0|coord-1') =>
      signToken({ privateKey: keys.privateKey, issuer, subject, roles }),
    forgedToken: (roles) =>
      signToken({
        privateKey: generateKeyPair().privateKey,
        issuer,
        roles,
      }),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
