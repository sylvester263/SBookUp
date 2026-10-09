import { describe, expect, it, vi } from "vitest";
import { fetchImageForImport } from "./fetch-image.server";

describe("server-side image download guards", () => {
  it("refuses local and private network addresses (no request is made)", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    for (const url of [
      "http://127.0.0.1/a.png",
      "http://localhost/a.png",
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.5/a.png",
      "http://[::1]/a.png",
    ]) {
      expect(await fetchImageForImport(url)).toEqual({
        ok: false,
        message: "That address is not allowed",
      });
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("refuses folder links, other protocols and custom ports", async () => {
    expect((await fetchImageForImport("https://drive.google.com/drive/folders/x")).ok).toBe(false);
    expect(await fetchImageForImport("file:///etc/passwd")).toMatchObject({ ok: false });
    expect(await fetchImageForImport("http://93.184.216.34:8080/a.png")).toEqual({
      ok: false,
      message: "Links with a custom port are not allowed",
    });
  });
  it("checks redirects hop by hop and the content type / size of the answer", async () => {
    const responses: Response[] = [
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/x.png" } }),
    ];
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift()!);
    expect(await fetchImageForImport("http://93.184.216.34/a.png")).toEqual({
      ok: false,
      message: "That address is not allowed",
    });
    responses.push(
      new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    expect(
      (await fetchImageForImport("http://93.184.216.34/a.png")) as { message: string },
    ).toMatchObject({
      ok: false,
      message: expect.stringMatching(/opens a web page, not the image/),
    });
    responses.push(
      new Response(new Uint8Array(5 * 1024 * 1024), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    expect(await fetchImageForImport("http://93.184.216.34/a.png")).toMatchObject({
      ok: false,
      message: expect.stringMatching(/larger than 4 MB/),
    });
    responses.push(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    expect(await fetchImageForImport("http://93.184.216.34/a.png")).toMatchObject({
      ok: true,
      contentType: "image/png",
      bytes: 4,
    });
    spy.mockRestore();
  });
});
