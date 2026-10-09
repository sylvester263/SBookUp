// Server-side image download for the bulk importer (staff only, called from
// importFetchImage). Guards: http(s) only, public addresses only (no SSRF into
// private networks), redirects re-checked hop by hop, 15 s timeout, 4 MB cap
// (the reply has to fit in a serverless response), image content types only.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { directImageUrl, isPrivateAddress } from "./image-links";

export const IMAGE_TIMEOUT_MS = 15_000;
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_REDIRECTS = 5;

export type FetchedImage =
  | { ok: true; contentType: string; base64: string; bytes: number; finalUrl: string }
  | { ok: false; message: string };

async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  )
    throw new Error("That address is not allowed");
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new Error("That address is not allowed");
}

export async function fetchImageForImport(raw: string): Promise<FetchedImage> {
  const direct = directImageUrl(raw);
  if ("error" in direct) return { ok: false, message: direct.error };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), IMAGE_TIMEOUT_MS);
  try {
    let url = new URL(direct.url);
    let res: Response | undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (url.protocol !== "https:" && url.protocol !== "http:")
        return { ok: false, message: "Only http(s) links can be downloaded" };
      if (url.port && !["80", "443"].includes(url.port))
        return { ok: false, message: "Links with a custom port are not allowed" };
      await assertPublicHost(url);
      res = await fetch(url, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "user-agent": "SchoolBooksExperts-Importer/1.0", accept: "image/*" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location")!, url);
        continue;
      }
      break;
    }
    if (!res || (res.status >= 300 && res.status < 400))
      return { ok: false, message: "Too many redirects" };
    if (res.status === 404) return { ok: false, message: "Image not found (404)" };
    if (res.status === 401 || res.status === 403)
      return {
        ok: false,
        message: 'The image is not public (access denied). Share it with "Anyone with the link"',
      };
    if (!res.ok) return { ok: false, message: `The image server answered ${res.status}` };
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!TYPES.includes(type)) {
      const hint =
        type === "text/html"
          ? " — the link opens a web page, not the image (Google Drive: the file must be shared publicly)"
          : type.includes("heic")
            ? " — HEIC photos are not supported, convert to JPG"
            : "";
      return {
        ok: false,
        message: `Not a JPG, PNG, WebP or GIF image (${type || "unknown type"})${hint}`,
      };
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > IMAGE_MAX_BYTES)
      return {
        ok: false,
        message: `The image is ${(declared / 1048576).toFixed(1)} MB — the limit is 4 MB. Make it smaller and try again`,
      };
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, message: "Empty response" };
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > IMAGE_MAX_BYTES) {
        await reader.cancel();
        return {
          ok: false,
          message: "The image is larger than 4 MB. Make it smaller and try again",
        };
      }
      chunks.push(value);
    }
    if (!total) return { ok: false, message: "The image file is empty" };
    return {
      ok: true,
      contentType: type,
      base64: Buffer.concat(chunks).toString("base64"),
      bytes: total,
      finalUrl: url.toString(),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (ctrl.signal.aborted)
      return { ok: false, message: "The image took longer than 15 seconds to download" };
    if (/not allowed/.test(msg)) return { ok: false, message: msg };
    if (/ENOTFOUND|EAI_AGAIN/.test(msg))
      return { ok: false, message: "The website in the link was not found" };
    return { ok: false, message: `Download failed: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
