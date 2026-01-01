import type { MarketData, PortfolioSnapshot, StrategySignal } from './types';

export interface Strategy {
  name: string;
  analyze(data: StrategyInput): Promise<StrategySignal | null>;
}

export interface StrategyInput {
  market: MarketData;
  portfolio: PortfolioSnapshot;
  historicalPrices?: number[];
}

export class MovingAverageCrossover implements Strategy {
  name = 'Moving Average Crossover';

  private shortPeriod: number;
  private longPeriod: number;

  constructor(shortPeriod = 10, longPeriod = 20) {
    this.shortPeriod = shortPeriod;
    this.longPeriod = longPeriod;
  }

  async analyze(input: StrategyInput): Promise<StrategySignal | null> {
    const { market, historicalPrices } = input;

    if (!historicalPrices || historicalPrices.length < this.longPeriod) {
      return null;
    }

    const shortMA = this.calculateMA(historicalPrices, this.shortPeriod);
    const longMA = this.calculateMA(historicalPrices, this.longPeriod);

    const prevShortMA = this.calculateMA(historicalPrices.slice(0, -1), this.shortPeriod);
    const prevLongMA = this.calculateMA(historicalPrices.slice(0, -1), this.longPeriod);

    if (prevShortMA <= prevLongMA && shortMA > longMA) {
      return {
        action: 'buy',
        asset: market.symbol,
        confidence: Math.min((shortMA - longMA) / longMA * 100, 1),
        reason: `Short MA (${shortMA.toFixed(2)}) crossed above Long MA (${longMA.toFixed(2)})`,
        metadata: { shortMA, longMA, shortPeriod: this.shortPeriod, longPeriod: this.longPeriod }
      };
    }

    if (prevShortMA >= prevLongMA && shortMA < longMA) {
      return {
        action: 'sell',
        asset: market.symbol,
        confidence: Math.min((longMA - shortMA) / longMA * 100, 1),
        reason: `Short MA (${shortMA.toFixed(2)}) crossed below Long MA (${longMA.toFixed(2)})`,
        metadata: { shortMA, longMA, shortPeriod: this.shortPeriod, longPeriod: this.longPeriod }
      };
    }

    return {
      action: 'hold',
      asset: market.symbol,
      confidence: 0.5,
      reason: 'No crossover detected',
      metadata: { shortMA, longMA }
    };
  }

  private calculateMA(prices: number[], period: number): number {
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }
}

export class RSIStrategy implements Strategy {
  name = 'RSI Strategy';

  private period: number;
  private oversoldThreshold: number;
  private overboughtThreshold: number;

  constructor(period = 14, oversold = 30, overbought = 70) {
    this.period = period;
    this.oversoldThreshold = oversold;
    this.overboughtThreshold = overbought;
  }

  async analyze(input: StrategyInput): Promise<StrategySignal | null> {
    const { market, historicalPrices } = input;

    if (!historicalPrices || historicalPrices.length < this.period + 1) {
      return null;
    }

    const rsi = this.calculateRSI(historicalPrices);

    if (rsi <= this.oversoldThreshold) {
      return {
        action: 'buy',
        asset: market.symbol,
        confidence: (this.oversoldThreshold - rsi) / this.oversoldThreshold,
        reason: `RSI (${rsi.toFixed(2)}) is oversold (below ${this.oversoldThreshold})`,
        metadata: { rsi, threshold: this.oversoldThreshold }
      };
    }

    if (rsi >= this.overboughtThreshold) {
      return {
        action: 'sell',
        asset: market.symbol,
        confidence: (rsi - this.overboughtThreshold) / (100 - this.overboughtThreshold),
        reason: `RSI (${rsi.toFixed(2)}) is overbought (above ${this.overboughtThreshold})`,
        metadata: { rsi, threshold: this.overboughtThreshold }
      };
    }

    return {
      action: 'hold',
      asset: market.symbol,
      confidence: 0.5,
      reason: `RSI (${rsi.toFixed(2)}) is neutral`,
      metadata: { rsi }
    };
  }

  private calculateRSI(prices: number[]): number {
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    const recentChanges = changes.slice(-this.period);
    const gains = recentChanges.filter(c => c > 0);
    const losses = recentChanges.filter(c => c < 0).map(c => Math.abs(c));

    const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / this.period : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / this.period : 0;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
}

export class RebalanceStrategy implements Strategy {
  name = 'Portfolio Rebalance';

  private targetAllocations: Map<string, number>;
  private threshold: number;

  constructor(allocations: Record<string, number>, threshold = 0.05) {
    this.targetAllocations = new Map(Object.entries(allocations));
    this.threshold = threshold;
  }

  async analyze(input: StrategyInput): Promise<StrategySignal | null> {
    const { market, portfolio } = input;

    const targetAllocation = this.targetAllocations.get(market.symbol);
    if (targetAllocation === undefined) return null;

    const currentAsset = portfolio.assets.find(a => a.symbol === market.symbol);
    const currentAllocation = currentAsset?.allocation || 0;

    const deviation = currentAllocation - targetAllocation;

    if (Math.abs(deviation) > this.threshold) {
      const action = deviation > 0 ? 'sell' : 'buy';
      return {
        action,
        asset: market.symbol,
        confidence: Math.min(Math.abs(deviation) / this.threshold, 1),
        reason: `${market.symbol} allocation (${(currentAllocation * 100).toFixed(1)}%) deviates from target (${(targetAllocation * 100).toFixed(1)}%) by ${(Math.abs(deviation) * 100).toFixed(1)}%`,
        metadata: { currentAllocation, targetAllocation, deviation }
      };
    }

    return {
      action: 'hold',
      asset: market.symbol,
      confidence: 1 - Math.abs(deviation) / this.threshold,
      reason: `${market.symbol} allocation is within threshold`,
      metadata: { currentAllocation, targetAllocation, deviation }
    };
  }
}

export class CompositeStrategy implements Strategy {
  name = 'Composite Strategy';

  private strategies: Strategy[];
  private weights: number[];

  constructor(strategies: Strategy[], weights?: number[]) {
    this.strategies = strategies;
    this.weights = weights || strategies.map(() => 1 / strategies.length);
  }

  async analyze(input: StrategyInput): Promise<StrategySignal | null> {
    const signals = await Promise.all(
      this.strategies.map(s => s.analyze(input))
    );

    const validSignals = signals.filter((s): s is StrategySignal => s !== null);
    if (validSignals.length === 0) return null;

    const actionScores: Record<string, number> = { buy: 0, sell: 0, hold: 0 };

    validSignals.forEach((signal, idx) => {
      const weight = this.weights[idx] || 1 / validSignals.length;
      actionScores[signal.action] += signal.confidence * weight;
    });

    const [topAction] = Object.entries(actionScores)
      .sort(([, a], [, b]) => b - a)[0] as [StrategySignal['action'], number];

    const reasons = validSignals
      .filter(s => s.action === topAction)
      .map(s => s.reason);

    return {
      action: topAction,
      asset: input.market.symbol,
      confidence: actionScores[topAction] / this.weights.reduce((a, b) => a + b, 0),
      reason: reasons.join('; '),
      metadata: {
        individualSignals: validSignals,
        actionScores
      }
    };
  }
}
