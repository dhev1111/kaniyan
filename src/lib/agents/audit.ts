import { AuditLog, redactSecrets } from "@/lib/capabilities/audit";
import type { AuditAction, AuditEvent } from "@/lib/types";
import type { AuditEntry, AuditEntryInput } from "@/lib/capabilities/audit";
import type { CapabilityErrorCode } from "@/lib/capabilities/types";

export type AgentAuditAction =
  | "agent.template.requested"
  | "agent.specialization.requested"
  | "agent.validation.completed"
  | "agent.security.checked"
  | "agent.registered"
  | "agent.versioned"
  | "agent.activated"
  | "agent.selected"
  | "agent.assigned"
  | "agent.started"
  | "agent.completed"
  | "agent.failed"
  | "agent.suspended"
  | "agent.resumed"
  | "agent.retired"
  | "agent.creation.denied"
  | "agent.permission.denied"
  | "agent.approval.requested"
  | "agent.validating"
  | "agent.deprecated"
  | "agent.rejected"
  | "agent.paused";

export class AgentAuditLog {
  private readonly entries: AuditEntry[] = [];
  private seq = 0;
  private readonly auditLog: AuditLog;

  constructor(auditLog?: AuditLog) {
    this.auditLog = auditLog ?? new AuditLog();
  }

  append(input: Omit<AuditEntryInput, "now">): AuditEntry {
    this.seq += 1;
    const entry: AuditEntry = {
      seq: this.seq,
      timestamp: new Date().toISOString(),
      ...input,
      detail: typeof input.detail === "string" ? (redactSecrets(input.detail) as string) : "",
    };
    this.entries.push(entry);
    this.auditLog.append({ ...input, now: entry.timestamp });
    return { ...entry };
  }

  list(): AuditEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  count(): number {
    return this.entries.length;
  }

  toAuditEvent(entry: AuditEntry): AuditEvent {
    return {
      id: `agent-audit-${entry.seq}`,
      action: entry.action as AuditAction,
      entityType: entry.capabilityType ?? "agent",
      entityId: entry.capabilityId,
      actor: entry.actor,
      details: entry.detail,
      metadata: {
        operationId: entry.operationId,
        status: entry.status,
        decision: entry.decision ?? "",
        approvalId: entry.approvalId ?? "",
        errorCode: entry.errorCode ?? "",
      },
      riskLevel: entry.status === "failure" ? "medium" : "low",
      timestamp: entry.timestamp,
    };
  }

  getUnderlyingLog(): AuditLog {
    return this.auditLog;
  }
}

export function createAgentAuditEntry(
  action: AgentAuditAction,
  agentId: string,
  actor: string,
  details: string,
  options?: {
    status?: "success" | "failure" | "suspended";
    decision?: string;
    approvalId?: string;
    errorCode?: string;
    operationId?: string;
  }
): Omit<AuditEntryInput, "now"> {
  return {
    operationId: options?.operationId ?? `agent-${agentId}-${action}`,
    actor,
    capabilityType: "tool",
    capabilityId: agentId,
    capabilityVersion: 1,
    action: action as unknown as AuditAction,
    status: options?.status ?? "success",
    decision: options?.decision,
    approvalId: options?.approvalId,
    errorCode: options?.errorCode as CapabilityErrorCode | undefined,
    detail: details,
  };
}

export function createAgentFactoryAuditEntry(
  action: AgentAuditAction,
  actor: string,
  details: string,
  options?: {
    status?: "success" | "failure" | "suspended";
    templateId?: string;
    operationId?: string;
  }
): Omit<AuditEntryInput, "now"> {
  return {
    operationId: options?.operationId ?? `factory-${action}-${Date.now()}`,
    actor,
    capabilityType: "tool",
    capabilityId: options?.templateId ?? "agent-factory",
    capabilityVersion: 1,
    action: action as unknown as AuditAction,
    status: options?.status ?? "success",
    detail: details,
  };
}
