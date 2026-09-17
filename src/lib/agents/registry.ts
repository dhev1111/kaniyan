import type {
  AgentDefinition,
  AgentDefinitionStatus,
  AgentFactoryLimits,
  CapabilityRequirement,
  SpecializationFields,
} from "./types";
import { M8_LIMITS } from "./limits";
import { validateAgentDefinition, validateSpecialization, detectCycle } from "./validation";
import { validateAgentTransition } from "./state";
import { TEMPLATES, getTemplate } from "./templates";

let agentCounter = 0;
function generateAgentId(): string {
  return `agent-${Date.now()}-${++agentCounter}-${Math.random().toString(36).slice(2, 9)}`;
}
function nowISO(): string {
  return new Date().toISOString();
}
function generateOperationId(): string {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export class AgentRegistry {
  private definitions: Map<string, Map<string, AgentDefinition>> = new Map();
  private activeCount = 0;

  register(definition: AgentDefinition): { ok: true; version: string } | { ok: false; issues: string[] } {
    const validation = validateAgentDefinition(definition);
    if (!validation.valid) {
      return { ok: false, issues: validation.issues.map(i => i.message) };
    }

    const versions = this.definitions.get(definition.templateId) ?? new Map();
    if (versions.has(definition.version)) {
      return { ok: false, issues: [`Duplicate version ${definition.version} for template ${definition.templateId}`] };
    }

    versions.set(definition.version, definition);
    this.definitions.set(definition.templateId, versions);

    if (definition.status === "active") {
      this.activeCount++;
    }

    return { ok: true, version: definition.version };
  }

  get(agentId: string, version?: string): AgentDefinition | undefined {
    for (const versions of this.definitions.values()) {
      for (const def of versions.values()) {
        if (def.agentId === agentId) {
          if (version && def.version !== version) continue;
          return def;
        }
      }
    }
    return undefined;
  }

  list(templateId?: string): AgentDefinition[] {
    const result: AgentDefinition[] = [];
    for (const [tid, versions] of this.definitions) {
      if (templateId && tid !== templateId) continue;
      for (const def of versions.values()) {
        result.push(def);
      }
    }
    return result;
  }

  resolve(goal: string, requirements: CapabilityRequirement[]): AgentDefinition[] {
    const candidates: AgentDefinition[] = [];
    for (const versions of this.definitions.values()) {
      for (const def of versions.values()) {
        if (def.status !== "active") continue;
        const hasAllCapabilities = requirements.every(req =>
          def.capabilities.some(cap =>
            cap.capabilityId === req.capabilityId &&
            (req.capabilityVersion === undefined || cap.capabilityVersion >= req.capabilityVersion)
          )
        );
        if (hasAllCapabilities) {
          candidates.push(def);
        }
      }
    }
    return candidates;
  }

  activate(agentId: string, version: string): boolean {
    const def = this.get(agentId, version);
    if (!def) return false;
    const validation = validateAgentTransition(def.status, "active");
    if (!validation.valid) return false;
    if (def.status === "draft" || def.status === "validating") return false;
    const versions = this.definitions.get(def.templateId) ?? new Map();
    const updated = { ...def, status: "active" as AgentDefinitionStatus, updatedAt: nowISO() };
    versions.set(version, updated);
    this.definitions.set(def.templateId, versions);
    this.activeCount++;
    return true;
  }

  suspend(agentId: string): boolean {
    const def = this.get(agentId);
    if (!def || def.status !== "active") return false;
    const versions = this.definitions.get(def.templateId) ?? new Map();
    const updated = { ...def, status: "suspended" as AgentDefinitionStatus, updatedAt: nowISO() };
    versions.set(def.version, updated);
    this.definitions.set(def.templateId, versions);
    this.activeCount--;
    return true;
  }

  deprecate(agentId: string): boolean {
    const def = this.get(agentId);
    if (!def) return false;
    const validation = validateAgentTransition(def.status, "deprecated");
    if (!validation.valid) return false;
    const versions = this.definitions.get(def.templateId) ?? new Map();
    const updated = { ...def, status: "deprecated" as AgentDefinitionStatus, updatedAt: nowISO() };
    versions.set(def.version, updated);
    this.definitions.set(def.templateId, versions);
    if (def.status === "active") this.activeCount--;
    return true;
  }

  pause(agentId: string): boolean {
    const def = this.get(agentId);
    if (!def || def.status !== "active") return false;
    const validation = validateAgentTransition(def.status, "paused");
    if (!validation.valid) return false;
    const versions = this.definitions.get(def.templateId) ?? new Map();
    const updated = { ...def, status: "paused" as AgentDefinitionStatus, updatedAt: nowISO() };
    versions.set(def.version, updated);
    this.definitions.set(def.templateId, versions);
    this.activeCount--;
    return true;
  }

  retire(agentId: string): boolean {
    const def = this.get(agentId);
    if (!def) return false;
    if (def.status === "active") this.activeCount--;
    const versions = this.definitions.get(def.templateId) ?? new Map();
    const updated = { ...def, status: "retired" as AgentDefinitionStatus, updatedAt: nowISO() };
    versions.set(def.version, updated);
    this.definitions.set(def.templateId, versions);
    return true;
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  getActiveAgents(): AgentDefinition[] {
    const result: AgentDefinition[] = [];
    for (const versions of this.definitions.values()) {
      for (const def of versions.values()) {
        if (def.status === "active") result.push(def);
      }
    }
    return result;
  }
}

export function createAgentRegistry(): AgentRegistry {
  return new AgentRegistry();
}

export const agentRegistry = new AgentRegistry();
