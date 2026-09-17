export type {
  AgentDefinitionStatus,
  AgentRole,
  SecurityClassification,
  SchemaDefinition,
  CapabilityReference,
  CapabilityRequirement,
  AgentResourceLimits,
  RetryPolicy,
  AgentProvenance,
  AgentDependency,
  PermissionRequirement,
  SpecializationFields,
  TemplateDefinition,
  AgentDefinition,
  AgentResult,
  AgentMessage,
  AgentFactoryLimits,
} from "./types";

export { M8_LIMITS } from "./limits";
export type { M8Limits } from "./limits";

export type { ValidationIssue } from "./validation";
export {
  validateAgentDefinition,
  validateSpecialization,
  validateDependencies,
  detectCycle,
} from "./validation";

export {
  validateAgentTransition,
  canTransitionAgent,
  getAllowedAgentTransitions,
  isPrivilegedTransition,
} from "./state";

export { TEMPLATES, DEFAULT_RESOURCE_LIMITS, getTemplate, listTemplates } from "./templates";

export { AgentRegistry, createAgentRegistry, agentRegistry } from "./registry";

export type { SpecializationResult } from "./specialization";
export { specializeAgent } from "./specialization";

export type { SelectionResult } from "./selection";
export { selectAgents } from "./selection";

export type { DependencyValidationResult, DependencyGraph } from "./dependencies";
export {
  buildDependencyGraph,
  detectCycleInGraph,
  computeDependencyDepth,
  validateDependencies as validateAgentDependencies,
  validateAgentDependencies as validateAgentDependenciesFull,
  resolveDependencyOrder,
  getTransitiveDependencies,
} from "./dependencies";

export { MAX_MESSAGE_PAYLOAD_SIZE, MAX_MESSAGE_PAYLOAD_CHARS } from "./messaging";
export type { MessageValidationResult } from "./messaging";
export {
  validateAgentMessage,
  createAgentMessage,
  isMessagePayloadSafe,
  sanitizeMessagePayload,
} from "./messaging";

export type {
  AgentExecutionContext,
  AgentExecutionRequest,
  ExecutionFailureClass,
  AgentExecutionDeps,
  AgentExecutionResult,
} from "./execution";
export {
  validateAgentOutput,
  validateExecutionRequest,
  checkResourceLimits,
  executeAgentTask,
  shouldRetryAgent,
  computeAgentBackoff,
} from "./execution";

export type { LifecycleResult, SuspensionState } from "./lifecycle";
export {
  canAgentReceiveWork,
  isAgentSuspended,
  isAgentRetired,
  isAgentAvailableForNewTasks,
  suspendAgent,
  resumeAgent,
  pauseAgent,
  deprecateAgent,
  retireAgent,
  getSuspensionState,
  clearSuspensionState,
  getAgentLifecycleSummary,
} from "./lifecycle";

export type { FactoryCreateResult, FactoryErrorResult, FactoryResult, AgentFactoryOptions } from "./factory";
export { AgentFactory, createAgentFactory } from "./factory";

export type { AgentAuditAction } from "./audit";
export { AgentAuditLog, createAgentAuditEntry, createAgentFactoryAuditEntry } from "./audit";

export type { AgentMemoryContext, AgentMemoryAttribution } from "./memory";
export {
  createAgentMemoryContext,
  recallAgentContext,
  ingestAgentResult,
  getAgentMemory,
  reviseAgentMemory,
  validateAgentMemoryInput,
  createAgentMemoryAttribution,
} from "./memory";
