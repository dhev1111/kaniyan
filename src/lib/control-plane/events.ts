import type { ControlPlaneEvent, ControlPlaneEventType } from "./types";

type EventHandler = (event: ControlPlaneEvent) => void;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export class EventBus {
  private handlers: Map<ControlPlaneEventType, EventHandler[]> = new Map();
  private globalHandlers: EventHandler[] = [];
  private events: ControlPlaneEvent[] = [];

  on(type: ControlPlaneEventType, handler: EventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
    return () => {
      const list = this.handlers.get(type);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
    };
  }

  onAll(handler: EventHandler): () => void {
    this.globalHandlers.push(handler);
    return () => {
      const idx = this.globalHandlers.indexOf(handler);
      if (idx >= 0) this.globalHandlers.splice(idx, 1);
    };
  }

  emit(
    type: ControlPlaneEventType,
    source: string,
    data: Record<string, string> = {}
  ): ControlPlaneEvent {
    const event: ControlPlaneEvent = {
      id: generateId(),
      type,
      source,
      data,
      timestamp: new Date().toISOString(),
    };

    this.events.push(event);

    const typeHandlers = this.handlers.get(type) ?? [];
    for (const handler of typeHandlers) {
      handler(event);
    }
    for (const handler of this.globalHandlers) {
      handler(event);
    }

    return event;
  }

  getEvents(limit?: number): ControlPlaneEvent[] {
    const sorted = [...this.events].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return limit ? sorted.slice(0, limit) : sorted;
  }

  getEventsByType(
    type: ControlPlaneEventType,
    limit?: number
  ): ControlPlaneEvent[] {
    const filtered = this.events.filter((e) => e.type === type);
    const sorted = filtered.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return limit ? sorted.slice(0, limit) : sorted;
  }

  clear(): void {
    this.events = [];
  }
}

export const eventBus = new EventBus();
