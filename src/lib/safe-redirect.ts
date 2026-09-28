/**
 * True only for same-site paths like "/account" or "/checkout?step=2".
 * Rejects "//evil.com", "/\evil.com", "@evil.com", "https://…" and anything with
 * whitespace — these could turn "origin + path" into a link to another site.
 */
export function isSafeRedirect(path: string): boolean {
  return /^\/(?![/\\])[^\s\\@]*$/.test(path);
}
