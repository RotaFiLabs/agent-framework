import { BaseAgent } from './agent';
import { EventBus, AgentEvents, createEvent } from './events';
import type { AgentMetrics, AgentStatus, Subscription } from './types';

interface ManagedAgent {
  agent: BaseAgent;
  intervalMs?: number;
}

export class AgentManager {
  private agents: Map<string, ManagedAgent> = new Map();
  private eventBus: EventBus;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus || new EventBus();
  }

  register(agent: BaseAgent, intervalMs?: number): void {
    const config = agent.getConfig();

    if (this.agents.has(config.id)) {
      throw new Error(`Agent with id "${config.id}" already registered`);
    }

    this.agents.set(config.id, { agent, intervalMs });
  }

  unregister(agentId: string): void {
    const managed = this.agents.get(agentId);
    if (managed) {
      managed.agent.stop();
      this.agents.delete(agentId);
    }
  }

  async startAgent(agentId: string): Promise<void> {
    const managed = this.agents.get(agentId);
    if (!managed) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    await managed.agent.start(managed.intervalMs);
  }

  async stopAgent(agentId: string): Promise<void> {
    const managed = this.agents.get(agentId);
    if (!managed) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    await managed.agent.stop();
  }

  async pauseAgent(agentId: string): Promise<void> {
    const managed = this.agents.get(agentId);
    if (!managed) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    await managed.agent.pause();
  }

  async resumeAgent(agentId: string): Promise<void> {
    const managed = this.agents.get(agentId);
    if (!managed) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    await managed.agent.resume();
  }

  async startAll(): Promise<void> {
    await this.eventBus.emit(createEvent('manager:starting', 'manager', { agentCount: this.agents.size }));

    const startPromises = Array.from(this.agents.entries()).map(
      async ([id, managed]) => {
        try {
          await managed.agent.start(managed.intervalMs);
        } catch (error) {
          console.error(`Failed to start agent ${id}:`, error);
        }
      }
    );

    await Promise.all(startPromises);
    await this.eventBus.emit(createEvent('manager:started', 'manager', { agentCount: this.agents.size }));
  }

  async stopAll(): Promise<void> {
    await this.eventBus.emit(createEvent('manager:stopping', 'manager', { agentCount: this.agents.size }));

    const stopPromises = Array.from(this.agents.values()).map(
      async (managed) => {
        try {
          await managed.agent.stop();
        } catch (error) {
          console.error('Failed to stop agent:', error);
        }
      }
    );

    await Promise.all(stopPromises);
    await this.eventBus.emit(createEvent('manager:stopped', 'manager', { agentCount: this.agents.size }));
  }

  getAgent<T extends BaseAgent>(agentId: string): T | undefined {
    return this.agents.get(agentId)?.agent as T | undefined;
  }

  getAgentStatus(agentId: string): AgentStatus | undefined {
    return this.agents.get(agentId)?.agent.getStatus();
  }

  getAgentMetrics(agentId: string): AgentMetrics | undefined {
    return this.agents.get(agentId)?.agent.getMetrics();
  }

  getAllAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  getAgentCount(): number {
    return this.agents.size;
  }

  getRunningAgentCount(): number {
    return Array.from(this.agents.values())
      .filter(m => m.agent.getStatus() === 'running')
      .length;
  }

  getAggregatedMetrics(): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTimeMs: number;
  } {
    const metrics = Array.from(this.agents.values())
      .map(m => m.agent.getMetrics());

    if (metrics.length === 0) {
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTimeMs: 0
      };
    }

    const totals = metrics.reduce(
      (acc, m) => ({
        totalExecutions: acc.totalExecutions + m.totalExecutions,
        successfulExecutions: acc.successfulExecutions + m.successfulExecutions,
        failedExecutions: acc.failedExecutions + m.failedExecutions,
        totalTime: acc.totalTime + m.averageExecutionTimeMs * m.totalExecutions
      }),
      { totalExecutions: 0, successfulExecutions: 0, failedExecutions: 0, totalTime: 0 }
    );

    return {
      totalExecutions: totals.totalExecutions,
      successfulExecutions: totals.successfulExecutions,
      failedExecutions: totals.failedExecutions,
      averageExecutionTimeMs: totals.totalExecutions > 0
        ? totals.totalTime / totals.totalExecutions
        : 0
    };
  }

  subscribe(eventType: string, handler: (event: unknown) => void): Subscription {
    return this.eventBus.subscribe(eventType, handler);
  }

  subscribeToAgentEvents(handler: (event: unknown) => void): Subscription {
    return this.eventBus.subscribeAll(handler);
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }
}
