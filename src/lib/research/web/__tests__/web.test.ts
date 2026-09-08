import {
  validateUrl,
  isAllowedContentType,
  validateResponseSize,
  validateRedirectCount,
  validateWebQuery,
  parseLimit,
  parseUrlsPayload,
  searchWithConfiguredProvider,
  runWebResearch,
} from "../index";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_SEARCH_URL = process.env.KANIYAN_WEB_SEARCH_URL;

function mockFetch(impl: typeof fetch): void {
  (globalThis as { fetch: typeof fetch }).fetch = impl;
}

function restoreFetch(): void {
  (globalThis as { fetch: typeof fetch }).fetch = ORIGINAL_FETCH;
}

const htmlResponse = {
  ok: true,
  status: 200,
  redirected: false,
  headers: { get: () => "text/html" },
  text: () =>
    Promise.resolve("This is a real article about the topic. It has sentences to extract."),
  arrayBuffer: () =>
    Promise.resolve(
      new TextEncoder().encode(
        "<html><head><title>Article</title></head><body>This is a real article about the topic. It has enough detail to extract a claim.</body></html>"
      ).buffer
    ),
} as unknown as Response;

afterEach(() => {
  restoreFetch();
  if (ORIGINAL_SEARCH_URL === undefined) {
    delete process.env.KANIYAN_WEB_SEARCH_URL;
  } else {
    process.env.KANIYAN_WEB_SEARCH_URL = ORIGINAL_SEARCH_URL;
  }
});

describe("M4.4 — URL security validation", () => {
  it("accepts a valid public HTTPS URL and normalizes it", () => {
    const result = validateUrl("https://www.example.com/path");
    expect(result.ok).toBe(true);
    expect(result.normalizedUrl).toContain("https://");
  });

  it("rejects non-HTTPS protocols", () => {
    expect(validateUrl("http://example.com/").ok).toBe(false);
    expect(validateUrl("ftp://example.com/").ok).toBe(false);
  });

  it("rejects dangerous protocols", () => {
    expect(validateUrl("file:///etc/passwd").ok).toBe(false);
    expect(validateUrl("data:text/plain,hello").ok).toBe(false);
    expect(validateUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateUrl("blob:https://example.com/x").ok).toBe(false);
  });

  it("rejects SSRF-sensitive / private-IP targets", () => {
    expect(validateUrl("https://localhost/x").ok).toBe(false);
    expect(validateUrl("https://127.0.0.1/x").ok).toBe(false);
    expect(validateUrl("https://0.0.0.0/").ok).toBe(false);
    expect(validateUrl("https://[::1]/").ok).toBe(false);
    expect(validateUrl("https://10.0.0.1/x").ok).toBe(false);
    expect(validateUrl("https://172.16.0.1/x").ok).toBe(false);
    expect(validateUrl("https://192.168.1.1/x").ok).toBe(false);
    expect(validateUrl("https://169.254.169.254/x").ok).toBe(false);
  });

  it("rejects local / internal hostnames", () => {
    expect(validateUrl("https://foo.local/x").ok).toBe(false);
    expect(validateUrl("https://foo.localhost/x").ok).toBe(false);
    expect(validateUrl("https://foo.internal/x").ok).toBe(false);
  });

  it("rejects malformed URLs and empties", () => {
    expect(validateUrl("not-a-url").ok).toBe(false);
    expect(validateUrl("").ok).toBe(false);
    expect(validateUrl("   ").ok).toBe(false);
  });
});

describe("M4.4 — limits and content types", () => {
  it("enforces response-size limits", () => {
    expect(validateResponseSize(3_000_000).ok).toBe(false);
    expect(validateResponseSize(100).ok).toBe(true);
  });

  it("enforces redirect limits", () => {
    expect(validateRedirectCount(6).ok).toBe(false);
    expect(validateRedirectCount(1).ok).toBe(true);
  });

  it("accepts only allowed content types", () => {
    expect(isAllowedContentType("text/html")).toBe(true);
    expect(isAllowedContentType("text/plain")).toBe(true);
    expect(isAllowedContentType("application/xhtml+xml; charset=utf-8")).toBe(
      true
    );
    expect(isAllowedContentType("application/xml")).toBe(true);
    expect(isAllowedContentType("application/pdf")).toBe(false);
    expect(isAllowedContentType("image/png")).toBe(false);
  });
});

describe("M4.4 — query and limit parsing", () => {
  it("rejects empty and too-long queries", () => {
    expect(validateWebQuery("").ok).toBe(false);
    expect(validateWebQuery("   ").ok).toBe(false);
    expect(validateWebQuery("a".repeat(300)).ok).toBe(false);
    expect(validateWebQuery("valid query").ok).toBe(true);
  });

  it("rejects non-string queries", () => {
    expect(validateWebQuery(undefined).ok).toBe(false);
    expect(validateWebQuery(123).ok).toBe(false);
  });

  it("parseLimit clamps oversized and invalid limits to safe values", () => {
    expect(parseLimit(99999)).toBeLessThanOrEqual(50);
    expect(parseLimit(3)).toBe(3);
    expect(parseLimit("7")).toBe(7);
    expect(parseLimit("garbage")).toBe(6);
  });

  it("parseUrlsPayload validates URLs and enforces the max count", () => {
    const payload = parseUrlsPayload(
      ["https://example.com/1", "http://bad.example/", "https://127.0.0.1/"],
      2
    );
    expect(payload.urls).toEqual(["https://example.com/1"]);
    expect(payload.errors.length).toBe(2);
  });
});

describe("M4.4 — provider-disabled behavior", () => {
  it("fails gracefully when KANIYAN_WEB_SEARCH_URL is unset", async () => {
    delete process.env.KANIYAN_WEB_SEARCH_URL;
    const result = await searchWithConfiguredProvider("test query", 5);
    expect(result.available).toBe(false);
    expect(result.results).toEqual([]);
    expect(result.error).toBeUndefined();
  });
});

describe("M4.4 — provider-enabled behavior (network mocked)", () => {
  it("parses a well-formed provider response into WebSearchResults", async () => {
    process.env.KANIYAN_WEB_SEARCH_URL = "https://provider.example/search";
    mockFetch(
      (() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                results: [
                  { title: "A", url: "https://example.com/1", snippet: "s1" },
                  { title: "B", url: "https://example.com/2", snippet: "s2" },
                ],
              })
            ),
        } as unknown as Response)) as typeof fetch
    );

    const result = await searchWithConfiguredProvider("hello", 5);
    expect(result.available).toBe(true);
    expect(result.results.length).toBe(2);
    expect(result.results[0].url).toBe("https://example.com/1");
  });

  it("fails safely on malformed provider responses", async () => {
    process.env.KANIYAN_WEB_SEARCH_URL = "https://provider.example/search";
    mockFetch(
      (() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("{{ this is not json"),
        } as unknown as Response)) as typeof fetch
    );

    const result = await searchWithConfiguredProvider("hello", 5);
    expect(result.available).toBe(true);
    expect(result.error).toBeDefined();
    expect(result.results).toEqual([]);
  });
});

describe("M4.4 — runWebResearch pipeline (network mocked)", () => {
  it("fetches safe URLs, rejects unsafe ones, and produces a full report", async () => {
    mockFetch((() => Promise.resolve(htmlResponse)) as typeof fetch);

    const report = await runWebResearch({
      query: "test",
      urls: [
        "https://example.com/article",
        "http://insecure.example/",
        "https://127.0.0.1/",
      ],
      limit: 5,
    });

    const fetched = report.sources.filter((s) => s.status === "fetched");
    const failed = report.sources.filter((s) => s.status === "failed");
    expect(fetched.length).toBe(1);
    expect(failed.length).toBe(2);
    expect(report.claims.length).toBeGreaterThanOrEqual(1);
    expect(report.verifications.length).toBe(report.claims.length);
    expect(report.rankedFindings.length).toBe(report.claims.length);
  });

  it("returns empty results when all URLs are unsafe/skipped", async () => {
    mockFetch((() => Promise.resolve(htmlResponse)) as typeof fetch);

    const report = await runWebResearch({
      query: "test",
      urls: ["http://bad.example/", "https://192.168.0.1/"],
      limit: 10,
    });

    expect(report.sources.every((s) => s.status !== "fetched")).toBe(true);
    expect(report.claims.length).toBe(0);
  });
});
