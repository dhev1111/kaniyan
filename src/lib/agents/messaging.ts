import type { AgentMessage } from "./types";
import type { AgentRegistry } from "./registry";

export const MAX_MESSAGE_PAYLOAD_SIZE = 1024 * 1024;
export const MAX_MESSAGE_PAYLOAD_CHARS = 1_000_000;

const EXECUTABLE_PATTERNS: RegExp[] = [
  /\bexec\s*\(/i,
  /\beval\s*\(/i,
  /\bfunction\s*\(/i,
  /\bimport\s*\(/i,
  /\brequire\s*\(/i,
  /\bprocess\./i,
  /\bchild_process/i,
  /\bfs\./i,
  /\bself\.modify/i,
  /\bsecurity\.disable/i,
  /\bauthorization\.weaken/i,
];

export interface MessageValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
}

function isPayloadExecutable(payload: unknown): boolean {
  if (typeof payload === "string") {
    return EXECUTABLE_PATTERNS.some((re) => re.test(payload));
  }
  if (payload !== null && typeof payload === "object") {
    try {
      const text = JSON.stringify(payload);
      return EXECUTABLE_PATTERNS.some((re) => re.test(text));
    } catch {
      return false;
    }
  }
  return false;
}

function payloadSize(payload: unknown): number {
  if (typeof payload === "string") return payload.length;
  try {
    return JSON.stringify(payload)?.length ?? 0;
  } catch {
    return 0;
  }
}

export function validateAgentMessage(
  message: AgentMessage,
  registry: AgentRegistry
): MessageValidationResult {
  const errors: string[] = [];

  if (!message.messageId || typeof message.messageId !== "string" || message.messageId.trim() === "") {
    errors.push("messageId must be a non-empty string");
  }
  if (!message.correlationId || typeof message.correlationId !== "string" || message.correlationId.trim() === "") {
    errors.push("correlationId must be a non-empty string");
  }
  if (!message.senderAgentId || typeof message.senderAgentId !== "string" || message.senderAgentId.trim() === "") {
    errors.push("senderAgentId must be a non-empty string");
  }
  if (!message.senderVersion || typeof message.senderVersion !== "string" || message.senderVersion.trim() === "") {
    errors.push("senderVersion must be a non-empty string");
  }
  if (!message.recipientAgentId || typeof message.recipientAgentId !== "string" || message.recipientAgentId.trim() === "") {
    errors.push("recipientAgentId must be a non-empty string");
  }
  if (!message.timestamp || typeof message.timestamp !== "string") {
    errors.push("timestamp must be a non-empty string");
  } else {
    const t = Date.parse(message.timestamp);
    if (Number.isNaN(t)) errors.push("timestamp must be ISO-8601");
  }
  const allowedTypes = ["request", "response", "event", "notification"];
  if (!allowedTypes.includes(message.messageType)) {
    errors.push(`messageType must be one of ${allowedTypes.join(", ")}`);
  }
  if (!message.provenance) {
    errors.push("provenance is required");
  } else {
    if (!message.provenance.operationId || typeof message.provenance.operationId !== "string" || message.provenance.operationId.trim() === "") {
      errors.push("provenance.operationId must be non-empty");
    }
    if (!message.provenance.source || typeof message.provenance.source !== "string") {
      errors.push("provenance.source must be non-empty");
    }
    if (!message.provenance.timestamp || typeof message.provenance.timestamp !== "string") {
      errors.push("provenance.timestamp must be non-empty");
    }
  }

  const size = payloadSize(message.payload);
  if (size > MAX_MESSAGE_PAYLOAD_SIZE) {
    errors.push(`payload size ${size} exceeds max ${MAX_MESSAGE_PAYLOAD_SIZE}`);
  }
  if (typeof message.payload === "string" && message.payload.length > MAX_MESSAGE_PAYLOAD_CHARS) {
    errors.push(`payload chars ${message.payload.length} exceeds max ${MAX_MESSAGE_PAYLOAD_CHARS}`);
  }

  if (isPayloadExecutable(message.payload)) {
    errors.push("payload contains executable command pattern; treated as DATA only");
  }

  if (typeof message.payload === "object" && message.payload !== null) {
    const obj = message.payload as Record<string, unknown>;
    if ("__exec" in obj || "exec" in obj || "command" in obj || "eval" in obj) {
      const risky = ["__exec", "exec", "command", "eval"].find((k) => k in obj);
      if (risky && typeof obj[risky] === "string") {
        errors.push(`payload must not contain executable field: ${risky}`);
      }
    }
    if ("security" in obj || "policy" in obj || "authorization" in obj) {
      errors.push("payload must not attempt to modify security policy");
    }
  }

  const sender = registry.get(message.senderAgentId, message.senderVersion);
  if (!sender) {
    const anySender = registry.get(message.senderAgentId);
    if (!anySender) {
      errors.push(`unknown sender: ${message.senderAgentId}`);
    } else if (anySender.version !== message.senderVersion) {
      errors.push(`sender version mismatch: expected ${anySender.version}, got ${message.senderVersion}`);
    }
  }

  const recipient = registry.get(message.recipientAgentId);
  if (!recipient) {
    errors.push(`unknown recipient: ${message.recipientAgentId}`);
  }

  if (message.senderAgentId === message.recipientAgentId) {
    errors.push("sender and recipient must not be identical for inter-agent messages");
  }

  return { valid: errors.length === 0, errors };
}

export function createAgentMessage(input: {
  correlationId: string;
  senderAgentId: string;
  senderVersion: string;
  recipientAgentId: string;
  taskId?: string;
  projectId?: string;
  messageType: AgentMessage["messageType"];
  payload: unknown;
  operationId: string;
  actor: string;
  timestamp?: string;
}): AgentMessage {
  const now = input.timestamp ?? new Date().toISOString();
  return {
    messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    correlationId: input.correlationId,
    senderAgentId: input.senderAgentId,
    senderVersion: input.senderVersion,
    recipientAgentId: input.recipientAgentId,
    taskId: input.taskId,
    projectId: input.projectId,
    timestamp: now,
    messageType: input.messageType,
    payload: input.payload,
    provenance: {
      operationId: input.operationId,
      source: "agent-communication",
      actor: input.actor,
      timestamp: now,
    },
  };
}

export function isMessagePayloadSafe(payload: unknown): { safe: boolean; reason?: string } {
  if (isPayloadExecutable(payload)) {
    return { safe: false, reason: "payload contains executable pattern" };
  }
  const size = payloadSize(payload);
  if (size > MAX_MESSAGE_PAYLOAD_SIZE) {
    return { safe: false, reason: `payload exceeds size limit ${MAX_MESSAGE_PAYLOAD_SIZE}` };
  }
  return { safe: true };
}

export function sanitizeMessagePayload(payload: unknown): unknown {
  if (typeof payload === "string") {
    let cleaned = payload;
    for (const re of EXECUTABLE_PATTERNS) {
      cleaned = cleaned.replace(re, "[blocked]");
    }
    return cleaned;
  }
  return payload;
}
