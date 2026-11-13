export type PriceType = 'last' | 'mark' | 'index';

export interface CandleData {
  time: number; // Unix timestamp in seconds (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTimeMs?: number;
}

export interface Ticker24h {
  symbol: string;
  pairDisplay: string; // e.g. BTCUSDT.P
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number; // Base asset volume
  quoteVolume: number; // USDT volume
}

export type AlertCondition =
  | 'crossing'
  | 'crossing_up'
  | 'crossing_down'
  | 'price_reach'
  | 'price_rise'
  | 'price_drop';

export type AlertStatus = 'active' | 'triggered' | 'disabled';

export type AlertSoundType =
  | 'price_reach'
  | 'price_rise'
  | 'price_drop'
  | 'price_cross_above'
  | 'price_cross_below';

export interface PriceAlert {
  id: string;
  symbol: string;
  price: number;
  condition: AlertCondition;
  createdPrice: number;
  createdAt: number;
  status: AlertStatus;
  triggered: boolean; // backward compatibility
  triggeredAt?: number;
  repeat: 'once' | 'every_time';
  note?: string;
  sound: AlertSoundType;
  vibrate: boolean;
  priceType: PriceType;
}

export interface AlertEngineSettings {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  volume: number; // 0 to 1
}

export type ReplaySpeed = 0.5 | 1 | 2 | 3 | 5 | 10;

export interface ReplayState {
  isActive: boolean;
  isSelectingCutoff: boolean;
  isPlaying: boolean;
  speed: ReplaySpeed;
  currentIndex: number;
  cutoffTime?: number;
  allCandles: CandleData[];
}

export type DrawingTool =
  | 'cursor'
  | 'crosshair_alert'
  | 'trendline'
  | 'horizontal_line'
  | 'vertical_line'
  | 'ray'
  | 'extended_line'
  | 'rectangle'
  | 'brush'
  | 'arrow'
  | 'text'
  | 'fibonacci'
  | 'fibonacci_extension'
  | 'price_range'
  | 'date_and_price_range'
  | 'price_percentage_measure';

export interface DrawingPoint {
  time: number; // timestamp in seconds
  price: number;
}

export interface DrawingItem {
  id: string;
  tool: DrawingTool;
  points: DrawingPoint[];
  color: string;
  lineWidth: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  extendLeft?: boolean;
  extendRight?: boolean;
  fillColor?: string;
  fillOpacity?: number;
  text?: string;
  fontSize?: number;
  brushPoints?: DrawingPoint[];
}

export interface DrawingSettings {
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  extendLeft: boolean;
  extendRight: boolean;
  fillColor: string;
  fillOpacity: number;
  fontSize: number;
}

export interface OHLCData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  time: number;
}

export interface TimeframeConfig {
  label: string;
  value: string; // e.g. '1m', '5m', '1h', 'custom:7m'
  isCustom?: boolean;
  minutes: number;
}
