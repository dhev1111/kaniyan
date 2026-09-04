import type {
  AgentDefinition,
  AgentInstance,
  AgentState,
} from "./types";
import { validateAgentTransition } from "./state-machine";
import { eventBus } from "./events";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

export class AgentRegistry {
  private definitions: Map<string, AgentDefinition> = new Map();
  private instances: Map<string, AgentInstance> = new Map();

  registerDefinition(
    data: Omit<AgentDefinition, "id" | "version" | "createdAt" | "updatedAt">
  ): AgentDefinition {
    const definition: AgentDefinition = {
      ...data,
      id: generateId(),
      version: 1,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.definitions.set(definition.id, definition);
    return definition;
  }

  getDefinition(id: string): AgentDefinition | undefined {
    return this.definitions.get(id);
  }

  getAllDefinitions(): AgentDefinition[] {
    return Array.from(this.definitions.values());
  }

  updateDefinition(
    id: string,
    data: Partial<AgentDefinition>
  ): AgentDefinition | undefined {
    const existing = this.definitions.get(id);
    if (!existing) return undefined;
    const updated: AgentDefinition = {
      ...existing,
      ...data,
      id: existing.id,
      version: existing.version + 1,
      updatedAt: nowISO(),
    };
    this.definitions.set(id, updated);
    return updated;
  }

  spawnInstance(
    definitionId: string,
    projectId?: string
  ): AgentInstance | undefined {
    const definition = this.definitions.get(definitionId);
    if (!definition) return undefined;

    const instance: AgentInstance = {
      id: generateId(),
      definitionId,
      projectId,
      state: "registered",
      retryCount: 0,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };

    this.instances.set(instance.id, instance);

    eventBus.emit("agent.created", instance.id, {
      definitionId,
      projectId: projectId ?? "",
      name: definition.name,
    });

    return instance;
  }

  getInstance(id: string): AgentInstance | undefined {
    return this.instances.get(id);
  }

  getAllInstances(): AgentInstance[] {
    return Array.from(this.instances.values());
  }

  getInstancesByProject(projectId: string): AgentInstance[] {
    return this.getAllInstances().filter(
      (i) => i.projectId === projectId
    );
  }

  getInstancesByDefinition(definitionId: string): AgentInstance[] {
    return this.getAllInstances().filter(
      (i) => i.definitionId === definitionId
    );
  }

  getAvailableInstances(projectId?: string): AgentInstance[] {
    return this.getAllInstances().filter((i) => {
      if (i.state !== "ready") return false;
      if (projectId && i.projectId !== projectId) return false;
      const def = this.definitions.get(i.definitionId);
      if (!def) return false;
      const runningTasks = this.countRunningTasks(i.id);
      return runningTasks < def.maxConcurrentTasks;
    });
  }

  transitionInstance(
    id: string,
    newState: AgentState
  ): { success: boolean; error?: string } {
    const instance = this.instances.get(id);
    if (!instance) {
      return { success: false, error: `Instance ${id} not found` };
    }

    const validation = validateAgentTransition(instance.state, newState);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    instance.state = newState;
    instance.updatedAt = nowISO();

    if (newState === "running") {
      instance.lastActiveAt = nowISO();
    }

    const eventType = `agent.${newState}` as const;
    if (
      [
        "started",
        "paused",
        "resumed",
        "completed",
        "failed",
        "stopped",
      ].includes(newState)
    ) {
      eventBus.emit(eventType, id, {
        definitionId: instance.definitionId,
        projectId: instance.projectId ?? "",
      });
    }

    return { success: true };
  }

  assignTask(
    instanceId: string,
    taskId: string
  ): { success: boolean; error?: string } {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return { success: false, error: `Instance ${instanceId} not found` };
    }
    if (instance.currentTaskId) {
      return {
        success: false,
        error: `Instance ${instanceId} already has task ${instance.currentTaskId}`,
      };
    }
    instance.currentTaskId = taskId;
    instance.updatedAt = nowISO();
    return { success: true };
  }

  releaseTask(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.currentTaskId = undefined;
      instance.updatedAt = nowISO();
    }
  }

  private countRunningTasks(instanceId: string): number {
    const instance = this.instances.get(instanceId);
    return instance?.currentTaskId ? 1 : 0;
  }
}

export const agentRegistry = new AgentRegistry();
