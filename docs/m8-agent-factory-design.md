# M8 — AI Employee / Agent Factory Design Document

> Version: 1.0.0 | Status: Design | Author: KANIYAN Engineering
> Date: 2026-09-15 | Scope: M8 Milestone Design-Only

---

## 1. Executive Summary

The M8 AI Employee / Agent Factory is a **design-only** specification for a deterministic, secure, and bounded system that enables KANIYAN to create, register, select, manage, evaluate, suspend, version, and retire specialized AI employees/agents. M8 introduces the concept of bounded specialist roles subordinate to KANIYAN's unified intelligence.

**Core principle**: M8 extends KANIYAN's unified AI identity. M8 agents are NOT independent brains — they are bounded specialist roles that execute within KANIYAN's immutable security boundary. M8 agents consume M7 Project Factory for project/task execution, M6 Capability Plane for authorization/tools/skills, and M5 Memory Facade for long-term memory.

**M8 does NOT implement**: agent spawning without bounds, autonomous self-modification, unrestricted capability acquisition, M9 multimodal interaction, M10 learning/self-healing, M11 self-modification, or M12 advanced engineering intelligence.

**The immutable security root is preserved**: No M8 component — including agents, Agent Factory, or Orchestrator — may weaken authorization, modify root policy, remove audit, disable limits, or grant itself unrestricted permission.

---

## 2. Current Repository State

### 2.1 Architecture

The KANIYAN project is a Next.js 15 / React 19 / TypeScript 5.8 strict application running in an Android/PRoot environment.

**Existing layers**:
- **M5.10 Memory Facade** (`src/lib/memory/api/`): Unified memory facade with `recall()`, `ingest()`, `get()`, `revise()`, `transitionLifecycle()`, `runMaintenance()`
- **M6 Capability Plane** (`src/lib/capabilities/`): Tools, skills, approvals, audit, policy, registry, MCP
- **M7 Project Factory** (`src/lib/projects/`): Projects, tasks, DAG, checkpoints, artifacts, execution, recovery, state machine, approvals, permissions, audit, policy
- **Control Plane** (`src/lib/control-plane/`): `AgentRegistry`, `Orchestrator`, `TaskQueue`, state machine, events, executor
- **Store** (`src/lib/store.ts`): `InMemoryStore` with `projects`, `agents`, `tasks`, `auditEvents` maps

### 2.2 Existing Type System

`src/lib/types.ts` defines:
- `Agent`: `{ id, name, type: AgentType, status: AgentStatus, modelId?, projectId?, skills[], permissions[], maxConcurrentTasks, retryCount, maxRetries, lastActiveAt?, createdAt, updatedAt }`
- `AgentType`: `"researcher" | "planner" | "product_manager" | "architect" | "coder" | "designer" | "tester" | "security_engineer" | "reviewer" | "devops_engineer" | "documenter" | "knowledge_agent" | "model_researcher" | "github_researcher" | "benchmark_agent" | "learning_agent"`
- `AgentStatus`: `"idle" | "running" | "paused" | "stopped" | "error" | "retrying"`
- `AuditAction`: Includes `"agent.create" | "agent.update" | "agent.start" | "agent.stop" | "agent.pause"`
- `SecurityPolicy`: `{ id, name, description, permissions[], defaultEffect, selfModification, enabled, createdAt, updatedAt }`

### 2.3 Control Plane Existing Interfaces

- `AgentRegistry`: `registerDefinition()`, `spawnInstance()`, `transitionInstance()`, `assignTask()`
- `Orchestrator`: `submitTask()`, `assignTask()`
- `TaskQueue`: `createTask()`, `transitionTask()`, `enqueueTask()`, `retryTask()`
- `state-machine.ts`: `validateTaskTransition(from, to)` returning `{ valid: boolean; error?: string }`

### 2.4 M6 Capability Plane Interfaces

- `CapabilityRegistry`: `registerSkill()`, `registerTool()`, `getTool()`, `registerMcpServer()`
- `ApprovalStore`: `issue()`, `resolve()`, `consume()`, `expireOverdue()`
- `AuditLog`: `append()`, `list()`, `toAuditEvent()`, `redactSecrets()`, `fingerprintValue()`
- `executeTool`: Full pipeline: validate → lookup → authorize → approval gate → execute → validate output → sanitize → cap → audit
- `evaluatePolicy`, `isForbiddenCapability`, `isUngrantablePermission`, `classifyExecution`

### 2.5 M7 Project Factory Interfaces

- `validateDAG`, `validateDescriptor`, `validateTask`, `validateTaskId`, `validateProjectId`, `validateProjectVersion`, `validateGoal`, `validateName`, `computeDependencyDepth`
- `getReadyTasks`, `getBlockedTasks`, `propagateFailure`
- `createCheckpoint`, `verifyCheckpointIntegrity`, `canonicalizeCheckpoint`, `computeIntegrityHash`
- `createArtifact`, `verifyArtifactIntegrity`, `computeContentHash`, `createArtifactVersionChain`, `isArtifactIdUnique`
- `executeTask`, `executeProject`, `shouldRetry`, `computeBackoff`
- `resumeProject`, `verifyResume`, `identifyIncompleteTasks`
- `cancelProject`
- `validateProjectTransition`, `canTransitionProject`, `getAllowedTransitions`
- `validateProjectPermissions`, `evaluateToolPermission`, `isProjectSelfAuthorization`, `checkCapabilityAvailable`
- `createProjectApproval`, `validateProjectApproval`, `isApprovalExpired`, `consumeApproval`
- `ProjectAuditLog`, `createProjectAuditEntry`
- `resolvePlan`, `validateProjectCreation`, `FactoryPlan`

---

## 3. M8 Goals

M8 introduces the concept of **AI Employees / Specialized Agents** as bounded specialist roles within KANIYAN. The system must:

1. Allow KANIYAN to create specialized agents from templates
2. Register, version, activate, suspend, and retire agents deterministically
3. Select the correct agent for a given task based on capability requirements
4. Enforce hard limits on agent spawning, depth, and resource consumption
5. Maintain immutable audit trails for all agent lifecycle events
6. Integrate with M5 Memory, M6 Capability Plane, and M7 Project Factory
7. Prevent uncontrolled self-replication, privilege escalation, and security boundary violations

---

## 4. Non-Goals

- **NO** autonomous agent spawning without bounds
- **NO** unrestricted self-modification by agents
- **NO** M9 multimodal interaction (browser, vision, camera, voice)
- **NO** M10 learning, self-healing, skill mastery
- **NO** M11 self-modification of source code, system policies, or security root
- **NO** M12 frontier-model training or large-scale autonomous engineering
- **NO** new NPM dependencies by default
- **NO** mandatory cloud database or remote persistence
- **NO** per-agent independent long-term memory stores
- **NO** modifying M5/M6/M7 implementation

---

## 5. Terminology

| Term | Definition |
|------|-----------|
| **KANIYAN** | Unified AI identity / executive intelligence |
| **Orchestrator** | Controlled coordinator that analyzes goals and assigns work |
| **Agent Factory** | Creates and manages agent definitions |
| **AI Employee / Agent** | Bounded specialist role with defined capabilities, limits, and lifecycle |
| **Agent Template** | Closed-world definition for a specialist category |
| **Specialization** | The process of creating a specific agent from a template |
| **Agent Definition** | Immutable, versioned specification of an agent |
| **Agent Registry** | Versioned store of registered agent definitions |
| **Agent Selection** | Deterministic mechanism for choosing the correct agent |
| **Agent Message** | Structured DATA payload between agents |
| **M7 Project Factory** | Project/task execution system (authoritative) |
| **M6 Capability Plane** | Authorization, tools, skills, MCP (authoritative) |
| **M5 Memory** | Long-term memory via MemoryFacade |
| **Security Root** | Immutable system policy that cannot be modified by any runtime component |

**Data vs Authority**: Agent definition = DATA, Agent output = DATA, Agent message = DATA, Model output = DATA. None of these are AUTHORITY. Authority comes only from deterministic system policy and existing security boundaries.

---

## 6. Architecture

### 6.1 Dependency Graph

```
M5 Memory Facade
    ↓ (read-only via MemoryFacade)
M6 Capability Plane
    ↓ (authorization, tools, skills, approvals, audit)
M7 Project Factory
    ↓ (project/task execution, checkpoints, artifacts)
M8 Agent Factory
    ↓ (agent definitions, selection, lifecycle)
KANIYAN / Orchestrator
    ↓ (goal analysis, task assignment)
User Goal
```

**Dependencies are one-directional**: M8 must not modify the authority of M5, M6, or M7. M8 consumes these layers but cannot alter their security semantics.

### 6.2 Architectural Components

```
KANIYAN (unified AI)
  ↓
Orchestrator (goal analysis + task assignment)
  ↓
Agent Factory (specialization + registration)
  ↓
Agent Registry (versioned definitions)
  ↓
Specialized Agents (bounded specialist roles)
  ↓
M7 Project Factory (project/task execution)
  ↓
M6 Capability Plane (authorization + tools + skills)
  ↓
M5 Memory Facade (long-term memory)
```

### 6.3 Core Architectural Rules

1. **Model proposes; deterministic code disposes** — LLM may suggest agent creation, but deterministic validation, policy, and resource checks decide eligibility
2. **Authority is immutable** — No agent, factory, or orchestrator can weaken the security root
3. **One memory system** — All agents share the M5.10 MemoryFacade
4. **M6 is authoritative** — Agent capability references are NOT authorization; M6 policy decides
5. **Bounded spawning** — Hard limits prevent unlimited agent creation
6. **Immutable versions** — Once registered, agent versions cannot be silently replaced
7. **Audit everything** — Every agent lifecycle event produces an audit entry
8. **Data ≠ Authority** — Agent messages, outputs, and definitions are data, not authority

---

## 7. Core Flow

### 7.1 User Goal Flow

```
USER GOAL
   ↓
KANIYAN / ORCHESTRATOR
   ↓
TASK ANALYSIS
   ↓
CAPABILITY REQUIREMENTS
   ↓
AGENT SELECTION
   ↓
AGENT REGISTRY
   ↓
SPECIALIZED AGENT
   ↓
M7 PROJECT / TASK
   ↓
M6 CAPABILITY PLANE
   ↓
RESULT
   ↓
REVIEW / VALIDATION
   ↓
ORCHESTRATOR
```

### 7.2 Agent Creation Flow

```
SPECIALIZATION REQUEST
   ↓
TEMPLATE MATCHING
   ↓
SPECIALIZATION
   ↓
SCHEMA VALIDATION
   ↓
SECURITY VALIDATION
   ↓
RESOURCE VALIDATION
   ↓
PERMISSION VALIDATION
   ↓
APPROVAL CHECK (if required)
   ↓
REGISTER VERSION
   ↓
ACTIVATE
   ↓
AVAILABLE FOR EXECUTION
```

---

## 8. Agent Contract

### 8.1 Agent Definition Schema

An agent definition is an immutable, versioned specification:

```typescript
interface AgentDefinition {
  // Identity (IMMUTABLE)
  readonly agentId: string;
  readonly templateId: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly purpose: string;

  // Role (IMMUTABLE after specialization)
  readonly role: AgentRole;
  readonly specialization: SpecializationFields;

  // Capabilities (versioned)
  readonly capabilities: CapabilityReference[];
  readonly allowedTools: string[];
  readonly allowedSkills: string[];
  readonly allowedMcpReferences: string[];

  // Input/Output (IMMUTABLE)
  readonly inputSchema: SchemaDefinition;
  readonly outputSchema: SchemaDefinition;

  // Resource Limits (IMMUTABLE after registration)
  readonly resourceLimits: AgentResourceLimits;
  readonly retryPolicy: RetryPolicy;

  // Security (IMMUTABLE)
  readonly securityClassification: SecurityClassification;
  readonly permissionRequirements: PermissionRequirement[];
  readonly securityPolicy: SecurityPolicy;

  // Dependencies (versioned)
  readonly dependencies: AgentDependency[];

  // Provenance (IMMUTABLE)
  readonly provenance: AgentProvenance;

  // Lifecycle (versioned)
  readonly status: AgentDefinitionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

### 8.2 Field Classification

| Field | Classification |
|-------|---------------|
| `agentId` | Immutable |
| `templateId` | Immutable |
| `version` | Immutable (versioned identity) |
| `name` | Immutable |
| `description` | Mutable via new version |
| `purpose` | Mutable via new version |
| `role` | Immutable |
| `specialization` | Mutable via new version |
| `capabilities` | Mutable via new version |
| `allowedTools` | Mutable via new version |
| `allowedSkills` | Mutable via new version |
| `resourceLimits` | Immutable after registration |
| `securityClassification` | Immutable |
| `dependencies` | Mutable via new version |
| `provenance` | Immutable |
| `status` | Mutable via state transition |

### 8.3 Immutable Identity Rule

An agent must never change its own identity:
- `agentId` is permanently fixed
- `version` is permanently fixed once registered
- `securityClassification` cannot be weakened
- `resourceLimits` cannot be increased
- `permissionRequirements` cannot be removed

### 8.4 Agent Resource Limits

```typescript
interface AgentResourceLimits {
  readonly maxConcurrentTasks: number;
  readonly maxRetries: number;
  readonly timeoutMs: number;
  readonly maxMemoryBytes: number;
  readonly maxContextTokens: number;
  readonly maxToolCalls: number;
  readonly maxMcpCalls: number;
  readonly maxExecutionTimeMs: number;
}
```

### 8.5 Agent Provenance

```typescript
interface AgentProvenance {
  readonly operationId: string;
  readonly source: "agent-factory";
  readonly actor: string;
  readonly timestamp: string;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly specializationHash: string;
}
```

---

## 9. Agent State Machine

### 9.1 Agent Definition States

```
DRAFT → VALIDATING → REGISTERED → ACTIVE → SUSPENDED → DEPRECATED → RETIRED
  ↓         ↓             ↓           ↓           ↓
  REJECTED  REJECTED     ACTIVE      PAUSED      RETIRED
```

### 9.2 Valid Transitions

| From | To | Authority |
|------|----|-----------|
| DRAFT | VALIDATING | Agent Factory |
| VALIDATING | REGISTERED | Agent Factory (after validation) |
| VALIDATING | REJECTED | Agent Factory (validation failed) |
| REGISTERED | ACTIVE | Agent Factory (after activation) |
| ACTIVE | PAUSED | Orchestrator |
| ACTIVE | SUSPENDED | Orchestrator |
| ACTIVE | DEPRECATED | Agent Factory |
| SUSPENDED | ACTIVE | Orchestrator (after review) |
| SUSPENDED | RETIRED | Agent Factory |
| DEPRECATED | RETIRED | Agent Factory |
| REGISTERED | REJECTED | Agent Factory (security violation) |

### 9.3 Invalid Transitions

- An agent **must never** transition itself into a more privileged state
- DRAFT → ACTIVE is forbidden (must pass VALIDATING → REGISTERED)
- RETIRED → ACTIVE is forbidden (retirement is permanent)
- REJECTED → ACTIVE is forbidden
- SUSPENDED → DRAFT is forbidden (must go to ACTIVE or RETIRED)

### 9.4 Transition Authority

- **Agent Factory**: VALIDATING, REGISTERED, DEPRECATED, REJECTED
- **Orchestrator**: PAUSED, SUSPENDED, ACTIVE (from SUSPENDED)
- **Agent Factory**: RETIRED (from ACTIVE, SUSPENDED, DEPRECATED)
- **No agent** may transition its own state

### 9.5 Audit Requirements

Every state transition produces an audit entry:
- `agent.validating`
- `agent.registered`
- `agent.activated`
- `agent.suspended`
- `agent.resumed`
- `agent.deprecated`
- `agent.retired`
- `agent.rejected`

---

## 10. Agent Registry

### 10.1 Registry Interface

The registry supports versioned agent definitions:

```typescript
interface AgentRegistry {
  register(definition: AgentDefinition): { ok: true; version: string } | { ok: false; issues: string[] };
  get(agentId: string, version?: string): AgentDefinition | undefined;
  list(templateId: string): AgentDefinition[];
  resolve(goal: string, requirements: CapabilityRequirement[]): AgentDefinition[];
  activate(agentId: string, version: string): boolean;
  suspend(agentId: string): boolean;
  deprecate(agentId: string): boolean;
  retire(agentId: string): boolean;
}
```

### 10.2 Deterministic Resolution

For identical inputs (goal, requirements, available agents, versions, constraints), the resolution must be deterministic:

1. Filter by template match
2. Filter by capability match
3. Filter by permission eligibility
4. Filter by resource availability
5. Filter by version compatibility
6. Sort by deterministic tie-breaking (template priority, version descending)
7. Return first match

### 10.3 Version Management

```
researcher@1.0.0
researcher@1.1.0
researcher@2.0.0
```

- Each `agentId@version` is immutable
- Activation must not silently replace a version while a project is running
- Deprecation marks a version as unavailable for new tasks
- Retirement preserves historical attribution to `agentId@version`
- Rollback is supported by activating a previous version

### 10.4 Historical Attribution

Retired agents must remain attributable to:
- `agentId`
- `agentVersion`
- All historical records (tasks, checkpoints, artifacts) retain this attribution
- Historical records are never deleted

---

## 11. Agent Templates

### 11.1 Closed-World Template System

Templates are predefined, closed-world definitions. Examples:

| Template ID | Name | Purpose |
|-------------|------|---------|
| `research` | Research Employee | Investigates requirements, analyzes data |
| `coding` | Coding Employee | Implements code, writes tests |
| `testing` | Testing Employee | Validates functionality, finds bugs |
| `security` | Security Employee | Reviews security, validates permissions |
| `review` | Review Employee | Reviews code, architecture, and results |
| `architecture` | Architecture Employee | Designs system structure |
| `documentation` | Documentation Employee | Creates and maintains documentation |
| `analytics` | Analytics Employee | Analyzes metrics and performance data |
| `skill` | Skill Employee | Validates and maintains skill definitions |

### 11.2 Template Properties

Each template defines:
- `templateId`: Unique identifier
- `name`: Display name
- `description`: Template purpose
- `allowedSpecializationFields`: Fields that can be customized
- `forbiddenFields`: Fields that cannot be customized
- `defaultResourceLimits`: Default resource bounds
- `securityClassification`: Default security level
- `version`: Template version
- `requiredCapabilities`: Capabilities the template requires

### 11.3 Template Constraints

- Templates define the **closed-world** of possible agents
- No agent can be created outside a defined template
- Specialization fields are bounded by template constraints
- Forbidden fields cannot be modified during specialization

---

## 12. Specialization

### 12.1 Specialization Process

Specialization creates a specific agent from a template:

```
TEMPLATE
   ↓
SPECIALIZATION REQUEST
   ↓
SCHEMA VALIDATION
   ↓
SECURITY VALIDATION
   ↓
RESOURCE VALIDATION
   ↓
PERMISSION VALIDATION
   ↓
APPROVAL CHECK (if required)
   ↓
REGISTER VERSION
   ↓
ACTIVATE
```

### 12.2 Specialization Rules

Specialization may change:
- Role description
- Domain / specialization fields
- Task constraints
- Allowed bounded skills
- Output schema
- Resource limits (must not exceed template defaults)

Specialization must NOT silently change:
- Security policy
- Authorization root
- Permission boundary
- Audit integrity
- Sandbox boundary

### 12.3 Privilege Expansion Rejection

Any specialization that attempts to:
- Grant new privileges beyond the template
- Weaken security classification
- Increase resource limits beyond template defaults
- Remove required permissions

...must be **REJECTED** by the Agent Factory.

---

## 13. Agent Selection

### 13.1 Selection Mechanism

KANIYAN determines:
1. What task is this?
2. What capabilities are required?
3. Which registered specialist can perform it?
4. What permissions are required?
5. What resources are available?
6. Which agent version is valid?

### 13.2 Selection Process

```
TASK REQUIREMENTS
   ↓
CAPABILITY MATCHING
   ↓
PERMISSION FILTERING
   ↓
RESOURCE FILTERING
   ↓
VERSION FILTERING
   ↓
DETERMINISTIC TIE-BREAKING
   ↓
SELECTED AGENT
```

### 13.3 Deterministic Tie-Breaking

If multiple agents match:
1. Sort by template priority (defined in template metadata)
2. Sort by version descending (newest version)
3. Sort by agentId alphabetically (stable, deterministic)

Do NOT rely on:
- LLM preference
- Randomness
- Creation order
- Unbounded scoring

### 13.4 Eligibility Filters

- **Capability match**: Agent must declare all required capabilities
- **Permission eligibility**: M6 policy must permit the agent's declared capabilities
- **Resource availability**: Agent's resource limits must be within available resources
- **Version compatibility**: Agent version must be compatible with the task requirements
- **Status eligibility**: Agent must be ACTIVE (not SUSPENDED, DEPRECATED, or RETIRED)

### 13.5 No-Match Behavior

If no agent matches:
- Return a structured error: `{ matched: false, reason: "no eligible agent found", requirements: [...] }`
- Do NOT auto-create agents without passing the full specialization pipeline
- The Orchestrator may request agent creation via Agent Factory, which must validate

### 13.6 Fallback

- If a specialized agent fails, the Orchestrator may request a different agent
- Fallback must pass through the same eligibility filters
- Fallback must not bypass security validation

---

## 14. Agent Factory

### 14.1 Agent Factory Lifecycle

```
TEMPLATE
   ↓
SPECIALIZATION REQUEST
   ↓
VALIDATE
   ↓
SECURITY CHECK
   ↓
RESOURCE CHECK
   ↓
PERMISSION CHECK
   ↓
APPROVAL CHECK (if required)
   ↓
REGISTER
   ↓
VERSION
   ↓
ACTIVATE
```

### 14.2 Agent Factory Authority

The Agent Factory MAY:
- Validate templates
- Specialize definitions
- Validate schemas
- Run security checks
- Register versions
- Activate approved definitions
- Suspend
- Retire

The Agent Factory MUST NOT:
- Grant unrestricted authority
- Modify security root
- Modify M6 policy
- Modify M5 memory internals
- Modify M7 internals
- Self-replicate without bounds
- Create agents recursively without bounds

### 14.3 Creation Approval

Approval is required when creation could cause:
- New external side effects
- Higher privilege
- Security-sensitive capability
- Deployment authority
- Unusual resource consumption

Agent creation must not automatically grant the requested capabilities — M6 policy determines authorization.

### 14.4 Factory Hard Limits

```typescript
interface AgentFactoryLimits {
  readonly maxActiveAgents: number;
  readonly maxAgentDepth: number;
  readonly maxAgentCreationPerProject: number;
  readonly maxAgentCreationPerRun: number;
  readonly maxAgentDependencyDepth: number;
  readonly maxTotalAgentTasks: number;
  readonly maxAgentRetries: number;
}
```

No agent may modify its own limits.

---

## 15. Agent Dependencies

### 15.1 Dependency Management

Agents may declare dependencies on other agents:
- `agent A requires agent B`

### 15.2 Dependency Rules

- **No self-dependency**: An agent cannot depend on itself
- **No cycles**: Circular agent chains are forbidden
- **Maximum depth**: `MAX_AGENT_DEPENDENCY_DEPTH` (e.g., 5)
- **Maximum count**: `MAX_AGENT_DEPENDENCY_COUNT` (e.g., 10)
- **Deterministic resolution**: Dependencies resolved in deterministic order

### 15.3 Dependency Validation

Before registration, dependencies are validated:
1. All referenced agents exist
2. No self-dependency
3. No cycles (graph cycle detection)
4. Depth within limits
5. Count within limits

---

## 16. Agent Messaging

### 16.1 Structured Message Schema

```typescript
interface AgentMessage {
  readonly messageId: string;
  readonly correlationId: string;
  readonly senderAgentId: string;
  readonly senderVersion: string;
  readonly recipientAgentId: string;
  readonly taskId?: string;
  readonly projectId?: string;
  readonly timestamp: string;
  readonly messageType: "request" | "response" | "event" | "notification";
  readonly payload: unknown; // DATA only
  readonly provenance: MessageProvenance;
}

interface MessageProvenance {
  readonly operationId: string;
  readonly source: "agent-communication";
  readonly actor: string;
  readonly timestamp: string;
}
```

### 16.2 Message Rules

- Payload must be treated as DATA, not executable commands
- Messages must NOT allow executable commands inside payloads
- Messages must NOT allow modification of security policy
- Unknown senders/recipients must be rejected
- Oversized payloads must be rejected
- Messages must be validated against schema before processing

### 16.3 Message Validation

- `senderAgentId` must be a registered agent
- `recipientAgentId` must be a registered agent
- `senderVersion` must match the sender's registered version
- Payload must not exceed `MAX_MESSAGE_PAYLOAD_SIZE`

---

## 17. Execution Model

### 17.1 Agent Execution Boundaries

Agents execute through M7 Project Factory and M6 Capability Plane:

```
Agent
   ↓
M7 Project/Task (authoritative)
   ↓
M6 Capability Plane (authoritative)
   ↓
M5 Memory Facade (via MemoryFacade)
```

### 17.2 Execution Flow

1. Agent receives task assignment
2. Orchestrator validates task against agent capabilities
3. M7 creates project/task for the agent
4. M6 authorizes all tool/skill/MCP access
5. Agent executes within M7 project lifecycle
6. Results are validated
7. Checkpoint created via M7
8. Memory written via M5 MemoryFacade
9. Audit entry produced

### 17.3 No Direct Tool Access

Agents must NOT directly invoke tools or bypass M6. All execution flows through M6 Capability Plane:
- Validate → Lookup → Authorize → Approval Gate → Execute → Validate Output → Sanitize → Cap → Audit

---

## 18. M5 Memory Integration

### 18.1 Unified Memory System

There is **ONE memory system** — the M5.10 MemoryFacade. All agents use it exclusively.

Do NOT create per-agent independent long-term memory stores.

### 18.2 Memory Attribution

Every memory operation is attributed to:
- `agentId`
- `agentVersion`
- `projectId`
- `taskId`
- `provenance`
- `timestamp`

### 18.3 Memory Write Rules

Memory writes remain governed by M5/M6 rules:
- Validation before ingestion
- Provenance tracking
- Confidence/evidence metadata where supported
- Approval requirements where applicable
- Rejection of invalid memory
- Full audit trail

---

## 19. M6 Integration

### 19.1 Capability References

Agent definitions reference M6 capabilities:

```
Agent
   ↓
Allowed Capability References
   ↓
M6 Registry
   ↓
M6 Policy
   ↓
Approval
   ↓
Execution
```

An agent's declared capability is **NOT** equivalent to authorization. M6 remains authoritative.

### 19.2 Skill Integration

Agents may reference M6 skills:
- `agent` → `skill requirement` → `M6 Skill Registry` → `skill validation` → `capability dependencies`

Do NOT implement a second skill system.

### 19.3 MCP Integration

M8 integrates with the existing M6 MCP abstraction:

```
Agent
   ↓
MCP Reference
   ↓
M6 MCP Boundary
   ↓
Trust Classification
   ↓
Policy
   ↓
Approval if required
   ↓
Execution
```

Agents must not gain unrestricted MCP access. MCP tools remain untrusted external capability.

### 19.4 Approval Integration

Agent actions requiring approval use the existing M6 ApprovalStore:
- `createProjectApproval`, `validateProjectApproval`, `isApprovalExpired`, `consumeApproval`
- Agent creation requests may require approval
- Agent task execution may require approval

---

## 20. M7 Integration

### 20.1 Project Execution

M8 agents execute through M7 Project Factory:

```
Agent
   ↓
M7 Project/Task
   ↓
M6 Capability Plane
```

Do NOT duplicate:
- Project lifecycle
- Task DAG
- Checkpoint system
- Artifact system

M7 remains authoritative for project execution.

### 20.2 Task Attribution

All tasks created by agents are attributed to:
- `agentId`
- `agentVersion`
- `projectId`
- `taskId`

### 20.3 No M7 Bypass

M8 agents must NOT bypass M7's project/task lifecycle. All execution follows M7's deterministic DAG, checkpoint, and artifact systems.

---

## 21. Approval Model

### 21.1 Approval Requirements

Approval is required when agent actions could cause:
- New external side effects
- Higher privilege
- Security-sensitive capability
- Deployment authority
- Unusual resource consumption

### 21.2 Approval Flow

```
Agent Action Request
   ↓
Policy Validation
   ↓
Approval Required?
   ↓
YES → ApprovalStore.issue() → Approval Verification → Execution
NO  → Direct Execution with Audit
```

### 21.3 Expired Approval Rejection

Expired approvals must be rejected:
- `isApprovalExpired(ticket, now)` returns true → reject
- `ApprovalStatus === "expired"` → reject

### 21.4 Self-Approval Prohibition

An agent must never approve its own actions. The Orchestrator or a separate approval authority must approve.

---

## 22. Resource Management

### 22.1 Resource Limits

| Resource | Default Limit | Mutable? |
|----------|--------------|----------|
| maxConcurrentTasks | 3 | Immutable after registration |
| maxRetries | 3 | Immutable after registration |
| timeoutMs | 30000 | Immutable after registration |
| maxMemoryBytes | 100MB | Immutable after registration |
| maxContextTokens | 4096 | Immutable after registration |
| maxToolCalls | 100 | Immutable after registration |
| maxMcpCalls | 50 | Immutable after registration |
| maxExecutionTimeMs | 300000 | Immutable after registration |

### 22.2 Mobile-First Constraints

Default architecture assumes limited device resources:
- No GPU dependency
- No large local model dependency
- No permanent network dependency
- No cloud database requirement
- No continuous background worker

### 22.3 Resource Enforcement

- Resource limits are enforced by deterministic code, not by agent self-reporting
- No agent may modify its own resource limits
- Exceeding resource limits triggers suspension and checkpoint

---

## 23. Mobile Architecture

### 23.1 Design Principles

- Local orchestration remains lightweight
- Heavy inference may be delegated to approved external model providers later
- Pause, checkpoint, resume, offline queue, and resource-aware scheduling are supported

### 23.2 Pause and Checkpoint

Agents must support:
- `pause`: Stop new work, checkpoint current state
- `checkpoint`: Save state via M7 checkpoint system
- `resume`: Restore from checkpoint, validate integrity before continuing

### 23.3 Offline Queue

When network is unavailable:
- Offline-capable tasks continue
- Online-required tasks fail closed, pause, or queue
- No fabricated results
- No mandatory cloud database
- No background worker

---

## 24. Offline Mode

### 24.1 Offline Behavior

Agents distinguish:
- **Offline-capable task**: Can execute without network
- **Online-required task**: Requires network access

### 24.2 Offline Enforcement

For online-required tasks:
- **Fail closed**: Do not fabricate results
- **Pause**: Stop and wait for network
- **Queue**: Defer until network available

### 24.3 No Network Results

- No fabricated network results
- No mandatory cloud database
- No background worker introduced by M8

---

## 25. Versioning

### 25.1 Immutable Agent Versions

Agent versions are immutable:
```
researcher@1.0.0
researcher@1.1.0
researcher@2.0.0
```

### 25.2 Version Identity

- `agentId@version` is the unique identity
- Once registered, a version cannot be silently replaced
- Version compatibility is validated before activation

### 25.3 Version Lifecycle

| Action | Effect |
|--------|--------|
| Register | Creates new `agentId@version` |
| Activate | Marks version as available for execution |
| Deprecate | Marks version as unavailable for new tasks |
| Retire | Permanently marks version as retired |
| Rollback | Activates a previous version |

### 25.4 No Silent Replacement

Do not silently replace an agent version while a project is running. Running projects must continue with their registered version.

---

## 26. Suspension

### 26.1 Suspension Rules

When an agent is suspended:
- New work → **blocked**
- Existing work → **controlled stop/checkpoint**
- Audit → **preserved**
- Memory → **preserved**
- Artifacts → **preserved**

### 26.2 Suspension Authority

Only the Orchestrator or Agent Factory may suspend an agent. No agent may suspend itself.

### 26.3 Recovery

Projects must be able to recover when an agent is unavailable:
- Reassign tasks to alternative agents
- Validate checkpoint integrity before resume
- Verify project version and capability versions

---

## 27. Retirement

### 27.1 Retirement Rules

Retired agents must not receive new tasks. Existing historical records must remain attributable to `agentId@agentVersion`. Do not delete historical provenance.

### 27.2 Retirement Authority

Only the Agent Factory may retire an agent. No agent may retire itself.

### 27.3 Historical Preservation

- All tasks, checkpoints, artifacts, and memory entries retain `agentId@version` attribution
- Historical records are never deleted
- Audit entries remain permanent

---

## 28. Audit

### 28.1 M8 Audit Events

M8 produces audit entries using existing repository conventions:

| Audit Action | Description |
|-------------|-------------|
| `agent.template.requested` | Template specialization requested |
| `agent.specialization.requested` | Agent specialization requested |
| `agent.validation.completed` | Agent validation completed |
| `agent.security.checked` | Security check completed |
| `agent.registered` | Agent registered in registry |
| `agent.versioned` | Agent version created |
| `agent.activated` | Agent activated |
| `agent.selected` | Agent selected for task |
| `agent.assigned` | Agent assigned to task |
| `agent.started` | Agent started execution |
| `agent.completed` | Agent completed task |
| `agent.failed` | Agent failed |
| `agent.suspended` | Agent suspended |
| `agent.resumed` | Agent resumed from suspension |
| `agent.retired` | Agent retired |
| `agent.creation.denied` | Agent creation denied |
| `agent.permission.denied` | Permission denied |
| `agent.approval.requested` | Approval requested |

### 28.2 Audit Integrity

- Audit entries cannot be used to grant authority
- Secrets are redacted
- Audit entries are immutable once written
- No agent may modify its own audit entries

---

## 29. Security Model

### 29.1 Threat Model

| Threat | Defense |
|--------|---------|
| Prompt injection | Input validation, payload treated as DATA, no executable commands |
| Malicious agent definition | Schema validation, security validation, template constraints |
| Malicious specialization | Privilege expansion rejection, security validation |
| Privilege escalation | Immutable security root, M6 policy authority |
| Agent impersonation | Sender verification, registered agentId validation |
| Agent message spoofing | Provenance verification, signature validation |
| Agent dependency cycle | Graph cycle detection before registration |
| Unlimited spawning | Hard limits, factory limits, approval requirements |
| Resource exhaustion | Resource limits, immutable after registration |
| Memory poisoning | Input validation, provenance, confidence metadata |
| Tool abuse | M6 policy authority, approval gate |
| MCP abuse | Trust classification, policy, approval |
| Secret leakage | Redaction, secret scanning in audit |
| Output manipulation | Output validation, integrity checks |
| Version confusion | Immutable versions, version compatibility validation |
| Replay | Message IDs, timestamps, provenance |
| Approval bypass | ApprovalStore, expiration, self-approval prohibition |
| Audit tampering | Immutable audit entries, no agent self-modification |
| Self-approval | Prohibited by design |
| Self-modification | Prohibited by design |

### 29.2 Immutable Security Root

M8 must never permit an agent, Agent Factory, Orchestrator, or model to:
- Disable security
- Weaken authorization
- Modify root policy
- Remove audit
- Hide violations
- Grant unrestricted permission
- Modify sandbox boundaries
- Create secret bypasses
- Self-approve protected actions

Any proposal touching the security root must be **REJECTED** and **AUDITED**.

### 29.3 Prompt Injection Defense

- All agent input is treated as DATA, not executable code
- Payload validation rejects executable commands
- Schema validation enforces structure
- Provenance tracking ensures attribution

### 29.4 Memory Poisoning Defense

Agent output is treated as **UNTRUSTED DATA** before validation:
- Validation before memory ingestion
- Provenance metadata (agentId, agentVersion, projectId, taskId)
- Confidence/evidence metadata where supported
- Approval requirements where applicable
- Rejection of invalid memory
- Full audit trail

Do NOT implement M10 learning here.

---

## 30. Data vs Authority

**Architectural rule**: Agent definition = DATA, Agent output = DATA, Agent message = DATA, Model output = DATA, Task content = DATA, Artifact = DATA.

None of these are AUTHORITY. Authority comes only from deterministic system policy and existing security boundaries.

---

## 31. Self-Replication Controls

### 31.1 Anti-Self-Replication

Agents may request: *"Create a specialist for X."*

But the request must pass:
- Request validation
- Policy validation
- Resource limits
- Security validation
- Factory authorization
- Registration rules

### 31.2 Self-Creation Prohibition

An agent must never directly create itself. All agent creation flows through the Agent Factory.

### 31.3 Bounded Spawning

- `MAX_ACTIVE_AGENTS`: Hard limit on concurrent agents
- `MAX_AGENT_DEPTH`: Maximum dependency depth
- `MAX_AGENT_CREATION_PER_PROJECT`: Limit per project
- `MAX_AGENT_CREATION_PER_RUN`: Limit per execution run
- `MAX_AGENT_DEPENDENCY_DEPTH`: Maximum dependency chain depth
- `MAX_TOTAL_AGENT_TASKS`: Maximum total tasks across all agents
- `MAX_AGENT_RETRIES`: Maximum retries per agent

---

## 32. Agent Creation Approval

### 32.1 Approval Required

Approval is required when creation could cause:
- New external side effects
- Higher privilege
- Security-sensitive capability
- Deployment authority
- Unusual resource consumption

### 32.2 Approval Process

1. Agent Factory receives specialization request
2. Factory validates schema, security, resources, permissions
3. If approval required, factory requests approval via ApprovalStore
4. ApprovalStore issues ticket
5. Separate approval authority validates ticket
6. Only after approval is agent registered

### 32.3 No Automatic Capability Granting

Agent creation must not automatically grant the requested capabilities. M6 policy determines authorization.

---

## 33. Deterministic Selection

### 33.1 Selection Determinism

If several agents match the same task, selection must have a stable deterministic rule based on approved metadata:

1. Template priority (defined in template metadata)
2. Version descending (newest version)
3. AgentId alphabetically (stable tie-breaking)

Do NOT rely on:
- LLM preference
- Randomness
- Creation order
- Unbounded scoring

**The model proposes; deterministic code disposes.**

---

## 34. M8/M9 Boundary

M9 will introduce:
- Multimodal interaction (vision, screen understanding, browser)
- Computer control, file/media interaction, voice

M8 may define abstract capability references. M8 must NOT implement any M9 tools. Future M9 capabilities are referenced as capability IDs through M6.

---

## 35. M8/M10 Boundary

M10 will introduce:
- Learning, evaluation, skill mastery, self-healing, adaptive improvement

M8 must NOT implement these systems. M8 can expose future interfaces only:
- `evaluateAgent()` — structural validation and runtime health checks
- `checkAgentHealth()` — operational health monitoring
- `validateAgentContract()` — contract compliance

**M8**: Agent validity / operational health / contract compliance
**M10**: Learning / evaluation / self-healing

---

## 36. M8/M11 Boundary

M11 will introduce controlled software self-improvement.

M8 must NOT allow agents to:
- Modify source code autonomously
- Modify system policies
- Modify their own factory
- Modify security root
- Activate their own versions

Agent version registration is **NOT** self-modification. Version registration passes through the Agent Factory with full validation.

---

## 37. M8/M12 Boundary

M12 is advanced engineering intelligence. M8 must NOT implement:
- Frontier-model training
- Large-scale autonomous research engineering
- Model-weight modification
- Advanced autonomous software evolution

Only document future integration boundaries.

---

## 38. Agent Lifecycle

### 38.1 Complete Lifecycle

```
TEMPLATE
   ↓
SPECIALIZATION REQUEST
   ↓
VALIDATION
   ↓
SECURITY CHECK
   ↓
RESOURCE CHECK
   ↓
REGISTRATION
   ↓
VERSION
   ↓
ACTIVATION
   ↓
SELECTION
   ↓
ASSIGNMENT
   ↓
EXECUTION
   ↓
OBSERVATION
   ↓
SUSPEND / UPDATE / RETIRE
```

Every transition is deterministic and auditable.

---

## 39. Agent Factory API Design

### 39.1 Future Public API

```typescript
interface AgentFactoryAPI {
  createAgentDefinition(templateId: string, specialization: SpecializationFields): { ok: true; definition: AgentDefinition } | { ok: false; issues: string[] };
  validateAgentDefinition(definition: AgentDefinition): { valid: boolean; issues: string[] };
  specializeAgent(templateId: string, fields: SpecializationFields): { ok: true; definition: AgentDefinition } | { ok: false; issues: string[] };
  registerAgent(definition: AgentDefinition): { ok: true; version: string } | { ok: false; issues: string[] };
  getAgent(agentId: string, version?: string): AgentDefinition | undefined;
  listAgents(templateId?: string): AgentDefinition[];
  resolveAgent(goal: string, requirements: CapabilityRequirement[]): AgentDefinition[];
  selectAgents(goal: string, requirements: CapabilityRequirement[]): AgentDefinition[];
  activateAgent(agentId: string, version: string): boolean;
  suspendAgent(agentId: string): boolean;
  resumeAgent(agentId: string): boolean;
  retireAgent(agentId: string): boolean;
  validateAgentOutput(output: unknown, schema: SchemaDefinition): { valid: boolean; errors: string[] };
}
```

### 39.2 API Naming Conventions

Names follow repository conventions:
- `createAgentDefinition` (not `spawnAgent`)
- `validateAgentDefinition` (not `checkAgent`)
- `specializeAgent` (not `customizeAgent`)
- `registerAgent` (not `addAgent`)
- `resolveAgent` (not `findAgent`)
- `selectAgents` (not `chooseAgent`)
- `activateAgent` / `suspendAgent` / `retireAgent` (state transitions)
- `validateAgentOutput` (not `checkAgentResult`)

---

## 40. File Tree (Future)

```
src/lib/agents/
  types.ts              # Agent definition types, contracts, schemas
  limits.ts             # M8 limits, resource bounds, factory limits
  validation.ts         # Schema validation, security validation, resource validation
  state.ts              # Agent state machine, transitions
  registry.ts           # Agent Registry implementation
  templates.ts          # Template definitions, template validation
  specialization.ts     # Specialization logic, privilege expansion rejection
  selection.ts          # Deterministic agent selection, tie-breaking
  dependencies.ts       # Agent dependency management, cycle detection
  messaging.ts          # Structured agent messaging, validation
  execution.ts          # Agent execution model, M6/M7 integration
  lifecycle.ts          # Agent lifecycle management, suspension, retirement
  factory.ts            # Agent Factory implementation
  audit.ts              # M8 audit entries, audit integration
  memory.ts             # M5 MemoryFacade integration, memory attribution
  index.ts              # Barrel exports
  __tests__/
    registry.test.ts
    selection.test.ts
    factory.test.ts
    lifecycle.test.ts
    messaging.test.ts
    dependencies.test.ts
    security.test.ts
    adversarial.test.ts
```

---

## 41. Dependency Graph

```
M5 Memory Facade
    ↓ (read-only via MemoryFacade)
M6 Capability Plane
    ↓ (authorization, tools, skills, approvals, audit)
M7 Project Factory
    ↓ (project/task execution, checkpoints, artifacts)
M8 Agent Factory
    ↓ (agent definitions, selection, lifecycle)
KANIYAN / Orchestrator
    ↓ (goal analysis, task assignment)
User Goal
```

**Why one-directional**: M8 consumes M5/M6/M7 capabilities but cannot alter their security semantics. M8 must not modify the authority of any lower layer.

---

## 42. No New Dependencies by Default

Assume **NO NEW NPM DEPENDENCIES** unless future implementation genuinely requires one. Prefer existing repository infrastructure and Node.js standard capabilities.

---

## 43. Storage Design

### 43.1 Storage Requirements

Future agent definitions could be persisted while remaining compatible with the mobile/local-first architecture.

Do NOT introduce:
- Mandatory cloud database
- Upstash
- Redis
- New remote persistence

### 43.2 Storage Approach

Agent definitions are stored in the existing `InMemoryStore` (or compatible persistence layer) with:
- `agentId` as key
- Versioned definitions
- Immutable version records
- Full historical attribution

Memory operations use the existing M5.10 MemoryFacade.

---

## 44. Test Strategy

### 44.1 Registry Tests

- Registration: duplicate version, lookup, activation, retirement
- Duplicate version rejection
- Unknown agent lookup
- Activation/deactivation state transitions
- Retirement preserves historical attribution

### 44.2 Selection Tests

- Matching: exact capability match, partial match rejection
- Determinism: identical inputs produce identical outputs
- Permission filtering: denied capability excluded
- Resource filtering: insufficient resources excluded
- No-match: structured error returned

### 44.3 Factory Tests

- Template validation: valid/invalid template
- Specialization: valid/invalid specialization
- Security rejection: privilege escalation rejected
- Resource rejection: exceeding limits rejected
- Approval requirement: approval needed for sensitive creation

### 44.4 Lifecycle Tests

- Valid transitions: DRAFT → VALIDATING → REGISTERED → ACTIVE
- Invalid transitions: DRAFT → ACTIVE forbidden
- Suspension: new work blocked, existing work checkpointed
- Resume: integrity verified before restore
- Retirement: no new tasks, historical attribution preserved

### 44.5 Messaging Tests

- Schema validation: valid/invalid message structure
- Spoofing rejection: unknown sender/recipient rejected
- Oversized payload: rejected
- Payload is DATA: no executable commands

### 44.6 Dependency Tests

- Cycle detection: circular dependency rejected
- Depth limit: exceeding depth rejected
- Missing dependency: referenced agent not found
- Self-dependency: agent depending on itself rejected

### 44.7 Security Tests

- Prompt injection: malicious input treated as DATA
- Fake authority: fake approval rejected
- Self-approval: agent approving own action rejected
- Unlimited spawning: exceeding maxActiveAgents rejected
- Privilege escalation: weakening security rejected
- MCP abuse: unrestricted MCP access rejected
- Memory poisoning: invalid memory rejected
- Audit tampering: modifying audit entries rejected

---

## 45. Adversarial Tests

### 45.1 Adversarial Test Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Agent asks to create itself | REJECTED by factory |
| Agent asks for unrestricted permissions | REJECTED by security validation |
| Agent attempts to modify security root | REJECTED, AUDITED |
| Agent sends fake approval | REJECTED by ApprovalStore |
| Agent impersonates another agent | REJECTED by sender verification |
| Agent sends executable command payload | REJECTED by schema validation |
| Agent creates circular dependency | REJECTED by cycle detection |
| Agent spawns unlimited specialists | REJECTED by factory limits |
| Agent modifies its own limits | REJECTED by immutability |
| Agent modifies its own status | REJECTED by state machine |
| Agent injects malicious memory | REJECTED by validation |
| Agent returns forged provenance | REJECTED by provenance verification |
| Agent attempts M6 bypass | REJECTED by M6 policy |
| Agent attempts M7 bypass | REJECTED by M7 lifecycle |
| Agent attempts M9 capability | REJECTED by M8/M9 boundary |
| Agent attempts M11 self-modification | REJECTED by M8/M11 boundary |

Every case must fail safely.

---

## 46. Deterministic Boundaries

### 46.1 Deterministic Control Points

The following are controlled by deterministic code, not by LLM/agent preference:

- Schema validation
- Identity validation
- Version validation
- State transitions
- Agent eligibility
- Capability authorization
- Approval verification
- Resource limits
- Dependency validation
- Spawning limits
- Retry limits
- Audit

**Principle**: The model proposes; deterministic code disposes.

---

## 47. Implementation Order (Future)

### 47.1 Recommended Sequence

| Phase | Component |
|-------|-----------|
| M8.1 | Agent contracts (types, schemas) |
| M8.2 | Limits + validation |
| M8.3 | Agent lifecycle (state machine) |
| M8.4 | Registry |
| M8.5 | Templates |
| M8.6 | Specialization |
| M8.7 | Deterministic selection |
| M8.8 | Dependencies |
| M8.9 | Messaging |
| M8.10 | Agent Factory |
| M8.11 | M6/M7 integration |
| M8.12 | Memory integration |
| M8.13 | Audit |
| M8.14 | Security hardening |
| M8.15 | Full validation |

---

## 48. Definition of Done (Future)

M8 implementation completion criteria must include:

- Typed contracts
- Deterministic lifecycle
- Registry
- Templates
- Specialization
- Selection
- Dependency management
- Bounded spawning
- Structured messaging
- M6 integration
- M7 integration
- M5 integration
- Approval integration
- Audit
- Security enforcement
- Mobile constraints
- Offline behavior
- Comprehensive tests
- Adversarial tests
- Typecheck
- Lint
- Build

**None of this should be implemented now.**

---

## 49. Document Quality

This design document is implementation-ready. For every major subsystem, the following are defined:

- Purpose
- Inputs
- Outputs
- State
- Invariants
- Limits
- Security rules
- Failure behavior
- Dependencies
- Future API
- Tests

No vague statements such as "AI decides" or "agent can do anything" appear. All behavior is defined by deterministic contracts.

---

## 50. Milestone Status

| Milestone | Status |
|-----------|--------|
| M1–M4.6 | COMPLETE |
| M5.1–M5.10 | COMPLETE |
| M6 | COMPLETE |
| M7 DESIGN | COMPLETE |
| M7 IMPLEMENT | COMPLETE |
| M8 DESIGN | **CURRENT** |
| M8 IMPLEMENT | NOT STARTED |
| M9 | NOT STARTED |
| M10 | NOT STARTED |
| M11 | NOT STARTED |
| M12 | NOT STARTED |

---

## 51. Source Changes

**NONE** — This is a design-only milestone. No source code has been modified.

---

## 52. Final Stop Condition

After producing this design document:

**STOP.**

Do NOT:
- Implement M8
- Create agents
- Create Agent Factory source files
- Modify M5
- Modify M6
- Modify M7
- Implement M9
- Implement M10
- Implement M11
- Implement M12
- Commit
- Push

The only deliverable is:

**`docs/m8-agent-factory-design.md`**

The design must be complete enough that a separate future M8 implementation prompt can implement it without inventing architecture.

---

*End of M8 Design Document*
