import type { AgentDefinition, AgentDependency } from "./types";
import { M8_LIMITS } from "./limits";

export interface DependencyValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
}

export interface DependencyGraph {
  readonly nodes: string[];
  readonly edges: Map<string, string[]>;
}

export function buildDependencyGraph(definitions: AgentDefinition[]): DependencyGraph {
  const nodes: string[] = definitions.map((d) => d.agentId);
  const edges = new Map<string, string[]>();
  for (const def of definitions) {
    const deps = def.dependencies.map((d) => d.agentId);
    edges.set(def.agentId, deps.slice().sort());
  }
  nodes.sort();
  return { nodes, edges };
}

export function detectCycleInGraph(graph: DependencyGraph): { hasCycle: boolean; cycle?: string[] } {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];
  let foundCycle: string[] | undefined;

  function dfs(node: string): boolean {
    visited.add(node);
    stack.add(node);
    path.push(node);
    const neighbors = graph.edges.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (stack.has(neighbor)) {
        const idx = path.indexOf(neighbor);
        foundCycle = path.slice(idx).concat(neighbor);
        return true;
      }
    }
    stack.delete(node);
    path.pop();
    return false;
  }

  for (const node of graph.nodes) {
    if (!visited.has(node)) {
      if (dfs(node)) return { hasCycle: true, cycle: foundCycle };
    }
  }
  return { hasCycle: false };
}

export function detectCycle(dependencies: AgentDependency[], agentId: string): boolean {
  const graph: DependencyGraph = {
    nodes: [agentId, ...dependencies.map((d) => d.agentId)],
    edges: new Map<string, string[]>(),
  };
  graph.edges.set(agentId, dependencies.map((d) => d.agentId));
  for (const dep of dependencies) {
    if (!graph.edges.has(dep.agentId)) {
      graph.edges.set(dep.agentId, []);
    }
  }
  return detectCycleInGraph(graph).hasCycle;
}

export function computeDependencyDepth(
  agentId: string,
  graph: DependencyGraph,
  memo = new Map<string, number>(),
  visiting = new Set<string>()
): number {
  if (memo.has(agentId)) return memo.get(agentId)!;
  if (visiting.has(agentId)) return 0;
  visiting.add(agentId);
  const deps = graph.edges.get(agentId) ?? [];
  if (deps.length === 0) {
    memo.set(agentId, 0);
    visiting.delete(agentId);
    return 0;
  }
  let max = 0;
  for (const dep of deps) {
    const d = computeDependencyDepth(dep, graph, memo, visiting) + 1;
    if (d > max) max = d;
  }
  memo.set(agentId, max);
  visiting.delete(agentId);
  return max;
}

export function validateDependencies(
  dependencies: AgentDependency[],
  allAgentIds: Set<string>,
  agentId?: string
): DependencyValidationResult {
  const errors: string[] = [];

  if (dependencies.length > M8_LIMITS.maxAgentDependencyDepth * 2) {
    errors.push(`dependency count ${dependencies.length} exceeds max ${M8_LIMITS.maxAgentDependencyDepth * 2}`);
  }

  if (dependencies.length > 10) {
    errors.push(`dependency count ${dependencies.length} exceeds max 10`);
  }

  for (const dep of dependencies) {
    if (!dep.agentId || typeof dep.agentId !== "string" || dep.agentId.trim() === "") {
      errors.push("dependency agentId must be a non-empty string");
      continue;
    }
    if (agentId && dep.agentId === agentId) {
      errors.push(`self-dependency detected: ${agentId} depends on itself`);
    }
    if (!allAgentIds.has(dep.agentId)) {
      errors.push(`missing dependency agent ${dep.agentId}`);
    }
    if (!dep.version || typeof dep.version !== "string" || dep.version.trim() === "") {
      errors.push(`dependency version must be non-empty for ${dep.agentId}`);
    }
  }

  const seen = new Set<string>();
  for (const dep of dependencies) {
    const key = `${dep.agentId}@${dep.version}`;
    if (seen.has(key)) {
      errors.push(`duplicate dependency ${key}`);
    }
    seen.add(key);
  }

  if (agentId) {
    const graph: DependencyGraph = {
      nodes: [agentId, ...Array.from(allAgentIds)],
      edges: new Map<string, string[]>(),
    };
    graph.edges.set(agentId, dependencies.map((d) => d.agentId));
    for (const id of allAgentIds) {
      if (!graph.edges.has(id)) graph.edges.set(id, []);
    }
    const cycle = detectCycleInGraph(graph);
    if (cycle.hasCycle) {
      errors.push(`circular dependency detected: ${cycle.cycle?.join(" -> ")}`);
    }
    const depth = computeDependencyDepth(agentId, graph);
    if (depth > M8_LIMITS.maxAgentDependencyDepth) {
      errors.push(`dependency depth ${depth} exceeds max ${M8_LIMITS.maxAgentDependencyDepth}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateAgentDependencies(
  definition: AgentDefinition,
  allDefinitions: AgentDefinition[]
): DependencyValidationResult {
  const allIds = new Set(allDefinitions.map((d) => d.agentId));
  return validateDependencies(definition.dependencies, allIds, definition.agentId);
}

export function resolveDependencyOrder(definitions: AgentDefinition[]): {
  order: string[];
  hasCycle: boolean;
} {
  const graph = buildDependencyGraph(definitions);
  const cycle = detectCycleInGraph(graph);
  if (cycle.hasCycle) return { order: [], hasCycle: true };

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const node of graph.nodes) {
    inDegree.set(node, 0);
    dependents.set(node, []);
  }
  for (const [node, deps] of graph.edges) {
    inDegree.set(node, deps.length);
    for (const dep of deps) {
      const list = dependents.get(dep) ?? [];
      list.push(node);
      dependents.set(dep, list);
    }
  }

  const queue: string[] = [];
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node);
  }
  queue.sort();

  const order: string[] = [];
  while (queue.length > 0) {
    queue.sort();
    const node = queue.shift()!;
    order.push(node);
    const neigh = dependents.get(node) ?? [];
    for (const dependent of neigh) {
      const deg = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, deg);
      if (deg === 0) queue.push(dependent);
    }
  }

  return { order, hasCycle: order.length !== graph.nodes.length };
}

export function getTransitiveDependencies(
  agentId: string,
  graph: DependencyGraph
): Set<string> {
  const result = new Set<string>();
  const visited = new Set<string>();

  function dfs(current: string): void {
    if (visited.has(current)) return;
    visited.add(current);
    const deps = graph.edges.get(current) ?? [];
    for (const dep of deps) {
      result.add(dep);
      dfs(dep);
    }
  }

  dfs(agentId);
  return result;
}
