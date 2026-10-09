// Image links from spreadsheets: share links → direct download links. Pure (tested).

export type LinkResult = { url: string } | { error: string };

/**
 * Google Drive  /file/d/<id>/view, open?id=<id>, uc?id=<id>  → uc?export=download&id=<id>
 * Dropbox       ?dl=0                                         → ?dl=1
 * Folder links are rejected (they are not one image).
 */
export function directImageUrl(raw: string): LinkResult {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { error: `"${raw}" is not a web link` };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:")
    return { error: "Only http(s) links can be downloaded" };
  const host = u.hostname.toLowerCase();
  if (host === "drive.google.com" || host === "docs.google.com") {
    if (/\/folders\//.test(u.pathname))
      return { error: "This is a Google Drive folder link — use the link of each image" };
    const id = /\/file\/d\/([\w-]+)/.exec(u.pathname)?.[1] ?? u.searchParams.get("id");
    if (!id)
      return {
        error: "Unrecognised Google Drive link — open the image in Drive and use Share → Copy link",
      };
    return { url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}` };
  }
  if (host === "www.dropbox.com" || host === "dropbox.com") {
    if (/^\/(home|sh)\//.test(u.pathname) && !u.pathname.includes("."))
      return { error: "This is a Dropbox folder link — use the link of each image" };
    u.searchParams.delete("raw");
    u.searchParams.set("dl", "1");
    return { url: u.toString() };
  }
  return { url: u.toString() };
}

/** Public URL prefix of the product-images bucket (images already in our storage are kept as-is). */
export function storagePublicPrefix(supabaseUrl: string, bucket = "product-images"): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/`;
}

export const isOwnStorageUrl = (url: string, prefix: string) => url.startsWith(prefix);

/** Private / local network addresses (SSRF guard for server-side downloads). */
export function isPrivateAddress(ip: string): boolean {
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const s = ip.toLowerCase();
  return (
    s === "::" ||
    s === "::1" ||
    s.startsWith("fc") ||
    s.startsWith("fd") ||
    /^fe[89ab]/.test(s) ||
    s.startsWith("ff")
  );
}
