import type {
  AgentDefinition,
  AgentProvenance,
  AgentRole,
  SpecializationFields,
  TemplateDefinition,
  CapabilityReference,
  SchemaDefinition,
  AgentResourceLimits,
} from "./types";
import { M8_LIMITS } from "./limits";
import { validateSpecialization } from "./validation";
import { getTemplate } from "./templates";
import { AgentRegistry } from "./registry";

let specializationCounter = 0;
function generateSpecializationId(): string {
  return `spec-${Date.now()}-${++specializationCounter}-${Math.random().toString(36).slice(2, 9)}`;
}
function nowISO(): string {
  return new Date().toISOString();
}
function generateOperationId(): string {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type SpecializationResult = {
  ok: true;
  definition: AgentDefinition;
} | {
  ok: false;
  issues: string[];
};

export function specializeAgent(
  templateId: string,
  fields: SpecializationFields,
  actor: string,
  registry: AgentRegistry
): SpecializationResult {
  const template = getTemplate(templateId);
  if (!template) {
    return { ok: false, issues: [`Unknown template: ${templateId}`] };
  }

  const validation = validateSpecialization(template, fields);
  if (!validation.valid) {
    return { ok: false, issues: validation.issues.map(i => i.message) };
  }

  if (fields.resourceLimits) {
    const defaults = template.defaultResourceLimits;
    const rl = fields.resourceLimits;
    if (rl.maxConcurrentTasks && rl.maxConcurrentTasks > defaults.maxConcurrentTasks) {
      return { ok: false, issues: ["resource limits cannot exceed template defaults"] };
    }
    if (rl.maxRetries && rl.maxRetries > defaults.maxRetries) {
      return { ok: false, issues: ["resource limits cannot exceed template defaults"] };
    }
    if (rl.timeoutMs && rl.timeoutMs > defaults.timeoutMs) {
      return { ok: false, issues: ["resource limits cannot exceed template defaults"] };
    }
  }

  const resourceLimits: AgentResourceLimits = {
    ...template.defaultResourceLimits,
    ...fields.resourceLimits,
  };

  const capabilities: CapabilityReference[] = fields.allowedSkills
    ? fields.allowedSkills.map(skill => ({ capabilityId: skill, capabilityVersion: 1, required: true }))
    : template.requiredCapabilities;

  const version = `1.0.0`;
  const agentId = generateSpecializationId();
  const operationId = generateOperationId();

  const definition: AgentDefinition = {
    agentId,
    templateId,
    version,
    name: fields.description ?? template.name,
    description: fields.description ?? template.description,
    purpose: fields.purpose ?? template.purpose,
    role: (fields.role as AgentRole) ?? "research",
    specialization: fields,
    capabilities,
    allowedTools: [],
    allowedSkills: fields.allowedSkills ?? [],
    allowedMcpReferences: [],
    inputSchema: { fields: {}, allowUnknown: false },
    outputSchema: fields.outputSchema ?? { fields: {}, allowUnknown: false },
    resourceLimits,
    retryPolicy: { maxRetries: resourceLimits.maxRetries, delayMs: 1000, backoffMultiplier: 2 },
    securityClassification: template.securityClassification,
    permissionRequirements: [],
    dependencies: [],
    provenance: {
      operationId,
      source: "agent-factory",
      actor,
      timestamp: nowISO(),
      templateId,
      templateVersion: template.version,
      specializationHash: "",
    },
    status: "registered",
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  return { ok: true, definition };
}
