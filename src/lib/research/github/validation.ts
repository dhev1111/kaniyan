export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const OWNER_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
const REPO_RE = /^[a-zA-Z0-9_.-]{1,100}$/;

export function validateSearchQuery(
  raw: unknown
): ValidationResult<string> {
  if (typeof raw !== "string") {
    return { ok: false, error: "q must be a string" };
  }
  const query = raw.trim();
  if (query.length === 0 || query.length > 128) {
    return {
      ok: false,
      error: "q must be between 1 and 128 characters",
    };
  }
  return { ok: true, value: query };
}

export function validateOwnerRepo(
  owner: unknown,
  repo: unknown
): ValidationResult<{ owner: string; repo: string }> {
  if (typeof owner !== "string" || typeof repo !== "string") {
    return { ok: false, error: "owner and repo must be strings" };
  }

  const trimmedOwner = owner.trim();
  const trimmedRepo = repo.trim();

  if (!OWNER_RE.test(trimmedOwner)) {
    return { ok: false, error: "invalid GitHub owner" };
  }
  if (!REPO_RE.test(trimmedRepo)) {
    return { ok: false, error: "invalid GitHub repository name" };
  }

  return { ok: true, value: { owner: trimmedOwner, repo: trimmedRepo } };
}

export function parsePositiveInt(
  raw: unknown,
  fallback: number,
  max: number
): number {
  if (typeof raw !== "string") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

export function parseGitHubUrl(
  url: string
): ValidationResult<{ owner: string; repo: string }> {
  const match = /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/.exec(
    url.trim()
  );
  if (!match) {
    return { ok: false, error: "only github.com/owner/repo URLs are allowed" };
  }
  return validateOwnerRepo(match[1], match[2]);
}