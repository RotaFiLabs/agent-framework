export type AgentStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error';

export type AgentPriority = 'low' | 'normal' | 'high' | 'critical';

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  priority?: AgentPriority;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface AgentContext {
  agentId: string;
  startedAt: Date;
  iteration: number;
  lastError?: Error;
  metadata: Record<string, unknown>;
}

export interface AgentMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTimeMs: number;
  lastExecutionAt?: Date;
  uptime: number;
}

export interface ExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
  executionTimeMs: number;
  timestamp: Date;
}

export interface StrategySignal {
  action: 'buy' | 'sell' | 'hold' | 'custom';
  asset: string;
  confidence: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface MarketData {
  symbol: string;
  price: number;
  volume24h: number;
  change24h: number;
  high24h: number;
  low24h: number;
  timestamp: Date;
}

export interface PortfolioSnapshot {
  totalValue: number;
  assets: Array<{
    symbol: string;
    balance: number;
    value: number;
    allocation: number;
  }>;
  timestamp: Date;
}

export interface AgentEvent<T = unknown> {
  type: string;
  agentId: string;
  payload: T;
  timestamp: Date;
}

export type EventHandler<T = unknown> = (event: AgentEvent<T>) => void | Promise<void>;

export interface Subscription {
  id: string;
  unsubscribe: () => void;
}
