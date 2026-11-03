import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { catchError, Observable, throwError } from 'rxjs';
import { SupportErrorCode } from './support-errors';

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB

const TOO_LARGE_MESSAGE = 'File too large. Max 5MB.';

/**
 * Gives the upload parser's refusal of an oversized file the support error
 * code and message. The parser stops the file while it is still being read, so
 * the error reaches the client without passing through any code of ours, and
 * without a code the global filter replaces it with a generic message.
 *
 * Listed before the file interceptor on a route, so it wraps it. Every other
 * error passes through unchanged.
 */
@Injectable()
export class AttachmentTooLargeInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof PayloadTooLargeException
            ? new PayloadTooLargeException({
                code: SupportErrorCode.AttachmentTooLarge,
                message: TOO_LARGE_MESSAGE,
              })
            : error,
        ),
      ),
    );
  }
}

/**
 * What a file must start with to be the type it claims. Matched against the
 * bytes, because the type a browser reports comes from the file name and
 * anything can be named anything. Same approach as profile photos, plus PDF.
 */
const SIGNATURES: Record<
  string,
  { extension: string; matches: (bytes: Buffer) => boolean }
> = {
  'image/jpeg': {
    extension: 'jpg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  'image/png': {
    extension: 'png',
    matches: (b) =>
      b
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/webp': {
    extension: 'webp',
    matches: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  'application/pdf': {
    extension: 'pdf',
    matches: (b) => b.subarray(0, 5).toString('ascii') === '%PDF-',
  },
};

export const ALLOWED_ATTACHMENT_TYPES = Object.keys(SIGNATURES);

/** The only types a browser may show in the page rather than download. */
const INLINE_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** A file that passed every check, ready to store. */
export interface ValidAttachment {
  data: Buffer;
  mimeType: string;
  filename: string;
  sizeBytes: number;
}

/** Whether the response should ask the browser to save the file. */
export function dispositionFor(mimeType: string): 'inline' | 'attachment' {
  return INLINE_TYPES.has(mimeType) ? 'inline' : 'attachment';
}

/**
 * A name that is safe to store and to put in a header: no path, no quotes, no
 * line breaks, and an extension that matches what the bytes really are, so a
 * PNG uploaded as "invoice.html" is stored as "invoice.png".
 */
export function sanitiseFilename(original: string, mimeType: string): string {
  const extension = SIGNATURES[mimeType]?.extension ?? 'bin';
  // Only what follows the last separator, so "../../etc/passwd" is "passwd".
  const base = original.split(/[\\/]/).pop() ?? '';
  const stem = base
    .replace(/\.[^.]*$/, '')
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .replace(/^[. ]+/, '')
    .slice(0, 80)
    .trim();
  return `${stem || 'attachment'}.${extension}`;
}

/**
 * Refuses anything that is not one JPEG, PNG, WebP or PDF under 5MB.
 *
 * The claimed type must be on the list and the first bytes must agree with it.
 * A script renamed to .png, a PDF sent as an image and an SVG (which can carry
 * script) are all refused here, before anything is stored.
 */
export function validateAttachment(file: Express.Multer.File): ValidAttachment {
  const signature = SIGNATURES[file.mimetype];
  if (!signature || !file.buffer || !signature.matches(file.buffer)) {
    throw new BadRequestException({
      code: SupportErrorCode.AttachmentInvalid,
      message: 'Unsupported file. Attach a JPEG, PNG, WebP or PDF.',
    });
  }
  if (
    file.size > MAX_ATTACHMENT_BYTES ||
    file.buffer.length > MAX_ATTACHMENT_BYTES
  ) {
    throw new BadRequestException({
      code: SupportErrorCode.AttachmentTooLarge,
      message: TOO_LARGE_MESSAGE,
    });
  }
  return {
    data: file.buffer,
    mimeType: file.mimetype,
    filename: sanitiseFilename(file.originalname, file.mimetype),
    sizeBytes: file.buffer.length,
  };
}

/**
 * The response headers for serving a stored file. The name is cleaned again on
 * the way out rather than trusted from the database, because it goes straight
 * into a header.
 */
export function downloadHeaders(attachment: {
  mime_type: string;
  filename: string;
}): Record<string, string> {
  const filename = sanitiseFilename(attachment.filename, attachment.mime_type);
  return {
    'Content-Type': attachment.mime_type,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${dispositionFor(attachment.mime_type)}; filename="${filename}"`,
    'Cache-Control': 'private, no-store',
  };
}
