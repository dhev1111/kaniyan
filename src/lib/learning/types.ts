/**
 * M4.5 – Controlled Self-Learning Types
 * KANIYAN learns as a controlled continual-improvement system.
 */

export type MemoryCategory = "episodic" | "semantic" | "procedural";

export type LearningStatus =
  | "candidate"
  | "validated"
  | "active"
  | "rejected"
  | "superseded";

export type LearningOutcome = "success" | "failure" | "partial";

export type FailureCategory =
  | "none"
  | "validation"
  | "execution"
  | "verification"
  | "synthesis"
  | "selection"
  | "external"
  | "unknown";

export interface LearningRecord {
  id: string;
  timestamp: string;
  taskId: string;
  context: string;
  observation: string;
  expectedOutcome: string;
  actualOutcome: string;
  outcome: LearningOutcome;
  lesson: string;
  confidence: number;
  evidenceRefs: string[];
  source: string;
  applicability: string;
  version: number;
  status: LearningStatus;
  memoryCategory: MemoryCategory;
}

export interface EpisodicMemory {
  memoryCategory: "episodic";
  timestamp: string;
  taskId: string;
  context: string;
  actions: string[];
  result: string;
  outcome: LearningOutcome;
  evidence: string[];
}

export interface ValidationEntry {
  timestamp: string;
  result: LearningOutcome;
  note: string;
}

export interface SemanticMemory {
  memoryCategory: "semantic";
  timestamp: string;
  lesson: string;
  confidence: number;
  evidenceRefs: string[];
  applicability: string;
  sourceTasks: string[];
  status: LearningStatus;
}

export interface ProceduralMemory {
  memoryCategory: "procedural";
  timestamp: string;
  strategy: string;
  whenToUse: string;
  expectedResult: string;
  confidence: number;
  validationHistory: ValidationEntry[];
  status: LearningStatus;
}

export type LearningRecordInput = Omit<
  LearningRecord,
  "id" | "version" | "status" | "memoryCategory"
> & {
  memoryCategory?: MemoryCategory;
  status?: LearningStatus;
  version?: number;
};