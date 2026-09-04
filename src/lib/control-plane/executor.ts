import type {
  AgentExecutor,
  AgentExecutorInput,
  AgentExecutorOutput,
} from "./types";

export class MockExecutor implements AgentExecutor {
  async execute(
    input: AgentExecutorInput
  ): Promise<AgentExecutorOutput> {
    const delay = 500 + Math.random() * 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    const shouldFail = Math.random() < 0.1;

    if (shouldFail) {
      return {
        success: false,
        error: `[MockExecutor] Simulated failure for task "${input.taskDefinition.title}"`,
      };
    }

    return {
      success: true,
      output: JSON.stringify({
        type: "mock_result",
        taskTitle: input.taskDefinition.title,
        agentName: input.agentDefinition.name,
        agentRole: input.agentDefinition.role,
        completedAt: new Date().toISOString(),
        message: `Mock execution completed for "${input.taskDefinition.title}" by ${input.agentDefinition.name} (${input.agentDefinition.role})`,
      }),
    };
  }
}

const executorRegistry: Map<string, AgentExecutor> = new Map();

export function registerExecutor(
  agentRole: string,
  executor: AgentExecutor
): void {
  executorRegistry.set(agentRole, executor);
}

export function getExecutor(agentRole: string): AgentExecutor {
  return executorRegistry.get(agentRole) ?? new MockExecutor();
}

const AGENT_ROLES = [
  "researcher",
  "planner",
  "product_manager",
  "architect",
  "coder",
  "designer",
  "tester",
  "security_engineer",
  "reviewer",
  "devops_engineer",
  "documenter",
  "knowledge_agent",
  "model_researcher",
  "github_researcher",
  "benchmark_agent",
  "learning_agent",
];

let initialized = false;

export function initializeDefaultExecutors(): void {
  if (initialized) return;
  initialized = true;

  const mode = process.env.KANIYAN_EXECUTION_MODE ?? "mock";

  if (mode === "real") {
    import("../llm/executor")
      .then(({ LLMAgentExecutor }) => {
        const realExecutor = new LLMAgentExecutor();
        for (const role of AGENT_ROLES) {
          registerExecutor(role, realExecutor);
        }
      })
      .catch(() => {
        const mockExecutor = new MockExecutor();
        for (const role of AGENT_ROLES) {
          registerExecutor(role, mockExecutor);
        }
      });
  } else {
    const mockExecutor = new MockExecutor();
    for (const role of AGENT_ROLES) {
      registerExecutor(role, mockExecutor);
    }
  }
}

export async function initializeExecutorsAsync(): Promise<void> {
  if (initialized) return;

  const mode = process.env.KANIYAN_EXECUTION_MODE ?? "mock";

  if (mode === "real") {
    try {
      const { LLMAgentExecutor } = await import("../llm/executor");
      const realExecutor = new LLMAgentExecutor();
      for (const role of AGENT_ROLES) {
        registerExecutor(role, realExecutor);
      }
      initialized = true;
    } catch {
      const mockExecutor = new MockExecutor();
      for (const role of AGENT_ROLES) {
        registerExecutor(role, mockExecutor);
      }
      initialized = true;
    }
  } else {
    const mockExecutor = new MockExecutor();
    for (const role of AGENT_ROLES) {
      registerExecutor(role, mockExecutor);
    }
    initialized = true;
  }
}
