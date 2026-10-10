import { describe, expect, it } from "vitest";
import { normalizeBaseUrl, isConfigured, gateway } from "@/lib/gateway";

describe("gateway adapter", () => {
  it("is not configured with an empty URL", () => {
    expect(isConfigured({ baseUrl: "  ", credentials: "omit" })).toBe(false);
  });
  it("strips trailing slashes and adds a scheme", () => {
    expect(normalizeBaseUrl("acer.ts.net/")).toBe("http://acer.ts.net");
  });
  it("builds preview paths under /api/files/:id/preview", () => {
    expect(gateway.previewUrl({ baseUrl: "https://acer", credentials: "omit" }, "a b")).toBe("https://acer/api/files/a%20b/preview");
  });
});
