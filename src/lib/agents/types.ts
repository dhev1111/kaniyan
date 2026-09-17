export type AgentDefinitionStatus =
  | "draft"
  | "validating"
  | "registered"
  | "active"
  | "paused"
  | "suspended"
  | "deprecated"
  | "retired"
  | "rejected";

export type AgentRole =
  | "research"
  | "architecture"
  | "coding"
  | "testing"
  | "security"
  | "review"
  | "documentation"
  | "analytics"
  | "skill";

export type SecurityClassification =
  | "public"
  | "internal"
  | "confidential"
  | "restricted";

export interface SchemaDefinition {
  readonly fields: Record<string, { type: string; required: boolean }>;
  readonly allowUnknown: boolean;
}

export interface CapabilityReference {
  readonly capabilityId: string;
  readonly capabilityVersion: number;
  readonly required: boolean;
}

export interface CapabilityRequirement {
  readonly capabilityId: string;
  readonly capabilityVersion?: number;
  readonly required?: boolean;
}

export interface AgentResourceLimits {
  readonly maxConcurrentTasks: number;
  readonly maxRetries: number;
  readonly timeoutMs: number;
  readonly maxMemoryBytes: number;
  readonly maxContextTokens: number;
  readonly maxToolCalls: number;
  readonly maxMcpCalls: number;
  readonly maxExecutionTimeMs: number;
}

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly delayMs: number;
  readonly backoffMultiplier: number;
}

export interface AgentProvenance {
  readonly operationId: string;
  readonly source: "agent-factory";
  readonly actor: string;
  readonly timestamp: string;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly specializationHash: string;
}

export interface AgentDependency {
  readonly agentId: string;
  readonly version: string;
  readonly relationship: "requires" | "depends-on";
}

export interface PermissionRequirement {
  readonly resource: string;
  readonly action: string;
  readonly effect: "allow" | "deny" | "ask";
}

export interface SpecializationFields {
  readonly role?: string;
  readonly description?: string;
  readonly purpose?: string;
  readonly domain?: string;
  readonly taskConstraints?: string[];
  readonly allowedSkills?: string[];
  readonly outputSchema?: SchemaDefinition;
  readonly resourceLimits?: Partial<AgentResourceLimits>;
}

export interface TemplateDefinition {
  readonly templateId: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly purpose: string;
  readonly allowedSpecializationFields: string[];
  readonly forbiddenFields: string[];
  readonly defaultResourceLimits: AgentResourceLimits;
  readonly securityClassification: SecurityClassification;
  readonly requiredCapabilities: CapabilityReference[];
}

export interface AgentDefinition {
  readonly agentId: string;
  readonly templateId: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly purpose: string;
  readonly role: AgentRole;
  readonly specialization: SpecializationFields;
  readonly capabilities: CapabilityReference[];
  readonly allowedTools: string[];
  readonly allowedSkills: string[];
  readonly allowedMcpReferences: string[];
  readonly inputSchema: SchemaDefinition;
  readonly outputSchema: SchemaDefinition;
  readonly resourceLimits: AgentResourceLimits;
  readonly retryPolicy: RetryPolicy;
  readonly securityClassification: SecurityClassification;
  readonly permissionRequirements: PermissionRequirement[];
  readonly dependencies: AgentDependency[];
  readonly provenance: AgentProvenance;
  readonly status: AgentDefinitionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgentResult {
  readonly resultId: string;
  readonly agentId: string;
  readonly agentVersion: string;
  readonly taskId: string;
  readonly projectId?: string;
  readonly status: "success" | "failure" | "timeout" | "cancelled";
  readonly output?: string;
  readonly artifacts?: string[];
  readonly evidence?: string[];
  readonly provenance: {
    readonly operationId: string;
    readonly source: string;
    readonly actor: string;
    readonly timestamp: string;
  };
  readonly errors: string[];
  readonly metrics: {
    readonly executionTimeMs: number;
    readonly toolCalls: number;
    readonly mcpCalls: number;
    readonly memoryBytesUsed: number;
  };
  readonly timestamp: string;
}

export interface AgentMessage {
  readonly messageId: string;
  readonly correlationId: string;
  readonly senderAgentId: string;
  readonly senderVersion: string;
  readonly recipientAgentId: string;
  readonly taskId?: string;
  readonly projectId?: string;
  readonly timestamp: string;
  readonly messageType: "request" | "response" | "event" | "notification";
  readonly payload: unknown;
  readonly provenance: {
    readonly operationId: string;
    readonly source: string;
    readonly actor: string;
    readonly timestamp: string;
  };
}

export interface AgentFactoryLimits {
  readonly maxActiveAgents: number;
  readonly maxAgentDepth: number;
  readonly maxAgentCreationPerProject: number;
  readonly maxAgentCreationPerRun: number;
  readonly maxAgentDependencyDepth: number;
  readonly maxTotalAgentTasks: number;
  readonly maxAgentRetries: number;
}
