import type { AgentEvent, EventHandler, Subscription } from './types';

export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private wildcardHandlers: Set<EventHandler> = new Set();
  private subscriptionCounter = 0;

  subscribe<T = unknown>(eventType: string, handler: EventHandler<T>): Subscription {
    const id = `sub_${++this.subscriptionCounter}`;

    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }

    this.handlers.get(eventType)!.add(handler as EventHandler);

    return {
      id,
      unsubscribe: () => {
        this.handlers.get(eventType)?.delete(handler as EventHandler);
      }
    };
  }

  subscribeAll(handler: EventHandler): Subscription {
    const id = `sub_${++this.subscriptionCounter}`;
    this.wildcardHandlers.add(handler);

    return {
      id,
      unsubscribe: () => {
        this.wildcardHandlers.delete(handler);
      }
    };
  }

  async emit<T = unknown>(event: AgentEvent<T>): Promise<void> {
    const handlers = this.handlers.get(event.type) || new Set();
    const allHandlers = [...handlers, ...this.wildcardHandlers];

    await Promise.all(
      allHandlers.map(async (handler) => {
        try {
          await handler(event as AgentEvent);
        } catch (error) {
          console.error(`Event handler error for ${event.type}:`, error);
        }
      })
    );
  }

  clear(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
  }
}

export const AgentEvents = {
  STARTED: 'agent:started',
  STOPPED: 'agent:stopped',
  PAUSED: 'agent:paused',
  RESUMED: 'agent:resumed',
  ERROR: 'agent:error',
  EXECUTION_START: 'agent:execution:start',
  EXECUTION_COMPLETE: 'agent:execution:complete',
  EXECUTION_FAILED: 'agent:execution:failed',
  SIGNAL_GENERATED: 'agent:signal:generated',
  TRADE_EXECUTED: 'agent:trade:executed',
  PORTFOLIO_UPDATED: 'agent:portfolio:updated',
  METRICS_UPDATED: 'agent:metrics:updated',
} as const;

export type AgentEventType = typeof AgentEvents[keyof typeof AgentEvents];

export function createEvent<T>(
  type: string,
  agentId: string,
  payload: T
): AgentEvent<T> {
  return {
    type,
    agentId,
    payload,
    timestamp: new Date()
  };
}
