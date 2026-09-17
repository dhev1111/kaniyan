import type { AgentDefinition, SpecializationFields, TemplateDefinition, AgentFactoryLimits, AgentDependency, SchemaDefinition, CapabilityReference } from "./types";
import { M8_LIMITS } from "./limits";

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export function validateAgentDefinition(definition: AgentDefinition): { valid: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  if (!definition.agentId || typeof definition.agentId !== "string" || definition.agentId.trim() === "") {
    issues.push({ path: "agentId", message: "agentId must be a non-empty string" });
  }
  if (!definition.templateId || typeof definition.templateId !== "string") {
    issues.push({ path: "templateId", message: "templateId must be a non-empty string" });
  }
  if (!definition.version || typeof definition.version !== "string" || definition.version.trim() === "") {
    issues.push({ path: "version", message: "version must be a non-empty string" });
  }
  if (!definition.name || typeof definition.name !== "string" || definition.name.trim() === "") {
    issues.push({ path: "name", message: "name must be a non-empty string" });
  }
  if (!definition.role) {
    issues.push({ path: "role", message: "role is required" });
  }
  const rl = definition.resourceLimits;
  if (rl.maxConcurrentTasks < 1) issues.push({ path: "resourceLimits.maxConcurrentTasks", message: "must be >= 1" });
  if (rl.maxRetries < 0) issues.push({ path: "resourceLimits.maxRetries", message: "must be >= 0" });
  if (rl.timeoutMs < 1) issues.push({ path: "resourceLimits.timeoutMs", message: "must be >= 1" });
  if (rl.maxMemoryBytes < 1) issues.push({ path: "resourceLimits.maxMemoryBytes", message: "must be >= 1" });
  if (rl.maxContextTokens < 0) issues.push({ path: "resourceLimits.maxContextTokens", message: "must be >= 0" });
  if (rl.maxToolCalls < 0) issues.push({ path: "resourceLimits.maxToolCalls", message: "must be >= 0" });
  if (rl.maxMcpCalls < 0) issues.push({ path: "resourceLimits.maxMcpCalls", message: "must be >= 0" });
  if (rl.maxExecutionTimeMs < 1) issues.push({ path: "resourceLimits.maxExecutionTimeMs", message: "must be >= 1" });
  for (const dep of definition.dependencies) {
    if (dep.agentId === definition.agentId) {
      issues.push({ path: "dependencies", message: "self-dependency detected" });
    }
  }
  for (const cap of definition.capabilities) {
    if (cap.capabilityVersion < 1) {
      issues.push({ path: "capabilities", message: `capabilityVersion must be >= 1 for ${cap.capabilityId}` });
    }
  }
  return { valid: issues.length === 0, issues };
}

export function validateSpecialization(template: TemplateDefinition, fields: SpecializationFields): { valid: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  for (const field of template.forbiddenFields) {
    if (fields[field as keyof SpecializationFields] !== undefined) {
      issues.push({ path: "specialization", message: `field "${field}" is forbidden in template "${template.templateId}"` });
    }
  }
  const allowedFields = template.allowedSpecializationFields;
  for (const key of Object.keys(fields)) {
    if (!allowedFields.includes(key) && fields[key as keyof SpecializationFields] !== undefined) {
      issues.push({ path: "specialization", message: `field "${key}" is not allowed in template "${template.templateId}"` });
    }
  }
  if (fields.resourceLimits) {
    const defaults = template.defaultResourceLimits;
    const rl = fields.resourceLimits;
    if (rl.maxConcurrentTasks && rl.maxConcurrentTasks > defaults.maxConcurrentTasks) {
      issues.push({ path: "specialization.resourceLimits.maxConcurrentTasks", message: "exceeds template default" });
    }
    if (rl.maxRetries && rl.maxRetries > defaults.maxRetries) {
      issues.push({ path: "specialization.resourceLimits.maxRetries", message: "exceeds template default" });
    }
    if (rl.timeoutMs && rl.timeoutMs > defaults.timeoutMs) {
      issues.push({ path: "specialization.resourceLimits.timeoutMs", message: "exceeds template default" });
    }
  }
  return { valid: issues.length === 0, issues };
}

export function validateDependencies(dependencies: AgentDependency[], allAgentIds: Set<string>): { valid: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  for (const dep of dependencies) {
    if (!allAgentIds.has(dep.agentId)) {
      issues.push({ path: "dependencies", message: `missing dependency agent ${dep.agentId}` });
    }
    if (dep.agentId === "") {
      issues.push({ path: "dependencies", message: "self-dependency detected" });
    }
  }
  if (dependencies.length > M8_LIMITS.maxAgentDependencyDepth) {
    issues.push({ path: "dependencies", message: `dependency count exceeds max ${M8_LIMITS.maxAgentDependencyDepth}` });
  }
  return { valid: issues.length === 0, issues };
}

export function detectCycle(dependencies: AgentDependency[], agentId: string): boolean {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function dfs(currentId: string): boolean {
    if (visiting.has(currentId)) return true;
    if (visited.has(currentId)) return false;
    visiting.add(currentId);
    const dep = dependencies.find(d => d.agentId === currentId);
    if (dep) {
      if (dfs(dep.agentId)) return true;
    }
    visiting.delete(currentId);
    visited.add(currentId);
    return false;
  }
  return dfs(agentId);
}
