# RotaFi Agent Frameworkd

A TypeScript framework for building autonomous trading agents that integrate with the RotaFi SDK.

## Features

- **BaseAgent Class**: Extensible base class with lifecycle management, retry logic, and timeout handling
- **Event System**: Pub/sub architecture for agent communication and monitoring
- **Built-in Strategies**: Moving Average Crossover, RSI, Portfolio Rebalancing, and Composite strategies
- **Agent Manager**: Orchestrate multiple agents with centralized control
- **Metrics Tracking**: Automatic performance monitoring and statistics

## Quick Start

```typescript
import {
  BaseAgent,
  AgentManager,
  EventBus,
  AgentEvents,
  MovingAverageCrossover,
  type AgentContext,
  type MarketData
} from '@rotafi/sdk/agent-framework';

// Create a custom trading agent
class TradingAgent extends BaseAgent<void> {
  private strategy = new MovingAverageCrossover(10, 20);

  async execute(context: AgentContext): Promise<void> {
    const marketData = await this.fetchMarketData();
    const portfolio = await this.fetchPortfolio();

    const signal = await this.strategy.analyze({
      market: marketData,
      portfolio,
      historicalPrices: await this.getHistoricalPrices()
    });

    if (signal && signal.action !== 'hold') {
      console.log(`Signal: ${signal.action} ${signal.asset} (${signal.confidence * 100}%)`);
    }
  }

  private async fetchMarketData(): Promise<MarketData> {
    // Implement market data fetching
  }

  private async fetchPortfolio() {
    // Implement portfolio fetching
  }

  private async getHistoricalPrices(): Promise<number[]> {
    // Implement historical price fetching
  }
}

// Initialize and run
const eventBus = new EventBus();
const manager = new AgentManager(eventBus);

const agent = new TradingAgent({
  id: 'btc-trader',
  name: 'BTC Trading Agent',
  maxRetries: 3,
  timeoutMs: 30000
}, eventBus);

manager.register(agent, 60000); // Run every minute

// Subscribe to events
eventBus.subscribe(AgentEvents.SIGNAL_GENERATED, (event) => {
  console.log('Signal:', event.payload);
});

// Start all agents
await manager.startAll();
```

## Core Concepts

### BaseAgent

The `BaseAgent` class provides:

- **Lifecycle Methods**: `start()`, `stop()`, `pause()`, `resume()`
- **Automatic Retries**: Configurable retry count and delay
- **Timeout Handling**: Prevent runaway executions
- **Metrics Collection**: Track success/failure rates and timing

```typescript
class MyAgent extends BaseAgent<ResultType> {
  async execute(context: AgentContext): Promise<ResultType> {
    // Your agent logic here
    return result;
  }

  // Optional lifecycle hooks
  protected async onStart() {}
  protected async onStop() {}
  protected async onError(error: Error) {}
}
```

### Configuration

```typescript
interface AgentConfig {
  id: string;           // Unique identifier
  name: string;         // Display name
  description?: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  maxRetries?: number;  // Default: 3
  retryDelayMs?: number; // Default: 1000
  timeoutMs?: number;   // Default: 30000
  enabled?: boolean;    // Default: true
}
```

### Event System

The `EventBus` enables communication between agents:

```typescript
const eventBus = new EventBus();

// Subscribe to specific events
const sub = eventBus.subscribe(AgentEvents.EXECUTION_COMPLETE, (event) => {
  console.log(`Agent ${event.agentId} completed execution`);
});

// Subscribe to all events
eventBus.subscribeAll((event) => {
  console.log(`Event: ${event.type}`);
});

// Emit custom events
eventBus.emit({
  type: 'custom:event',
  agentId: 'my-agent',
  payload: { data: 'value' },
  timestamp: new Date()
});

// Unsubscribe
sub.unsubscribe();
```

### Built-in Events

| Event | Description |
|-------|-------------|
| `agent:started` | Agent has started |
| `agent:stopped` | Agent has stopped |
| `agent:paused` | Agent has been paused |
| `agent:resumed` | Agent has resumed |
| `agent:error` | Agent encountered an error |
| `agent:execution:start` | Execution cycle started |
| `agent:execution:complete` | Execution cycle completed |
| `agent:execution:failed` | Execution cycle failed |
| `agent:signal:generated` | Trading signal generated |
| `agent:trade:executed` | Trade was executed |
| `agent:metrics:updated` | Metrics were updated |

## Strategies

### Moving Average Crossover

```typescript
const strategy = new MovingAverageCrossover(
  10,  // Short period
  20   // Long period
);

const signal = await strategy.analyze({
  market: marketData,
  portfolio: portfolioSnapshot,
  historicalPrices: prices
});
```

### RSI Strategy

```typescript
const strategy = new RSIStrategy(
  14,  // Period
  30,  // Oversold threshold
  70   // Overbought threshold
);
```

### Rebalance Strategy

```typescript
const strategy = new RebalanceStrategy(
  {
    BTC: 0.5,   // 50% allocation
    ETH: 0.3,   // 30% allocation
    USDC: 0.2   // 20% allocation
  },
  0.05  // 5% deviation threshold
);
```

### Composite Strategy

Combine multiple strategies with weighted voting:

```typescript
const composite = new CompositeStrategy(
  [
    new MovingAverageCrossover(10, 20),
    new RSIStrategy(14),
    new RebalanceStrategy({ BTC: 0.6, ETH: 0.4 })
  ],
  [0.4, 0.4, 0.2]  // Weights
);
```

## Agent Manager

Orchestrate multiple agents:

```typescript
const manager = new AgentManager(eventBus);

// Register agents
manager.register(tradingAgent, 60000);
manager.register(rebalanceAgent, 3600000);

// Control agents
await manager.startAll();
await manager.pauseAgent('trader-1');
await manager.stopAgent('trader-2');

// Get metrics
const metrics = manager.getAggregatedMetrics();
console.log(`Total executions: ${metrics.totalExecutions}`);
console.log(`Success rate: ${metrics.successfulExecutions / metrics.totalExecutions * 100}%`);

// List agents
const agents = manager.getAllAgentIds();
const runningCount = manager.getRunningAgentCount();
```

## Metrics

Access agent performance metrics:

```typescript
const metrics = agent.getMetrics();

console.log({
  totalExecutions: metrics.totalExecutions,
  successRate: metrics.successfulExecutions / metrics.totalExecutions,
  avgExecutionTime: metrics.averageExecutionTimeMs,
  uptime: metrics.uptime
});
```

## Context & Metadata

Store state across executions:

```typescript
class StatefulAgent extends BaseAgent<void> {
  async execute(context: AgentContext): Promise<void> {
    // Access iteration count
    console.log(`Iteration: ${context.iteration}`);

    // Store metadata
    this.setMetadata('lastPrice', currentPrice);

    // Retrieve metadata
    const lastPrice = this.getMetadata<number>('lastPrice');
  }
}
```

## Error Handling

```typescript
class ResilientAgent extends BaseAgent<void> {
  protected async onError(error: Error): Promise<void> {
    // Custom error handling
    await this.notifyAdmin(error);
    await this.saveErrorLog(error);
  }

  async execute(context: AgentContext): Promise<void> {
    if (context.lastError) {
      // Previous execution failed
      console.log(`Recovering from: ${context.lastError.message}`);
    }
    // Continue execution
  }
}
```

## License

MIT
