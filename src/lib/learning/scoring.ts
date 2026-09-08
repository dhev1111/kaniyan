/**
 * M4.5 – Shared deterministic numeric helpers for self-learning.
 */

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function round6(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function truncateText(text: string, max = 160): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 3))}...`;
}