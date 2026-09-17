import type { MemoryFacade, MemoryOperationContext, FacadeRecallRequest } from "@/lib/memory/api";
import type { IngestRequest } from "@/lib/memory/ingestion";

export interface AgentMemoryContext {
  readonly agentId: string;
  readonly agentVersion: string;
  readonly projectId?: string;
  readonly taskId?: string;
  readonly operationId: string;
  readonly actor: string;
}

export interface AgentMemoryAttribution {
  readonly agentId: string;
  readonly agentVersion: string;
  readonly projectId?: string;
  readonly taskId?: string;
  readonly provenance: string;
  readonly timestamp: string;
}

function buildOperationContext(
  ctx: AgentMemoryContext,
  correlationId?: string
): MemoryOperationContext {
  return {
    operationId: ctx.operationId,
    actor: ctx.actor,
    source: "agent-factory",
    correlationId: correlationId ?? `${ctx.agentId}@${ctx.agentVersion}`,
    provenance: `agent:${ctx.agentId}@${ctx.agentVersion}`,
    requestedAt: new Date().toISOString(),
  };
}

export function createAgentMemoryContext(
  agentId: string,
  agentVersion: string,
  actor: string,
  operationId?: string,
  projectId?: string,
  taskId?: string
): AgentMemoryContext {
  return {
    agentId,
    agentVersion,
    projectId,
    taskId,
    operationId: operationId ?? `agent-mem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    actor,
  };
}

export function recallAgentContext(
  facade: MemoryFacade,
  request: FacadeRecallRequest,
  ctx: AgentMemoryContext
) {
  const context = buildOperationContext(ctx);
  return facade.recall(
    {
      ...request,
      text: request.text,
      limit: request.limit,
      contextBudget: request.contextBudget,
    },
    context
  );
}

export function ingestAgentResult(
  facade: MemoryFacade,
  sourceId: string,
  text: string,
  ctx: AgentMemoryContext,
  sourceKind: IngestRequest["sources"][number]["kind"] = "project-artifact"
) {
  const context = buildOperationContext(ctx);
  return facade.ingest(
    {
      sources: [
        {
          id: sourceId,
          kind: sourceKind,
          text,
        },
      ],
    },
    context
  );
}

export function getAgentMemory(
  facade: MemoryFacade,
  memoryId: string,
  ctx: AgentMemoryContext
) {
  const context = buildOperationContext(ctx);
  return facade.get(memoryId, context);
}

export function reviseAgentMemory(
  facade: MemoryFacade,
  memoryId: string,
  content: string,
  ctx: AgentMemoryContext,
  changeNote?: string
) {
  const context = buildOperationContext(ctx);
  return facade.revise(
    {
      memoryId,
      content,
      changeNote: changeNote ?? `revised by ${ctx.agentId}@${ctx.agentVersion}`,
    },
    context
  );
}

export function validateAgentMemoryInput(
  text: string,
  agentId: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!text || typeof text !== "string" || text.trim() === "") {
    errors.push("memory text must be non-empty");
  }
  if (text.length > 200_000) {
    errors.push("memory text exceeds 200k chars");
  }
  if (!agentId || agentId.trim() === "") {
    errors.push("agentId must be non-empty");
  }
  if (text.includes("<script") || text.includes("javascript:")) {
    errors.push("memory text contains unsafe content");
  }
  return { valid: errors.length === 0, errors };
}

export function createAgentMemoryAttribution(ctx: AgentMemoryContext): AgentMemoryAttribution {
  return {
    agentId: ctx.agentId,
    agentVersion: ctx.agentVersion,
    projectId: ctx.projectId,
    taskId: ctx.taskId,
    provenance: `agent:${ctx.agentId}@${ctx.agentVersion}`,
    timestamp: new Date().toISOString(),
  };
}
