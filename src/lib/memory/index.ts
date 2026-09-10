/**
 * M5 – KANIYAN RAG + long-term memory subsystem.
 * Milestone M5.1 establishes the storage-agnostic domain model,
 * validation and canonical serialization. Later milestones add
 * ingestion, embeddings, retrieval and services.
 */

export { MEMORY_LIMITS } from "./limits";

export {
  clamp01,
  clamp,
  round6,
  round3,
  truncateText,
  fnv1a36,
  memoryId,
  normalizeText,
  isValidHttpUrl,
  nowIso,
  isIsoDate,
} from "./util";

export type {
  MemoryType,
  MemorySourceKind,
  MemoryConfidence,
  MemoryImportance,
  MemoryStatus,
  MemoryScope,
  RelationshipKind,
  ConflictState,
  MemorySource,
  MemoryProvenance,
  MemoryMetadata,
  MemoryRelationship,
  MemoryConflict,
  MemoryVersion,
  MemoryReference,
  MemoryInput,
  MemoryQuery,
  MemoryScore,
  MemoryResult,
} from "./types";

export {
  isMemoryType,
  isMemorySourceKind,
  isMemoryStatus,
  isMemoryConfidence,
  isMemoryImportance,
  isMemoryScope,
  isRelationshipKind,
  validateInput,
  validateQuery,
  constructMemory,
  MemoryValidationError,
  importanceIndex,
  isAtLeastImportance,
  confidenceScore,
} from "./validation";

export type { ValidationIssue, ValidationReport } from "./validation";

export {
  MEMORY_SCHEMA_VERSION,
  serializeDocument,
  serializeMemoryJson,
  parseMemoryJson,
  roundTripMemory,
  SERIALIZATION_MIGRATIONS,
} from "./serialization";

export type {
  MemoryDocument,
  SerializationMigration,
} from "./serialization";

export {
  splitSentences,
  wordWrap,
  chunkText,
} from "./chunking";

export type {
  ChunkOptions,
  TextChunk,
  Sentence,
} from "./chunking";

export {
  ingest,
  ingestSource,
} from "./ingestion";

export type {
  IngestSource,
  IngestOptions,
  IngestRequest,
  IngestResult,
  IngestStats,
  IngestRejection,
  MemoryCandidate,
} from "./ingestion";
