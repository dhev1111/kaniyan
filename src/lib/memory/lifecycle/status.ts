/**
 * M5.6 – Memory lifecycle: status transitions and expiry tracking.
 * All transitions are explicit, validated and deterministic.
 */

import { isIsoDate, nowIso } from "../util";
import type { MemoryReference, MemoryStatus } from "../types";

export type LifecycleTransition =
  | "activate"
  | "archive"
  | "expire"
  | "restore"
  | "reject"
  | "supersede";

const VALID_TRANSITIONS: Record<MemoryStatus, readonly MemoryStatus[]> = {
  candidate: ["stored", "rejected"],
  validated: ["stored", "rejected"],
  stored: ["retrievable", "archived", "superseded"],
  retrievable: ["archived", "superseded"],
  archived: ["stored"],
  rejected: [],
  superseded: [],
};

const TERMINAL_STATUSES: readonly MemoryStatus[] = ["rejected", "superseded"];

export function isValidTransition(from: MemoryStatus, to: MemoryStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

export function isTerminalStatus(status: MemoryStatus): boolean {
  return (TERMINAL_STATUSES as readonly MemoryStatus[]).includes(status);
}

export function transitionStatus(
  memory: MemoryReference,
  to: MemoryStatus,
  now?: string
): MemoryReference {
  if (!isValidTransition(memory.status, to)) {
    throw new Error(
      `invalid lifecycle transition: ${memory.status} → ${to}`
    );
  }
  return {
    ...memory,
    status: to,
    updatedAt: nowIso(now),
  };
}

export function activateMemory(memory: MemoryReference, now?: string): MemoryReference {
  return transitionStatus(memory, "stored", now);
}

export function archiveMemory(memory: MemoryReference, now?: string): MemoryReference {
  return transitionStatus(memory, "archived", now);
}

export function expireMemory(memory: MemoryReference, now?: string): MemoryReference {
  return transitionStatus(memory, "superseded", now);
}

export function restoreMemory(memory: MemoryReference, now?: string): MemoryReference {
  return transitionStatus(memory, "stored", now);
}

export function isExpired(memory: MemoryReference, asOf?: string): boolean {
  if (!memory.expiresAt) return false;
  const now = asOf ?? nowIso();
  return now > memory.expiresAt;
}

export function updateLastAccessed(memory: MemoryReference, now?: string): MemoryReference {
  return {
    ...memory,
    lastAccessedAt: nowIso(now),
    updatedAt: nowIso(now),
  };
}

export function daysSince(timestamp: string, asOf?: string): number {
  const now = asOf ? new Date(asOf) : new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
}

export function isActiveStatus(status: MemoryStatus): boolean {
  return status === "stored" || status === "retrievable";
}

export function isArchivedStatus(status: MemoryStatus): boolean {
  return status === "archived";
}