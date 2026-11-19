import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * The CORS settings for the API.
 *
 * A caller may send an Authorization header and a JSON body and nothing else.
 * The correlation id is deliberately not an allowed request header: the API
 * makes every request's id itself and ignores any the caller sends. It is
 * exposed on the response, because a browser hides response headers that are
 * not listed, and a cross-origin caller could not otherwise read the id the
 * API gave its request.
 */
export function corsOptions(allowedOrigins: string[]): CorsOptions {
  return {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: ['X-Correlation-Id'],
    maxAge: 600,
  };
}
