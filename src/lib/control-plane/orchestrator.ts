import type {
  AgentDefinition,
  AgentInstance,
  Run,
  TaskDefinition,
  RetryPolicy,
} from "./types";
import { validateRunTransition } from "./state-machine";
import { eventBus } from "./events";
import { agentRegistry } from "./registry";
import { taskQueue } from "./task-queue";
import { getExecutor, initializeDefaultExecutors } from "./executor";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30000,
};

export class Orchestrator {
  private runs: Map<string, Run> = new Map();
  private retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY;
  private processing = false;

  constructor() {
    initializeDefaultExecutors();
  }

  setRetryPolicy(policy: Partial<RetryPolicy>): void {
    this.retryPolicy = { ...this.retryPolicy, ...policy };
  }

  getRetryPolicy(): RetryPolicy {
    return { ...this.retryPolicy };
  }

  submitTask(
    taskData: Omit<
      TaskDefinition,
      "id" | "state" | "retryCount" | "createdAt" | "updatedAt"
    >
  ): TaskDefinition {
    const task = taskQueue.createTask(taskData);
    taskQueue.enqueueTask(task.id);
    return task;
  }

  async assignTask(
    taskId: string,
    agentInstanceId: string
  ): Promise<{ success: boolean; error?: string; run?: Run }> {
    const task = taskQueue.getTask(taskId);
    if (!task) {
      return { success: false, error: `Task ${taskId} not found` };
    }

    const agent = agentRegistry.getInstance(agentInstanceId);
    if (!agent) {
      return {
        success: false,
        error: `Agent instance ${agentInstanceId} not found`,
      };
    }

    const definition = agentRegistry.getDefinition(agent.definitionId);
    if (!definition) {
      return {
        success: false,
        error: `Agent definition ${agent.definitionId} not found`,
      };
    }

    const assignResult = taskQueue.transitionTask(taskId, "assigned", {
      agentInstanceId,
    });
    if (!assignResult.success) {
      return { success: false, error: assignResult.error };
    }

    const agentAssign = agentRegistry.assignTask(agentInstanceId, taskId);
    if (!agentAssign.success) {
      taskQueue.transitionTask(taskId, "queued");
      return { success: false, error: agentAssign.error };
    }

    const session = agent.session ?? {
      id: generateId(),
      agentInstanceId,
      startedAt: nowISO(),
      taskIds: [],
      metadata: {},
    };
    session.taskIds.push(taskId);
    agent.session = session;

    eventBus.emit("task.assigned", taskId, {
      agentInstanceId,
      projectId: task.projectId,
    });

    return this.startRun(task, agent, definition, session);
  }

  private async startRun(
    task: TaskDefinition,
    agent: AgentInstance,
    definition: AgentDefinition,
    session: { id: string; agentInstanceId: string; startedAt: string; taskIds: string[]; metadata: Record<string, string> }
  ): Promise<{ success: boolean; error?: string; run?: Run }> {
    const startResult = agentRegistry.transitionInstance(agent.id, "running");
    if (!startResult.success) {
      taskQueue.transitionTask(task.id, "queued");
      agentRegistry.releaseTask(agent.id);
      return { success: false, error: startResult.error };
    }

    taskQueue.transitionTask(task.id, "running");

    const run: Run = {
      id: generateId(),
      taskDefinitionId: task.id,
      agentInstanceId: agent.id,
      sessionId: session.id,
      state: "pending",
      input: task.input,
      attemptNumber: task.retryCount + 1,
      startedAt: nowISO(),
    };

    this.runs.set(run.id, run);

    eventBus.emit("run.started", run.id, {
      taskId: task.id,
      agentInstanceId: agent.id,
      attemptNumber: String(run.attemptNumber),
    });

    run.state = "running";

    eventBus.emit("task.started", task.id, {
      agentInstanceId: agent.id,
      runId: run.id,
    });

    const executor = getExecutor(definition.role);

    try {
      const result = await executor.execute({
        taskDefinition: task,
        agentDefinition: definition,
        session: session as never,
        run,
      });

      if (result.success) {
        run.state = "completed";
        run.output = result.output;
        run.completedAt = nowISO();
        run.durationMs =
          new Date(run.completedAt).getTime() -
          new Date(run.startedAt).getTime();

        taskQueue.completeTask(task.id, result.output ?? "");
        agentRegistry.transitionInstance(agent.id, "completed");
        agentRegistry.releaseTask(agent.id);

        eventBus.emit("run.completed", run.id, {
          taskId: task.id,
          durationMs: String(run.durationMs),
        });
      } else {
        return this.handleFailure(run, task, agent, result.error ?? "Unknown error");
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : String(err);
      return this.handleFailure(run, task, agent, errorMsg);
    }

    return { success: true, run };
  }

  private async handleFailure(
    run: Run,
    task: TaskDefinition,
    agent: AgentInstance,
    error: string
  ): Promise<{ success: boolean; error?: string; run?: Run }> {
    run.state = "failed";
    run.error = error;
    run.completedAt = nowISO();
    run.durationMs =
      new Date(run.completedAt).getTime() -
      new Date(run.startedAt).getTime();

    agentRegistry.releaseTask(agent.id);

    eventBus.emit("run.failed", run.id, {
      taskId: task.id,
      error,
      attemptNumber: String(run.attemptNumber),
    });

    if (task.retryCount < task.maxRetries) {
      taskQueue.retryTask(task.id);
      agentRegistry.transitionInstance(agent.id, "retrying");

      const retryDelay = Math.min(
        this.retryPolicy.delayMs *
          Math.pow(this.retryPolicy.backoffMultiplier, task.retryCount),
        this.retryPolicy.maxDelayMs
      );

      setTimeout(() => {
        this.retryFailedTask(task.id);
      }, retryDelay);

      return { success: false, error, run };
    }

    taskQueue.failTask(task.id, error);
    agentRegistry.transitionInstance(agent.id, "failed");

    return { success: false, error, run };
  }

  private async retryFailedTask(taskId: string): Promise<void> {
    const task = taskQueue.getTask(taskId);
    if (!task || task.state !== "retrying") return;

    const available = agentRegistry.getAvailableInstances(task.projectId);
    if (available.length > 0) {
      const agent = available[0];
      await this.assignTask(taskId, agent.id);
    } else {
      taskQueue.transitionTask(taskId, "queued");
    }
  }

  async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      const queued = taskQueue.getQueuedTasks();
      for (const task of queued) {
        const available = agentRegistry.getAvailableInstances(
          task.projectId
        );
        if (available.length > 0) {
          const agent = available[0];
          await this.assignTask(task.id, agent.id);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  getRun(id: string): Run | undefined {
    return this.runs.get(id);
  }

  getAllRuns(): Run[] {
    return Array.from(this.runs.values());
  }

  getRunsByTask(taskId: string): Run[] {
    return this.getAllRuns().filter((r) => r.taskDefinitionId === taskId);
  }

  getRunsByAgent(agentInstanceId: string): Run[] {
    return this.getAllRuns().filter(
      (r) => r.agentInstanceId === agentInstanceId
    );
  }

  getActiveRuns(): Run[] {
    return this.getAllRuns().filter(
      (r) => r.state === "running" || r.state === "pending"
    );
  }

  async cancelRun(
    runId: string
  ): Promise<{ success: boolean; error?: string }> {
    const run = this.runs.get(runId);
    if (!run) {
      return { success: false, error: `Run ${runId} not found` };
    }

    if (run.state !== "running" && run.state !== "pending") {
      return {
        success: false,
        error: `Cannot cancel run in state ${run.state}`,
      };
    }

    const transitionResult = validateRunTransition(run.state, "cancelled");
    if (!transitionResult.valid) {
      return { success: false, error: transitionResult.error };
    }

    run.state = "cancelled";
    run.completedAt = nowISO();
    run.durationMs =
      new Date(run.completedAt).getTime() -
      new Date(run.startedAt).getTime();

    const task = taskQueue.getTask(run.taskDefinitionId);
    if (task) {
      taskQueue.cancelTask(task.id);
    }

    const agent = agentRegistry.getInstance(run.agentInstanceId);
    if (agent) {
      agentRegistry.releaseTask(agent.id);
      agentRegistry.transitionInstance(agent.id, "stopped");
    }

    return { success: true };
  }
}

export const orchestrator = new Orchestrator();
