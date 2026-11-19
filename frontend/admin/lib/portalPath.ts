/**
 * Whether a link from the API stays inside the portal. It must start with a
 * single "/". A browser reads "//" and "/\" as the start of another site, and
 * it drops tabs and line breaks from a link before it reads it, so a backslash
 * or a control character anywhere in the link is refused as well.
 */
export function isPortalPath(href: string): boolean {
  return /^\/(?![/\\])/.test(href) && !/[\u0000-\u001f\u007f\\]/.test(href);
}
