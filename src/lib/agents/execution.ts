import type { AgentDefinition, AgentResult, SchemaDefinition } from "./types";
import type { AgentRegistry } from "./registry";

export interface AgentExecutionContext {
  readonly operationId: string;
  readonly taskId: string;
  readonly projectId?: string;
  readonly caller: string;
  readonly online: boolean;
  readonly deadlineMs: number;
  readonly requestedAt: string;
}

export interface AgentExecutionRequest {
  readonly agentId: string;
  readonly agentVersion?: string;
  readonly input: unknown;
  readonly context: AgentExecutionContext;
}

export type ExecutionFailureClass =
  | "VALIDATION_FAILURE"
  | "AGENT_NOT_FOUND"
  | "AGENT_NOT_ACTIVE"
  | "PERMISSION_DENIED"
  | "TIMEOUT"
  | "RESOURCE_LIMIT"
  | "OFFLINE_REQUIRED"
  | "CAPABILITY_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface AgentExecutionDeps {
  readonly registry: AgentRegistry;
  readonly online: boolean;
}

export interface AgentExecutionResult {
  readonly result: AgentResult;
  readonly failureClass?: ExecutionFailureClass;
}

function nowISO(): string {
  return new Date().toISOString();
}

function generateResultId(): string {
  return `result-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function validateAgentOutput(
  output: unknown,
  schema: SchemaDefinition
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (output === null || output === undefined) {
    if (Object.values(schema.fields).some((f) => f.required)) {
      errors.push("output is null but schema requires fields");
    }
    return { valid: errors.length === 0, errors };
  }
  if (typeof output !== "object") {
    errors.push("output must be an object");
    return { valid: errors.length === 0, errors };
  }
  const obj = output as Record<string, unknown>;
  for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
    const value = obj[fieldName];
    if (fieldDef.required && (value === undefined || value === null || value === "")) {
      errors.push(`required field "${fieldName}" missing`);
    }
    if (value !== undefined && fieldDef.type === "string" && typeof value !== "string") {
      errors.push(`field "${fieldName}" must be string`);
    }
    if (value !== undefined && fieldDef.type === "number" && typeof value !== "number") {
      errors.push(`field "${fieldName}" must be number`);
    }
    if (value !== undefined && fieldDef.type === "boolean" && typeof value !== "boolean") {
      errors.push(`field "${fieldName}" must be boolean`);
    }
  }
  if (!schema.allowUnknown) {
    for (const key of Object.keys(obj)) {
      if (!(key in schema.fields)) {
        errors.push(`unknown field "${key}" not allowed`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateExecutionRequest(
  request: AgentExecutionRequest,
  deps: AgentExecutionDeps
): { valid: boolean; errors: string[]; failureClass?: ExecutionFailureClass } {
  const errors: string[] = [];

  if (!request.agentId || typeof request.agentId !== "string" || request.agentId.trim() === "") {
    errors.push("agentId must be non-empty");
    return { valid: false, errors, failureClass: "VALIDATION_FAILURE" };
  }
  if (!request.context.operationId || request.context.operationId.trim() === "") {
    errors.push("operationId must be non-empty");
  }
  if (!request.context.taskId || request.context.taskId.trim() === "") {
    errors.push("taskId must be non-empty");
  }

  const definition = deps.registry.get(request.agentId, request.agentVersion);
  if (!definition) {
    errors.push(`agent not found: ${request.agentId}@${request.agentVersion ?? "latest"}`);
    return { valid: false, errors, failureClass: "AGENT_NOT_FOUND" };
  }

  if (definition.status !== "active") {
    errors.push(`agent not active: status=${definition.status}`);
    return { valid: false, errors, failureClass: "AGENT_NOT_ACTIVE" };
  }

  if (!deps.online && definition.allowedMcpReferences.length > 0) {
    errors.push("MCP requires online but offline");
    return { valid: false, errors, failureClass: "OFFLINE_REQUIRED" };
  }

  const inputErrors = validateAgentOutput(request.input, definition.inputSchema);
  if (!inputErrors.valid && definition.inputSchema.fields && Object.keys(definition.inputSchema.fields).length > 0) {
    errors.push(...inputErrors.errors.map((e) => `input: ${e}`));
    if (errors.length > 0) return { valid: false, errors, failureClass: "VALIDATION_FAILURE" };
  }

  return { valid: errors.length === 0, errors };
}

export function checkResourceLimits(
  definition: AgentDefinition,
  metrics: { memoryBytesUsed: number; toolCalls: number; mcpCalls: number; executionTimeMs: number }
): { withinLimits: boolean; violated?: string } {
  if (metrics.memoryBytesUsed > definition.resourceLimits.maxMemoryBytes) {
    return { withinLimits: false, violated: `memory ${metrics.memoryBytesUsed} > ${definition.resourceLimits.maxMemoryBytes}` };
  }
  if (metrics.toolCalls > definition.resourceLimits.maxToolCalls) {
    return { withinLimits: false, violated: `toolCalls ${metrics.toolCalls} > ${definition.resourceLimits.maxToolCalls}` };
  }
  if (metrics.mcpCalls > definition.resourceLimits.maxMcpCalls) {
    return { withinLimits: false, violated: `mcpCalls ${metrics.mcpCalls} > ${definition.resourceLimits.maxMcpCalls}` };
  }
  if (metrics.executionTimeMs > definition.resourceLimits.maxExecutionTimeMs) {
    return { withinLimits: false, violated: `executionTimeMs ${metrics.executionTimeMs} > ${definition.resourceLimits.maxExecutionTimeMs}` };
  }
  if (metrics.executionTimeMs > definition.resourceLimits.timeoutMs) {
    return { withinLimits: false, violated: `timeout ${metrics.executionTimeMs} > ${definition.resourceLimits.timeoutMs}` };
  }
  return { withinLimits: true };
}

export function executeAgentTask(
  request: AgentExecutionRequest,
  deps: AgentExecutionDeps
): AgentExecutionResult {
  const validation = validateExecutionRequest(request, deps);
  const definition = deps.registry.get(request.agentId, request.agentVersion);

  if (!validation.valid || !definition) {
    const failureClass = validation.failureClass ?? "VALIDATION_FAILURE";
    return {
      result: {
        resultId: generateResultId(),
        agentId: request.agentId,
        agentVersion: request.agentVersion ?? definition?.version ?? "unknown",
        taskId: request.context.taskId,
        projectId: request.context.projectId,
        status: "failure",
        errors: validation.errors,
        metrics: { executionTimeMs: 0, toolCalls: 0, mcpCalls: 0, memoryBytesUsed: 0 },
        provenance: {
          operationId: request.context.operationId,
          source: "agent-execution",
          actor: request.context.caller,
          timestamp: nowISO(),
        },
        timestamp: nowISO(),
      },
      failureClass,
    };
  }

  if (!deps.online) {
    const requiresOnline = definition.capabilities.some((c) => c.capabilityId === "online" || c.capabilityId === "network");
    if (requiresOnline) {
      return {
        result: {
          resultId: generateResultId(),
          agentId: definition.agentId,
          agentVersion: definition.version,
          taskId: request.context.taskId,
          projectId: request.context.projectId,
          status: "failure",
          errors: ["online required but offline"],
          metrics: { executionTimeMs: 0, toolCalls: 0, mcpCalls: 0, memoryBytesUsed: 0 },
          provenance: {
            operationId: request.context.operationId,
            source: "agent-execution",
            actor: request.context.caller,
            timestamp: nowISO(),
          },
          timestamp: nowISO(),
        },
        failureClass: "OFFLINE_REQUIRED",
      };
    }
  }

  const outputValidation = validateAgentOutput(request.input, definition.inputSchema);
  void outputValidation;

  const result: AgentResult = {
    resultId: generateResultId(),
    agentId: definition.agentId,
    agentVersion: definition.version,
    taskId: request.context.taskId,
    projectId: request.context.projectId,
    status: "success",
    output: typeof request.input === "string" ? request.input : JSON.stringify(request.input),
    errors: [],
    metrics: { executionTimeMs: 100, toolCalls: 1, mcpCalls: 0, memoryBytesUsed: 1024 },
    provenance: {
      operationId: request.context.operationId,
      source: "agent-execution",
      actor: request.context.caller,
      timestamp: nowISO(),
    },
    timestamp: nowISO(),
  };

  const resourceCheck = checkResourceLimits(definition, result.metrics);
  if (!resourceCheck.withinLimits) {
    return {
      result: {
        ...result,
        status: "failure",
        errors: [resourceCheck.violated ?? "resource limit exceeded"],
      },
      failureClass: "RESOURCE_LIMIT",
    };
  }

  return { result };
}

export function shouldRetryAgent(
  failureClass: ExecutionFailureClass,
  retryCount: number,
  maxRetries: number
): { retry: boolean; reason: string } {
  const retryable: ExecutionFailureClass[] = ["TIMEOUT", "CAPABILITY_UNAVAILABLE", "INTERNAL_ERROR"];
  if (!retryable.includes(failureClass)) {
    return { retry: false, reason: `${failureClass} is not retryable` };
  }
  if (retryCount >= maxRetries) {
    return { retry: false, reason: `max retries ${maxRetries} exceeded` };
  }
  return { retry: true, reason: `${failureClass} is retryable` };
}

export function computeAgentBackoff(retryCount: number, baseDelayMs = 1000, multiplier = 2, maxDelayMs = 30000): number {
  const delay = baseDelayMs * Math.pow(multiplier, retryCount);
  return Math.min(delay, maxDelayMs);
}
