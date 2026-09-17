import type {
  AgentDefinition,
  CapabilityRequirement,
  SpecializationFields,
  AgentDefinitionStatus,
  SchemaDefinition,
} from "./types";
import { AgentRegistry } from "./registry";
import { M8_LIMITS } from "./limits";
import { validateAgentDefinition } from "./validation";
import { validateAgentTransition } from "./state";
import { getTemplate } from "./templates";
import { specializeAgent } from "./specialization";
import { selectAgents } from "./selection";
import { validateDependencies } from "./dependencies";
import { validateExecutionRequest, validateAgentOutput } from "./execution";
import { AgentAuditLog, createAgentAuditEntry, createAgentFactoryAuditEntry } from "./audit";

export interface FactoryCreateResult {
  readonly ok: true;
  readonly definition: AgentDefinition;
}

export interface FactoryErrorResult {
  readonly ok: false;
  readonly issues: string[];
}

export type FactoryResult = FactoryCreateResult | FactoryErrorResult;

export interface AgentFactoryOptions {
  readonly registry?: AgentRegistry;
  readonly auditLog?: AgentAuditLog;
  readonly online?: boolean;
}

export class AgentFactory {
  private readonly registry: AgentRegistry;
  private readonly auditLog: AgentAuditLog;
  private readonly online: boolean;
  private creationPerProject = new Map<string, number>();
  private creationPerRun = 0;
  private readonly maxCreationPerRun: number;
  private pendingProject = new Map<string, string>();

  constructor(options: AgentFactoryOptions = {}) {
    this.registry = options.registry ?? new AgentRegistry();
    this.auditLog = options.auditLog ?? new AgentAuditLog();
    this.online = options.online ?? true;
    this.maxCreationPerRun = M8_LIMITS.maxAgentCreationPerRun;
  }

  getRegistry(): AgentRegistry {
    return this.registry;
  }

  getAuditLog(): AgentAuditLog {
    return this.auditLog;
  }

  resetRunCounter(): void {
    this.creationPerRun = 0;
  }

  createAgentDefinition(
    templateId: string,
    specialization: SpecializationFields,
    actor: string,
    projectId?: string
  ): FactoryResult {
    const template = getTemplate(templateId);
    if (!template) {
      this.auditLog.append(
        createAgentFactoryAuditEntry("agent.creation.denied", actor, `unknown template ${templateId}`, { status: "failure", templateId })
      );
      return { ok: false, issues: [`Unknown template: ${templateId}`] };
    }

    if (this.creationPerRun >= this.maxCreationPerRun) {
      const msg = `creation per run limit ${this.maxCreationPerRun} exceeded`;
      this.auditLog.append(
        createAgentFactoryAuditEntry("agent.creation.denied", actor, msg, { status: "failure", templateId })
      );
      return { ok: false, issues: [msg] };
    }

    if (projectId) {
      const count = this.creationPerProject.get(projectId) ?? 0;
      if (count >= M8_LIMITS.maxAgentCreationPerProject) {
        const msg = `creation per project limit ${M8_LIMITS.maxAgentCreationPerProject} exceeded for ${projectId}`;
        this.auditLog.append(
          createAgentFactoryAuditEntry("agent.creation.denied", actor, msg, { status: "failure", templateId })
        );
        return { ok: false, issues: [msg] };
      }
    }

    if (this.registry.getActiveCount() >= M8_LIMITS.maxActiveAgents) {
      const msg = `max active agents ${M8_LIMITS.maxActiveAgents} exceeded`;
      this.auditLog.append(
        createAgentFactoryAuditEntry("agent.creation.denied", actor, msg, { status: "failure", templateId })
      );
      return { ok: false, issues: [msg] };
    }

    const specialized = specializeAgent(templateId, specialization, actor, this.registry);
    if (!specialized.ok) {
      this.auditLog.append(
        createAgentFactoryAuditEntry("agent.creation.denied", actor, specialized.issues.join("; "), { status: "failure", templateId })
      );
      return { ok: false, issues: specialized.issues };
    }

    const definition = specialized.definition;

    if (specialization.resourceLimits) {
      const defaults = template.defaultResourceLimits;
      for (const [key, value] of Object.entries(specialization.resourceLimits)) {
        const defVal = defaults[key as keyof typeof defaults];
        if (typeof value === "number" && typeof defVal === "number" && value > defVal) {
          const msg = `resource limit ${key} ${value} exceeds template default ${defVal}`;
          this.auditLog.append(
            createAgentFactoryAuditEntry("agent.creation.denied", actor, msg, { status: "failure", templateId })
          );
          return { ok: false, issues: [msg] };
        }
      }
    }

    if (definition.securityClassification !== template.securityClassification) {
      const msg = "security classification cannot be weakened";
      this.auditLog.append(
        createAgentFactoryAuditEntry("agent.creation.denied", actor, msg, { status: "failure", templateId })
      );
      return { ok: false, issues: [msg] };
    }

    if (projectId) {
      this.pendingProject.set(definition.agentId, projectId);
    }

    this.auditLog.append(
      createAgentFactoryAuditEntry("agent.specialization.requested", actor, `specialized ${templateId} for ${definition.agentId}`, {
        templateId,
      })
    );

    return { ok: true, definition };
  }

  specializeAgent(
    templateId: string,
    fields: SpecializationFields,
    actor: string,
    projectId?: string
  ): FactoryResult {
    return this.createAgentDefinition(templateId, fields, actor, projectId);
  }

  validateAgentDefinition(definition: AgentDefinition): { valid: boolean; issues: string[] } {
    const result = validateAgentDefinition(definition);
    const issues = result.issues.map((i) => i.message);
    if (!result.valid) {
      this.auditLog.append(
        createAgentAuditEntry("agent.validation.completed", definition.agentId, "factory", issues.join("; "), { status: "failure" })
      );
    } else {
      this.auditLog.append(
        createAgentAuditEntry("agent.validation.completed", definition.agentId, "factory", "validation passed")
      );
    }
    return { valid: result.valid, issues };
  }

  registerAgent(definition: AgentDefinition): { ok: true; version: string } | { ok: false; issues: string[] } {
    const validation = validateAgentDefinition(definition);
    if (!validation.valid) {
      return { ok: false, issues: validation.issues.map((i) => i.message) };
    }

    const depCheck = validateDependencies(
      definition.dependencies,
      new Set(this.registry.list().map((d) => d.agentId)),
      definition.agentId
    );
    if (!depCheck.valid) {
      return { ok: false, issues: depCheck.errors };
    }

    const result = this.registry.register(definition);
    if (result.ok) {
      this.creationPerRun++;
      const pid = this.pendingProject.get(definition.agentId);
      if (pid) {
        this.creationPerProject.set(pid, (this.creationPerProject.get(pid) ?? 0) + 1);
        this.pendingProject.delete(definition.agentId);
      }
      this.auditLog.append(
        createAgentAuditEntry("agent.registered", definition.agentId, definition.provenance.actor, `registered ${definition.agentId}@${definition.version}`)
      );
    } else {
      this.auditLog.append(
        createAgentAuditEntry("agent.creation.denied", definition.agentId, "factory", result.issues.join("; "), { status: "failure" })
      );
    }
    return result;
  }

  getAgent(agentId: string, version?: string): AgentDefinition | undefined {
    return this.registry.get(agentId, version);
  }

  listAgents(templateId?: string): AgentDefinition[] {
    return this.registry.list(templateId);
  }

  resolveAgent(goal: string, requirements: CapabilityRequirement[]): AgentDefinition[] {
    const resolved = this.registry.resolve(goal, requirements);
    this.auditLog.append(
      createAgentFactoryAuditEntry("agent.selected", "factory", `resolve goal=${goal} matched=${resolved.length}`, {
        operationId: `resolve-${Date.now()}`,
      })
    );
    return resolved;
  }

  selectAgents(goal: string, requirements: CapabilityRequirement[]): AgentDefinition[] {
    const result = selectAgents(goal, requirements, this.registry);
    return result.agents;
  }

  activateAgent(agentId: string, version: string): boolean {
    const def = this.registry.get(agentId, version);
    if (!def) return false;
    const success = this.registry.activate(agentId, version);
    if (success) {
      this.auditLog.append(createAgentAuditEntry("agent.activated", agentId, "factory", `activated ${agentId}@${version}`));
    }
    return success;
  }

  suspendAgent(agentId: string): boolean {
    const def = this.registry.get(agentId);
    if (!def) return false;
    const transition = validateAgentTransition(def.status, "suspended");
    if (!transition.valid) return false;
    const success = this.registry.suspend(agentId);
    if (success) {
      this.auditLog.append(createAgentAuditEntry("agent.suspended", agentId, "factory", `suspended ${agentId}`));
    }
    return success;
  }

  resumeAgent(agentId: string, version?: string): boolean {
    const def = this.registry.get(agentId);
    if (!def) return false;
    const target = version ?? def.version;
    const transition = validateAgentTransition(def.status, "active");
    if (!transition.valid) return false;
    const success = this.registry.activate(agentId, target);
    if (success) {
      this.auditLog.append(createAgentAuditEntry("agent.resumed", agentId, "factory", `resumed ${agentId}@${target}`));
    }
    return success;
  }

  deprecateAgent(agentId: string): boolean {
    const def = this.registry.get(agentId);
    if (!def) return false;
    const success = this.registry.deprecate(agentId);
    if (success) {
      this.auditLog.append(createAgentAuditEntry("agent.deprecated", agentId, "factory", `deprecated ${agentId}`));
    }
    return success;
  }

  retireAgent(agentId: string): boolean {
    const def = this.registry.get(agentId);
    if (!def) return false;
    if (def.status === "active") return false;
    const success = this.registry.retire(agentId);
    if (success) {
      this.auditLog.append(createAgentAuditEntry("agent.retired", agentId, "factory", `retired ${agentId}`));
    }
    return success;
  }

  validateAgentOutput(output: unknown, schema: SchemaDefinition): { valid: boolean; errors: string[] } {
    return validateAgentOutput(output, schema);
  }

  validateAgentTransition(
    current: AgentDefinitionStatus,
    next: AgentDefinitionStatus
  ): { valid: boolean; error?: string } {
    return validateAgentTransition(current, next);
  }

  getStats(): {
    totalAgents: number;
    activeAgents: number;
    creationPerRun: number;
    creationPerProject: Map<string, number>;
  } {
    return {
      totalAgents: this.registry.list().length,
      activeAgents: this.registry.getActiveCount(),
      creationPerRun: this.creationPerRun,
      creationPerProject: new Map(this.creationPerProject),
    };
  }
}

export function createAgentFactory(options?: AgentFactoryOptions): AgentFactory {
  return new AgentFactory(options);
}
