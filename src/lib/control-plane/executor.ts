import type {
  AgentExecutorInput,
  AgentExecutorOutput,
} from "./types";

export interface AgentExecutor {
  execute(input: AgentExecutorInput): Promise<AgentExecutorOutput>;
}

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

export function initializeDefaultExecutors(): void {
  const mockExecutor = new MockExecutor();
  const roles = [
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
  for (const role of roles) {
    registerExecutor(role, mockExecutor);
  }
}
