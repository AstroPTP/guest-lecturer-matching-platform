import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  PayloadTooLargeException,
} from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import {
  AttachmentTooLargeInterceptor,
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  dispositionFor,
  downloadHeaders,
  sanitiseFilename,
  validateAttachment,
} from './attachments';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x10, 0, 0, 0]),
  Buffer.from('WEBP'),
  Buffer.from('VP8 '),
]);
const PDF = Buffer.from('%PDF-1.7 1 0 obj <<>> ');
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');
const GIF = Buffer.from('GIF89a......');
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);

function upload(
  bytes: Buffer,
  mimetype: string,
  originalname = 'scan',
): Express.Multer.File {
  return {
    fieldname: 'attachment',
    originalname,
    encoding: '7bit',
    mimetype,
    size: bytes.length,
    buffer: bytes,
  } as Express.Multer.File;
}

describe('validateAttachment', () => {
  it('allows exactly JPEG, PNG, WebP and PDF', () => {
    expect([...ALLOWED_ATTACHMENT_TYPES].sort()).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  });

  it.each([
    ['image/jpeg', JPEG, 'jpg'],
    ['image/png', PNG, 'png'],
    ['image/webp', WEBP, 'webp'],
    ['application/pdf', PDF, 'pdf'],
  ])('accepts a real %s', (mime, bytes, extension) => {
    const result = validateAttachment(upload(bytes, mime, 'document'));

    expect(result.mimeType).toBe(mime);
    expect(result.filename).toBe(`document.${extension}`);
    expect(result.sizeBytes).toBe(bytes.length);
    expect(result.data).toBe(bytes);
  });

  it.each([
    ['an SVG, which can carry script', SVG, 'image/svg+xml'],
    ['an SVG renamed as a PNG', SVG, 'image/png'],
    ['HTML sent as a PDF', HTML, 'application/pdf'],
    ['HTML sent as a JPEG', HTML, 'image/jpeg'],
    ['a PNG sent as a PDF', PNG, 'application/pdf'],
    ['a PDF sent as a PNG', PDF, 'image/png'],
    ['a JPEG sent as a WebP', JPEG, 'image/webp'],
    ['a GIF', GIF, 'image/gif'],
    ['a GIF sent as a PNG', GIF, 'image/png'],
    ['a Windows program sent as a PDF', EXE, 'application/pdf'],
    ['a file with no bytes', Buffer.alloc(0), 'application/pdf'],
    ['a file with no type', PDF, ''],
    ['a file typed as octet-stream', PDF, 'application/octet-stream'],
  ])('refuses %s', (_label, bytes, mime) => {
    expect(() => validateAttachment(upload(bytes, mime))).toThrow(
      BadRequestException,
    );
  });

  it('refuses a PDF that does not start with the PDF marker', () => {
    const late = Buffer.concat([Buffer.from('junk'), PDF]);

    expect(() => validateAttachment(upload(late, 'application/pdf'))).toThrow(
      BadRequestException,
    );
  });

  it('accepts a file of exactly 5MB', () => {
    const bytes = Buffer.concat([
      PDF,
      Buffer.alloc(MAX_ATTACHMENT_BYTES - PDF.length),
    ]);

    expect(validateAttachment(upload(bytes, 'application/pdf')).sizeBytes).toBe(
      MAX_ATTACHMENT_BYTES,
    );
  });

  it('refuses a file one byte over 5MB', () => {
    const bytes = Buffer.concat([
      PDF,
      Buffer.alloc(MAX_ATTACHMENT_BYTES + 1 - PDF.length),
    ]);

    expect(() => validateAttachment(upload(bytes, 'application/pdf'))).toThrow(
      /too large/,
    );
  });

  it('measures the bytes it was given, not the size the request claimed', () => {
    const bytes = Buffer.concat([
      PDF,
      Buffer.alloc(MAX_ATTACHMENT_BYTES + 10 - PDF.length),
    ]);
    const file = { ...upload(bytes, 'application/pdf'), size: 10 };

    expect(() => validateAttachment(file)).toThrow(/too large/);
  });
});

describe('sanitiseFilename', () => {
  it.each([
    ['passport.png', 'image/png', 'passport.png'],
    ['Passport Scan (1).PNG', 'image/png', 'Passport Scan _1_.png'],
    ['../../etc/passwd', 'application/pdf', 'passwd.pdf'],
    ['C:\\Users\\me\\id.jpg', 'image/jpeg', 'id.jpg'],
    ['invoice.html', 'image/png', 'invoice.png'],
    ['evil.php.png', 'image/png', 'evil.php.png'],
    ['.htaccess', 'application/pdf', 'attachment.pdf'],
    ['', 'image/webp', 'attachment.webp'],
    ['no-extension', 'application/pdf', 'no-extension.pdf'],
    [
      'a"b\r\nSet-Cookie: x=1.pdf',
      'application/pdf',
      'a_b__Set-Cookie_ x_1.pdf',
    ],
  ])('turns %j into %j', (original, mime, expected) => {
    expect(sanitiseFilename(original, mime)).toBe(expected);
  });

  it('keeps a long name to a sensible length', () => {
    const name = sanitiseFilename(`${'a'.repeat(500)}.pdf`, 'application/pdf');

    expect(name.length).toBeLessThanOrEqual(84);
    expect(name.endsWith('.pdf')).toBe(true);
  });

  it('only ever produces characters that are safe inside a quoted header value', () => {
    const name = sanitiseFilename(
      "\"; filename*=UTF-8''x\r\n\t\u0000é.pdf",
      'application/pdf',
    );

    expect(name).toMatch(/^[A-Za-z0-9._ -]+$/);
  });

  it('is stable when applied twice', () => {
    const once = sanitiseFilename('Scan (2).jpeg', 'image/jpeg');

    expect(sanitiseFilename(once, 'image/jpeg')).toBe(once);
  });
});

describe('downloadHeaders', () => {
  it('serves the stored type, forbids sniffing and keeps the file private', () => {
    const headers = downloadHeaders({
      mime_type: 'image/png',
      filename: 'id.png',
    });

    expect(headers['Content-Type']).toBe('image/png');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Cache-Control']).toBe('private, no-store');
  });

  it('shows images in the page and makes a PDF a download', () => {
    expect(dispositionFor('image/jpeg')).toBe('inline');
    expect(dispositionFor('image/png')).toBe('inline');
    expect(dispositionFor('image/webp')).toBe('inline');
    expect(dispositionFor('application/pdf')).toBe('attachment');

    expect(
      downloadHeaders({ mime_type: 'image/png', filename: 'id.png' })[
        'Content-Disposition'
      ],
    ).toBe('inline; filename="id.png"');
    expect(
      downloadHeaders({ mime_type: 'application/pdf', filename: 'id.pdf' })[
        'Content-Disposition'
      ],
    ).toBe('attachment; filename="id.pdf"');
  });

  it('makes anything it does not recognise a download, never inline', () => {
    expect(dispositionFor('text/html')).toBe('attachment');
    expect(dispositionFor('image/svg+xml')).toBe('attachment');
  });

  it('cleans a stored name that should never have been stored', () => {
    const headers = downloadHeaders({
      mime_type: 'application/pdf',
      filename: 'x"\r\nSet-Cookie: a=b.pdf',
    });

    expect(headers['Content-Disposition']).not.toMatch(/[\r\n]/);
    expect(headers['Content-Disposition']).toMatch(
      /^attachment; filename="[A-Za-z0-9._ -]+"$/,
    );
  });
});

describe('AttachmentTooLargeInterceptor', () => {
  const interceptor = new AttachmentTooLargeInterceptor();
  const run = (next: CallHandler) =>
    lastValueFrom(interceptor.intercept({} as ExecutionContext, next));

  it('gives the parser’s refusal of a large file the support code and message, keeping the 413', async () => {
    const attempt = run({
      handle: () =>
        throwError(() => new PayloadTooLargeException('File too large')),
    });

    await expect(attempt).rejects.toBeInstanceOf(PayloadTooLargeException);
    await expect(attempt).rejects.toMatchObject({
      response: {
        code: 'SUPPORT_ATTACHMENT_TOO_LARGE',
        message: 'File too large. Max 5MB.',
      },
    });
  });

  it('leaves every other error as it was', async () => {
    const other = new BadRequestException('Unexpected field - file');

    await expect(run({ handle: () => throwError(() => other) })).rejects.toBe(
      other,
    );
  });

  it('passes a successful result through', async () => {
    await expect(run({ handle: () => of('stored') })).resolves.toBe('stored');
  });

  it('says the same thing as the check on the file that reached the service', () => {
    const big = Buffer.concat([PDF, Buffer.alloc(MAX_ATTACHMENT_BYTES)]);
    let message = '';
    try {
      validateAttachment(upload(big, 'application/pdf'));
    } catch (error) {
      message = (error as BadRequestException).message;
    }

    expect(message).toBe('File too large. Max 5MB.');
  });
});
