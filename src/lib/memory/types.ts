/**
 * M5.1 – Memory domain model.
 * Storage-agnostic concepts for KANIYAN's RAG + long-term memory
 * subsystem. Storage, index and retrieval backends evolve independently
 * behind the interfaces when later milestones implement them.
 */

export type MemoryType =
  | "working"
  | "episodic"
  | "semantic"
  | "procedural"
  | "project";

export type MemorySourceKind =
  | "web"
  | "github"
  | "research"
  | "synthesis"
  | "document"
  | "text"
  | "user"
  | "system"
  | "lesson"
  | "project-artifact"
  | "unknown";

export type MemoryConfidence = "low" | "medium" | "high";

export type MemoryImportance = "low" | "medium" | "high" | "critical";

export type MemoryStatus =
  | "candidate"
  | "validated"
  | "stored"
  | "retrievable"
  | "archived"
  | "rejected"
  | "superseded";

export type MemoryScope = "global" | "project" | "task" | "session";

export type RelationshipKind =
  | "derived_from"
  | "related"
  | "supports"
  | "contradicts"
  | "supersedes"
  | "referenced_by"
  | "part_of";

export type ConflictState = "unresolved" | "resolved" | "superseded";

export interface MemorySource {
  id: string;
  kind: MemorySourceKind;
  title?: string;
  url?: string;
}

export interface MemoryProvenance {
  sourceKind: MemorySourceKind;
  sourceId?: string;
  sourceUrl?: string;
  origin?: string;
  evidence?: string;
  ingestedAt: string;
}

export interface MemoryMetadata {
  scope: MemoryScope;
  projectId?: string;
  taskId?: string;
  sessionId?: string;
  tags: string[];
  language?: string;
  author?: string;
  extra: Record<string, string>;
}

export interface MemoryRelationship {
  targetId: string;
  kind: RelationshipKind;
  strength?: number;
  note?: string;
}

export interface MemoryConflict {
  conflictId: string;
  involvedMemoryIds: string[];
  state: ConflictState;
  detectedAt: string;
  resolutionNote?: string;
}

export interface MemoryVersion {
  memoryId: string;
  version: number;
  content: string;
  confidence: MemoryConfidence;
  status: MemoryStatus;
  changedAt: string;
  changeReason?: string;
}

export interface MemoryReference {
  id: string;
  content: string;
  type: MemoryType;
  source: MemorySource;
  metadata: MemoryMetadata;
  provenance: MemoryProvenance;
  importance: MemoryImportance;
  confidence: MemoryConfidence;
  status: MemoryStatus;
  contentHash: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
  relationships: MemoryRelationship[];
  conflicts: MemoryConflict[];
}

export interface MemoryInput {
  content: string;
  type?: MemoryType;
  source?: MemorySource;
  metadata?: MemoryMetadata;
  provenance: MemoryProvenance;
  confidence?: MemoryConfidence;
  importance?: MemoryImportance;
  status?: MemoryStatus;
  relationships?: MemoryRelationship[];
}

export interface MemoryQuery {
  text?: string;
  limit?: number;
  memoryTypes?: MemoryType[];
  scopes?: MemoryScope[];
  projectIds?: string[];
  taskIds?: string[];
  sessionIds?: string[];
  statuses?: MemoryStatus[];
  tags?: string[];
  confidence?: MemoryConfidence[];
  minImportance?: MemoryImportance;
  sourceKinds?: MemorySourceKind[];
  notBefore?: string;
  notAfter?: string;
  includeArchived?: boolean;
}

export interface MemoryScore {
  memoryId: string;
  relevance: number;
  confidence: number;
  freshness: number;
  importance: number;
  finalScore: number;
  reasons: string[];
}

export interface MemoryResult {
  memory: MemoryReference;
  score?: MemoryScore;
  matchedBy: string[];
}