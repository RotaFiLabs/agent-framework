import type {
  AgentConfig,
  AgentContext,
  AgentMetrics,
  AgentStatus,
  ExecutionResult
} from './types';
import { EventBus, AgentEvents, createEvent } from './events';

export abstract class BaseAgent<TResult = unknown> {
  protected config: Required<AgentConfig>;
  protected status: AgentStatus = 'idle';
  protected context: AgentContext;
  protected metrics: AgentMetrics;
  protected eventBus: EventBus;
  private intervalId?: ReturnType<typeof setInterval>;
  private startTime?: Date;

  constructor(config: AgentConfig, eventBus?: EventBus) {
    this.config = {
      priority: 'normal',
      maxRetries: 3,
      retryDelayMs: 1000,
      timeoutMs: 30000,
      enabled: true,
      description: '',
      ...config
    };

    this.eventBus = eventBus || new EventBus();

    this.context = {
      agentId: config.id,
      startedAt: new Date(),
      iteration: 0,
      metadata: {}
    };

    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTimeMs: 0,
      uptime: 0
    };
  }

  abstract execute(context: AgentContext): Promise<TResult>;

  protected async onStart(): Promise<void> {}
  protected async onStop(): Promise<void> {}
  protected async onPause(): Promise<void> {}
  protected async onResume(): Promise<void> {}
  protected async onError(error: Error): Promise<void> {
    console.error(`Agent ${this.config.id} error:`, error);
  }

  async start(intervalMs?: number): Promise<void> {
    if (this.status === 'running') return;

    this.status = 'running';
    this.startTime = new Date();
    this.context.startedAt = this.startTime;

    await this.onStart();
    await this.eventBus.emit(createEvent(AgentEvents.STARTED, this.config.id, { config: this.config }));

    if (intervalMs) {
      this.intervalId = setInterval(() => this.tick(), intervalMs);
    }

    await this.tick();
  }

  async stop(): Promise<void> {
    if (this.status === 'stopped') return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.status = 'stopped';
    await this.onStop();
    await this.eventBus.emit(createEvent(AgentEvents.STOPPED, this.config.id, { metrics: this.metrics }));
  }

  async pause(): Promise<void> {
    if (this.status !== 'running') return;

    this.status = 'paused';
    await this.onPause();
    await this.eventBus.emit(createEvent(AgentEvents.PAUSED, this.config.id, {}));
  }

  async resume(): Promise<void> {
    if (this.status !== 'paused') return;

    this.status = 'running';
    await this.onResume();
    await this.eventBus.emit(createEvent(AgentEvents.RESUMED, this.config.id, {}));
  }

  private async tick(): Promise<void> {
    if (this.status !== 'running' || !this.config.enabled) return;

    this.context.iteration++;
    const result = await this.executeWithRetry();

    this.updateMetrics(result);
    await this.eventBus.emit(createEvent(AgentEvents.METRICS_UPDATED, this.config.id, { metrics: this.metrics }));
  }

  private async executeWithRetry(): Promise<ExecutionResult<TResult>> {
    let lastError: Error | undefined;
    const startTime = Date.now();

    await this.eventBus.emit(createEvent(AgentEvents.EXECUTION_START, this.config.id, { iteration: this.context.iteration }));

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const data = await this.withTimeout(this.execute(this.context));
        const executionTimeMs = Date.now() - startTime;

        await this.eventBus.emit(createEvent(AgentEvents.EXECUTION_COMPLETE, this.config.id, { data, executionTimeMs }));

        return {
          success: true,
          data,
          executionTimeMs,
          timestamp: new Date()
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.context.lastError = lastError;

        if (attempt < this.config.maxRetries - 1) {
          await this.delay(this.config.retryDelayMs * (attempt + 1));
        }
      }
    }

    this.status = 'error';
    await this.onError(lastError!);
    await this.eventBus.emit(createEvent(AgentEvents.EXECUTION_FAILED, this.config.id, { error: lastError }));
    await this.eventBus.emit(createEvent(AgentEvents.ERROR, this.config.id, { error: lastError }));

    return {
      success: false,
      error: lastError,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date()
    };
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Execution timeout')), this.config.timeoutMs)
      )
    ]);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private updateMetrics(result: ExecutionResult<TResult>): void {
    this.metrics.totalExecutions++;
    if (result.success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;
    }

    const totalTime = this.metrics.averageExecutionTimeMs * (this.metrics.totalExecutions - 1);
    this.metrics.averageExecutionTimeMs = (totalTime + result.executionTimeMs) / this.metrics.totalExecutions;
    this.metrics.lastExecutionAt = result.timestamp;

    if (this.startTime) {
      this.metrics.uptime = Date.now() - this.startTime.getTime();
    }
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  getMetrics(): AgentMetrics {
    return { ...this.metrics };
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  getContext(): AgentContext {
    return { ...this.context };
  }

  setMetadata(key: string, value: unknown): void {
    this.context.metadata[key] = value;
  }

  getMetadata<T>(key: string): T | undefined {
    return this.context.metadata[key] as T | undefined;
  }
}
