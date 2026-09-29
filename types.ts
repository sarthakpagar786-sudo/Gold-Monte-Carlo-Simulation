
export interface SimulationResult {
  date: string;
  [key: string]: number | string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface MarketData {
  currentPrice: number;
  sixMonthHigh: number;
  sixMonthLow: number;
  volatilityEstimate: number; // annualized
  annualReturnEstimate: number;
  lastUpdated: string;
  sources: GroundingSource[];
}

export interface ProjectionStats {
  median: number;
  p5: number;
  p95: number;
  expectedReturn: number;
}

export interface PriceAlert {
  id: string;
  price: number;
  label: string;
  direction: 'below' | 'above' | 'either';
  color: string;
  active: boolean;
  createdAt: string;
}

export interface AlertBreachStats {
  alertId: string;
  breachProbability: number; // 0 to 100%
  breachedCount: number;
  totalPaths: number;
  earliestBreachDay: number | null;
  medianBreachDay: number | null;
  medianCrossed: boolean;
  terminalBreachedPct: number;
}
