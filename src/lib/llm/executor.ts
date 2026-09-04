import type {
  AgentExecutor,
  AgentExecutorInput,
  AgentExecutorOutput,
} from "../control-plane/types";
import type { ChatMessage } from "./types";
import { llmRouter } from "./router";
import { providerManager } from "./manager";

export class LLMAgentExecutor implements AgentExecutor {
  async execute(
    input: AgentExecutorInput
  ): Promise<AgentExecutorOutput> {
    const { taskDefinition, agentDefinition } = input;

    const route = llmRouter.selectForTask(taskDefinition.description, {
      preferFree: true,
    });

    if (!route) {
      return {
        success: false,
        error: "No LLM provider available. Configure an API key (GEMINI_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY).",
      };
    }

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: agentDefinition.systemInstructions ||
          `You are ${agentDefinition.name}, a ${agentDefinition.role}. ${agentDefinition.description}`,
      },
      {
        role: "user",
        content: this.buildPrompt(taskDefinition),
      },
    ];

    try {
      const response = await providerManager.completeWithFallback(
        {
          model: route.modelId,
          messages,
          maxTokens: 4096,
          temperature: 0.7,
        },
        route.fallbackChain,
        3
      );

      return {
        success: true,
        output: response.content,
      };
    } catch (err) {
      return {
        success: false,
        error: `LLM execution failed after fallback: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private buildPrompt(task: {
    title: string;
    description: string;
    input?: string;
  }): string {
    const parts = [
      `Task: ${task.title}`,
      `Description: ${task.description}`,
    ];
    if (task.input) {
      parts.push(`Input: ${task.input}`);
    }
    return parts.join("\n\n");
  }
}
