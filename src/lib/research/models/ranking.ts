import type { AIModelDiscovery } from "./types";
import type { GitHubRepository } from "../github/types";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function computeRepoConfidence(repo: GitHubRepository): number {
  let confidence = 0.3;
  if (repo.language) confidence += 0.1;
  if (repo.description) confidence += 0.1;
  if (repo.license) confidence += 0.05;
  if (repo.stars >= 100) confidence += 0.2;
  else if (repo.stars >= 10) confidence += 0.1;
  if (repo.pushedAt) confidence += 0.1;
  return Math.round(clampScore(confidence) * 10) / 10;
}

export function scoreDiscovery(discovery: AIModelDiscovery): number {
  let score = clampScore(discovery.confidence) * 40;

  if (discovery.repository) {
    const repo = discovery.repository;
    score += (Math.min(repo.stars, 10_000) / 10_000) * 25;
    score += (Math.min(repo.forks, 2_000) / 2_000) * 10;

    const pushedAt = Date.parse(repo.pushedAt);
    if (Number.isFinite(pushedAt)) {
      const days = (Date.now() - pushedAt) / 86_400_000;
      score += Math.max(0, 1 - days / 90) * 15;
    }

    if (repo.archived) score -= 10;
  } else if (discovery.kind === "provider") {
    score += discovery.confidence === 1 ? 20 : 5;
  } else {
    score += 10;
  }

  return Math.round(clampScore(score) * 10) / 10;
}

export function rankDiscoveries(
  discoveries: AIModelDiscovery[]
): AIModelDiscovery[] {
  const sorted = [...discoveries].sort((a, b) => {
    const diff = b.score - a.score;
    if (diff !== 0) return diff;
    return a.title.localeCompare(b.title);
  });
  return sorted.map((discovery, index) => ({
    ...discovery,
    rank: index + 1,
  }));
}