/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SYNTH LP BOUNDS API UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { EnhancedDataCache } from './gmx-cache';

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// Types for the new LP bounds API
export interface LPBoundsResponse {
  data: {
    '24h': {
      probability_above: { [price: string]: number };
      probability_below: { [price: string]: number };
    };
  };
  current_price: number;
}

// Types for LP bounds snapshots (matching existing file structure)
interface LPBoundsSnapshot {
  timestamp: number;
  bounds: LPBoundsResponse;
}

interface SnapshotStorage {
  version: string;
  snapshots: {
    BTC: LPBoundsSnapshot[];
    ETH: LPBoundsSnapshot[];
  };
}

// Path to synth data file
const SYNTH_DATA_PATH = path.join(__dirname, 'data', 'lp-bounds-snapshots.json');

export interface PercentileDataPoint {
  timestamp: string;
  percentiles: Array<{
    price: number;
    percentile: number;
  }>;
}

// Load synth data from file with retry logic
export async function loadSynthDataStore(): Promise<SnapshotStorage | null> {
  // Try up to 3 times with a small delay
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await fs.readFile(SYNTH_DATA_PATH, 'utf-8');
      const parsed = JSON.parse(data) as SnapshotStorage;
      // Validate structure
      if (parsed.version && parsed.snapshots && parsed.snapshots.BTC && parsed.snapshots.ETH) {
        return parsed;
      }
      console.warn('[SynthUtils] Invalid synth data structure');
      return null;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.warn('[SynthUtils] No synth data file found at:', SYNTH_DATA_PATH);
        return null;
      }
      
      if (attempt < 3) {
        console.warn(`[SynthUtils] Error loading synth data (attempt ${attempt}/3), retrying...`);
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        console.error('[SynthUtils] Error loading synth data after 3 attempts:', error);
        return null;
      }
    }
  }
  return null;
}

// Get synth data snapshots for analysis (24h-23h window)
export async function getSynthSnapshots(asset: 'BTC' | 'ETH'): Promise<LPBoundsSnapshot[]> {
  const store = await loadSynthDataStore();
  if (!store || !store.snapshots || !store.snapshots[asset]) {
    return [];
  }
  
  const now = Date.now();
  const twentyThreeHoursAgo = now - (23 * 60 * 60 * 1000);
  const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
  
  // Filter snapshots in 24h-23h window
  return store.snapshots[asset].filter(
    snapshot => snapshot.timestamp >= twentyFourHoursAgo && snapshot.timestamp <= twentyThreeHoursAgo
  );
}

// Fetch LP bounds data - now reads from file instead of cache
export async function fetchLPBoundsData(asset: 'BTC' | 'ETH', gmxDataCache?: EnhancedDataCache): Promise<LPBoundsResponse> {
  // If cache is provided (old usage), use it for backwards compatibility
  if (gmxDataCache) {
    return await gmxDataCache.getLPBoundsData(asset);
  }
  
  // Otherwise, get the most recent snapshot from file
  const store = await loadSynthDataStore();
  if (!store || !store.snapshots || !store.snapshots[asset] || store.snapshots[asset].length === 0) {
    throw new Error(`No synth data available for ${asset}`);
  }
  
  // Return the most recent snapshot
  const snapshots = store.snapshots[asset];
  const latestSnapshot = snapshots[snapshots.length - 1];
  return latestSnapshot.bounds;
}

// Convert probability data to percentile format - use the actual 11 data points from API
export function convertProbabilitiesToPercentiles(lpBoundsData: LPBoundsResponse): PercentileDataPoint {
  const { probability_below } = lpBoundsData.data['24h'];
  
  // Convert the probability_below map to our percentile array format
  const percentiles = Object.entries(probability_below).map(([priceStr, probBelow]) => ({
    price: parseFloat(priceStr),
    percentile: probBelow * 100 // Convert 0.205 to 20.5
  }));
  
  // Sort by price (ascending)
  percentiles.sort((a, b) => a.price - b.price);
  
  const percentileData: PercentileDataPoint = {
    timestamp: new Date().toISOString(),
    percentiles
  };
  
  return percentileData;
}

// Get merged percentile bounds from file data (24h-23h window)
export async function getMergedPercentileBounds(asset: 'BTC' | 'ETH', currentPrice: number): Promise<{ percentile: number; mergedBounds: { timestamp: string; percentiles: Array<{ price: number; percentile: number }> } } | null> {
  const snapshots = await getSynthSnapshots(asset);
  
  if (snapshots.length === 0) {
    console.warn(`[SynthUtils] No snapshots available in 24h-23h window for ${asset}`);
    return null;
  }
  
  // Collect all price predictions from all miners across all snapshots
  const allPredictions: number[] = [];
  
  snapshots.forEach(snapshot => {
    const probabilityBelow = snapshot.bounds.data['24h'].probability_below;
    Object.entries(probabilityBelow).forEach(([priceStr, probBelow]) => {
      const price = parseFloat(priceStr);
      // Each price level represents a prediction from a miner
      // We'll treat each one as an individual prediction point
      allPredictions.push(price);
    });
  });
  
  // Sort all predictions
  allPredictions.sort((a, b) => a - b);
  
  // Create clean percentile distribution
  // We want to show key percentiles: 0, 1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100
  const targetPercentiles = [0, 1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100];
  const cleanPercentiles: Array<{ price: number; percentile: number }> = [];
  
  for (const targetPerc of targetPercentiles) {
    const index = Math.floor((targetPerc / 100) * (allPredictions.length - 1));
    const price = allPredictions[Math.min(index, allPredictions.length - 1)];
    cleanPercentiles.push({ price, percentile: targetPerc });
  }
  
  // Calculate current price percentile within all predictions
  let currentPercentile = 50; // default
  
  if (allPredictions.length > 0) {
    // Count how many predictions are below current price
    const belowCount = allPredictions.filter(p => p < currentPrice).length;
    currentPercentile = Math.round((belowCount / allPredictions.length) * 100);
  }
  
  console.warn(`[SynthUtils] ${asset} at $${currentPrice.toFixed(0)}: P${currentPercentile} from ${allPredictions.length} total predictions across ${snapshots.length} snapshots`);
  
  // Create merged percentile data structure for formatSynthAnalysisSimplified
  const mergedPercentileData = {
    timestamp: new Date().toISOString(),
    percentiles: cleanPercentiles
  };
  
  return {
    percentile: currentPercentile,
    mergedBounds: mergedPercentileData
  };
}

// Calculate where current price sits in percentile distribution
export function calculatePricePercentile(currentPrice: number, percentileData: PercentileDataPoint): number {
  const percentileValues = percentileData.percentiles.map(p => ({
    level: p.percentile,
    price: p.price
  }));
  
  // Data is already sorted by price, but let's sort by percentile level for consistency
  percentileValues.sort((a, b) => a.level - b.level);
  
  // Calculate where current price sits in the percentile distribution
  let currentPricePercentile = 50; // default
  
  if (percentileValues.length > 0) {
    // Find which percentile band the current price falls into
    if (currentPrice <= percentileValues[0].price) {
      // Below all predictions
      currentPricePercentile = 0;
    } else if (currentPrice >= percentileValues[percentileValues.length - 1].price) {
      // Above all predictions
      currentPricePercentile = 100;
    } else {
      // Interpolate between percentile bands
      for (let i = 0; i < percentileValues.length - 1; i++) {
        const lowerBand = percentileValues[i];
        const upperBand = percentileValues[i + 1];
        
        if (currentPrice >= lowerBand.price && currentPrice <= upperBand.price) {
          const priceDiff = upperBand.price - lowerBand.price;
          const levelDiff = upperBand.level - lowerBand.level;
          
          if (priceDiff > 0) {
            const fraction = (currentPrice - lowerBand.price) / priceDiff;
            currentPricePercentile = Math.round(lowerBand.level + (fraction * levelDiff));
          } else {
            currentPricePercentile = Math.round(lowerBand.level);
          }
          break;
        }
      }
    }
  }
  
  return currentPricePercentile;
}

// Format Synth analysis output
export function formatSynthAnalysisSimplified(
  asset: 'BTC' | 'ETH', 
  currentPrice: number,
  currentPricePercentile: number,
  currentPercentiles: PercentileDataPoint
): string {
  // Generate trading signal based on percentile rank
  const { signal, explanation } = generateTradingSignalFromPercentile(currentPricePercentile);
  
  // Build structured output for AI consumption
  let result = `SYNTH_${asset}_ANALYSIS:\n\n`;

  // PRIORITY SECTION - Most important info first
  result += `TRADING_SIGNAL: ${signal}\n`;
  result += `SIGNAL_EXPLANATION: ${explanation}\n`;
  result += `CURRENT_PRICE: $${currentPrice.toFixed(0)}\n`;
  result += `CURRENT_PRICE_PERCENTILE: P${currentPricePercentile}\n`;
  
  // KEY PERCENTILE LEVELS - Show clean percentile distribution
  result += `\nKEY_PERCENTILE_LEVELS:\n`;
  currentPercentiles.percentiles
    .sort((a, b) => a.percentile - b.percentile) // Sort by percentile
    .forEach(p => {
      result += `P${p.percentile}: $${p.price.toFixed(0)}\n`;
    });
  
  return result;
}


// Generate trading signal based on percentile rank
export function generateTradingSignalFromPercentile(
  currentPricePercentile: number, 
): { signal: string; explanation: string } {
  // Precise calculation of prediction distribution
  const predictionsAbove = Math.round(100 - currentPricePercentile);
  const predictionsBelow = Math.round(currentPricePercentile);
  
  // OUT-OF-RANGE SIGNALS
  if (currentPricePercentile === 0) {
    return {
      signal: 'OUT_OF_RANGE_LONG',
      explanation: `P0: PRICE BELOW ALL PREDICTIONS! 100% predictions above. ABSOLUTE FLOOR.`
    };
  }
  if (currentPricePercentile === 100) {
    return {
      signal: 'OUT_OF_RANGE_SHORT',
      explanation: `P100: PRICE ABOVE ALL PREDICTIONS! 100% predictions below. ABSOLUTE CEILING.`
    };
  }
  
  // Extreme zones - maximum conviction signals
  if (currentPricePercentile <= 0.5) {
    return {
      signal: 'EXTREME_LONG',
      explanation: `P${currentPricePercentile}: ${predictionsAbove}% predictions above. FLOOR LEVEL.`
    };
  }
  if (currentPricePercentile >= 99.5) {
    return {
      signal: 'EXTREME_SHORT',
      explanation: `P${currentPricePercentile}: ${predictionsBelow}% predictions below. CEILING LEVEL.`
    };
  }
  
  // Strong conviction zones
  if (currentPricePercentile <= 5) {
    return {
      signal: 'STRONG_LONG',
      explanation: `P${currentPricePercentile}: ${predictionsAbove}% predictions above. Reaching extreme lows.`
    };
  }
  if (currentPricePercentile <= 10) {
    return {
      signal: 'STRONG_LONG',
      explanation: `P${currentPricePercentile}: ${predictionsAbove}% predictions above. BOTTOM DECILE.`
    };
  }
  if (currentPricePercentile >= 95) {
    return {
      signal: 'STRONG_SHORT',
      explanation: `P${currentPricePercentile}: ${predictionsBelow}% predictions below. Reaching extreme highs.`
    };
  }
  if (currentPricePercentile >= 90) {
    return {
      signal: 'STRONG_SHORT',
      explanation: `P${currentPricePercentile}: ${predictionsBelow}% predictions below. TOP DECILE.`
    };
  }
  
  // Standard opportunity zones
  if (currentPricePercentile <= 15) {
    return {
      signal: 'POSSIBLE_LONG',
      explanation: `P${currentPricePercentile}: ${predictionsAbove}% predictions above. Reaching possible lows.`
    };
  }
  if (currentPricePercentile <= 25) {
    return {
      signal: 'POSSIBLE_LONG',
      explanation: `P${currentPricePercentile}: ${predictionsAbove}% predictions above. BOTTOM QUARTILE.`
    };
  }
  if (currentPricePercentile >= 85) {
    return {
      signal: 'POSSIBLE_SHORT',
      explanation: `P${currentPricePercentile}: ${predictionsBelow}% predictions below. Reaching possible highs.`
    };
  }
  if (currentPricePercentile >= 75) {
    return {
      signal: 'POSSIBLE_SHORT',
      explanation: `P${currentPricePercentile}: ${predictionsBelow}% predictions below. TOP QUARTILE.`
    };
  }

  // Neutral zone - no edge
  return {
    signal: 'NEUTRAL',
    explanation: `P${currentPricePercentile}: ${predictionsAbove}% above, ${predictionsBelow}% below. NO EDGE - Wait for clearer levels.`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGIME DETECTION AND ADVANCED SIGNAL GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

// Types for flattened snapshot data
export interface FlatSnap {
  t: number;            // timestamp ms
  symbol: 'BTC' | 'ETH';
  price: number;        // current_price
  q10: number;          // 10th percentile price
  q50: number;          // 50th percentile price (median)
  q90: number;          // 90th percentile price
}

// Ring buffer for storing historical snapshots (keep last 48)
export class SnapRingBuffer {
  private buffer: FlatSnap[] = [];
  private maxSize = 48;
  
  push(snap: FlatSnap): void {
    this.buffer.push(snap);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }
  
  getRecent(count: number): FlatSnap[] {
    return this.buffer.slice(-count);
  }
  
  getAll(): FlatSnap[] {
    return [...this.buffer];
  }
}

// Global buffers for each asset
const btcBuffer = new SnapRingBuffer();
const ethBuffer = new SnapRingBuffer();

// Regime tracking for change detection
let lastRegimeTracking: { [key: string]: { regime: MarketRegime; timestamp: number } } = {};

// Extract quantiles from probability_below data with proper interpolation
function extractQuantiles(bounds: LPBoundsResponse): { q10: number; q50: number; q90: number } {
  const probBelow = bounds.data['24h'].probability_below;
  const points = Object.entries(probBelow)
    .map(([price, prob]) => ({ price: parseFloat(price), prob: prob as number }))
    .sort((a, b) => a.prob - b.prob); // Sort by probability for proper interpolation
  
  // Find quantile using proper probability interpolation
  const findQuantile = (target: number): number => {
    // Handle edge cases
    if (target <= points[0].prob) return points[0].price;
    if (target >= points[points.length - 1].prob) return points[points.length - 1].price;
    
    // Find bounding points where probBelow straddles the target
    for (let i = 0; i < points.length - 1; i++) {
      const lower = points[i];
      const upper = points[i + 1];
      
      if (lower.prob <= target && target <= upper.prob) {
        // Linear interpolation in probability space
        if (upper.prob === lower.prob) return (lower.price + upper.price) / 2;
        
        const t = (target - lower.prob) / (upper.prob - lower.prob);
        return lower.price + t * (upper.price - lower.price);
      }
    }
    
    // Fallback (shouldn't reach here)
    return points[Math.floor(points.length / 2)].price;
  };
  
  return {
    q10: findQuantile(0.1),
    q50: findQuantile(0.5),
    q90: findQuantile(0.9)
  };
}

// Process new snapshot and update buffers
export function processSnapshot(snapshot: LPBoundsSnapshot, symbol: 'BTC' | 'ETH'): void {
  const quantiles = extractQuantiles(snapshot.bounds);
  const flatSnap: FlatSnap = {
    t: snapshot.timestamp,
    symbol,
    price: snapshot.bounds.current_price,
    ...quantiles
  };
  
  const buffer = symbol === 'BTC' ? btcBuffer : ethBuffer;
  buffer.push(flatSnap);
}

// Rolling statistics for regime detection
export interface RollingStats {
  drift: { mean: number; std: number };
  bias: number;
  realised24h: number[];
  biasErrors: number[];
}

// Calculate rolling statistics
export function calculateRollingStats(symbol: 'BTC' | 'ETH'): RollingStats | null {
  const buffer = symbol === 'BTC' ? btcBuffer : ethBuffer;
  const snaps = buffer.getAll(); // No need to filter by symbol since buffers are already per-symbol
  
  if (snaps.length < 2) return null;
  
  const realised24h: number[] = [];
  const biasErrors: number[] = [];
  
  // Calculate realised returns and bias errors with proper 24h alignment
  for (let i = 0; i < snaps.length; i++) {
    const current = snaps[i];
    const target24h = current.t - (24 * 60 * 60 * 1000);
    
    // Find the snapshot closest to exactly 24h ago
    let closest: FlatSnap | null = null;
    let minTimeDiff = Infinity;
    
    for (let j = 0; j < i; j++) {
      const candidate = snaps[j];
      const timeDiff = Math.abs(candidate.t - target24h);
      
      // Only consider snapshots within 2 minutes of the 24h target
      if (timeDiff < 2 * 60 * 1000 && timeDiff < minTimeDiff) {
        minTimeDiff = timeDiff;
        closest = candidate;
      }
    }
    
    if (closest) {
      const realised = (current.price / closest.price) - 1;
      const predicted = (closest.q50 / closest.price) - 1;
      const biasError = realised - predicted;
      
      realised24h.push(realised);
      biasErrors.push(biasError);
    }
  }
  
  if (realised24h.length < 3) return null;
  
  // Take last 8 observations
  const recentRealised = realised24h.slice(-8);
  const recentBias = biasErrors.slice(-8);
  
  // Calculate mean and std
  const mean = recentRealised.reduce((a, b) => a + b, 0) / recentRealised.length;
  const variance = recentRealised.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recentRealised.length;
  const std = Math.sqrt(variance);
  const biasMean = recentBias.reduce((a, b) => a + b, 0) / recentBias.length;
  
  return {
    drift: { mean, std },
    bias: biasMean,
    realised24h: recentRealised,
    biasErrors: recentBias
  };
}

// Market regime classifier
export type MarketRegime = 'TREND_UP' | 'TREND_DOWN' | 'RANGE' | 'CHOPPY';

export function classifyRegime(symbol: 'BTC' | 'ETH'): { regime: MarketRegime; confidence: number } | null {
  const stats = calculateRollingStats(symbol);
  if (!stats) return null;
  
  const { mean, std } = stats.drift;
  const bias = stats.bias;
  
  // Normalize volatility
  const volNormalized = std / (Math.abs(mean) + 0.001);
  
  // High volatility relative to drift = choppy
  if (volNormalized > 2) {
    const result = { regime: 'CHOPPY' as MarketRegime, confidence: Math.min(volNormalized / 3, 1) };
    trackRegimeChange(symbol, result.regime);
    return result;
  }
  
  // Check if trending (mean > 0.4 * std)
  const trending = Math.abs(mean) > 0.4 * std;
  
  if (!trending) {
    const result = { regime: 'RANGE' as MarketRegime, confidence: 1 - (Math.abs(mean) / (0.4 * std)) };
    trackRegimeChange(symbol, result.regime);
    return result;
  }
  
  // Determine trend direction based on realised mean (no bias adjustment needed)
  // mean is already the realised drift, bias is the prediction error
  const result = {
    regime: (mean > 0 ? 'TREND_UP' : 'TREND_DOWN') as MarketRegime,
    confidence: Math.min(Math.abs(mean) / std, 1)
  };
  
  trackRegimeChange(symbol, result.regime);
  return result;
}

// Track regime changes and log them
function trackRegimeChange(symbol: 'BTC' | 'ETH', newRegime: MarketRegime): void {
  const now = Date.now();
  const key = symbol;
  const lastRegime = lastRegimeTracking[key];
  
  if (!lastRegime || lastRegime.regime !== newRegime) {
    if (lastRegime) {
      const duration = Math.round((now - lastRegime.timestamp) / (1000 * 60)); // minutes
      console.log(`🔄 [REGIME] ${symbol} regime change: ${lastRegime.regime} → ${newRegime} (lasted ${duration}m)`);
    } else {
      console.log(`🎯 [REGIME] ${symbol} initial regime: ${newRegime}`);
    }
    
    lastRegimeTracking[key] = { regime: newRegime, timestamp: now };
  }
}

// Signal generation parameters
const TAU = 0.006;   // 0.6% tilt threshold
const EPS = 0.0005;  // 0.05% band filter

// Signal strength scaling documentation:
// - Contrarian signals: strength = min(tilt / (2*TAU), 1)
//   When tilt = TAU (0.6%), strength = 0.5
//   When tilt = 2*TAU (1.2%), strength = 1.0 (max)
// - Range-band signals: strength = min(deviation / 2, 1) 
//   Linear scaling where 2% deviation = 100% strength
// Both scales map 0-1 → position size fraction for execution layer

// Contrarian signal for trend regimes
export function generateContrarianSignal(snap: FlatSnap, stats: RollingStats, regime: MarketRegime): { signal: 'LONG' | 'SHORT' | 'NEUTRAL'; strength: number; reason: string } {
  const bias = stats.bias;
  const tilt = (snap.q50 / snap.price) - 1 - bias;
  
  if (regime === 'TREND_DOWN') {
    if (tilt >= TAU) {
      return {
        signal: 'SHORT',
        strength: Math.min(tilt / (2 * TAU), 1),
        reason: `Contrarian SHORT: Positive tilt ${(tilt * 100).toFixed(2)}% in downtrend`
      };
    }
    if (tilt <= -TAU) {
      return {
        signal: 'LONG',
        strength: Math.min(Math.abs(tilt) / (2 * TAU), 1),
        reason: `Contrarian LONG: Negative tilt ${(tilt * 100).toFixed(2)}% in downtrend (rare)`
      };
    }
  }
  
  if (regime === 'TREND_UP') {
    if (tilt <= -TAU) {
      return {
        signal: 'LONG',
        strength: Math.min(Math.abs(tilt) / (2 * TAU), 1),
        reason: `Contrarian LONG: Negative tilt ${(tilt * 100).toFixed(2)}% in uptrend`
      };
    }
    if (tilt >= TAU) {
      return {
        signal: 'SHORT',
        strength: Math.min(tilt / (2 * TAU), 1),
        reason: `Contrarian SHORT: Positive tilt ${(tilt * 100).toFixed(2)}% in uptrend (rare)`
      };
    }
  }
  
  return { signal: 'NEUTRAL', strength: 0, reason: 'No contrarian signal' };
}

// Range-band signal for sideways markets
export function generateRangeBandSignal(snap: FlatSnap): { signal: 'LONG' | 'SHORT' | 'NEUTRAL'; strength: number; reason: string } {
  if (snap.q10 > snap.price * (1 + EPS)) {
    const deviation = (snap.q10 / snap.price - 1) * 100;
    return {
      signal: 'LONG',
      strength: Math.min(deviation / 2, 1),
      reason: `Range LONG: Price ${deviation.toFixed(2)}% below Q10 support`
    };
  }
  
  if (snap.q90 < snap.price * (1 - EPS)) {
    const deviation = (1 - snap.q90 / snap.price) * 100;
    return {
      signal: 'SHORT',
      strength: Math.min(deviation / 2, 1),
      reason: `Range SHORT: Price ${deviation.toFixed(2)}% above Q90 resistance`
    };
  }
  
  return { signal: 'NEUTRAL', strength: 0, reason: 'Price within range bands' };
}

// Enhanced analysis incorporating regime detection
export async function getEnhancedSynthAnalysis(
  asset: 'BTC' | 'ETH',
  currentPrice: number,
  currentPricePercentile: number,
  currentPercentiles: PercentileDataPoint,
  volatility24h: number
): Promise<string> {
  // Get base analysis
  let result = formatSynthAnalysisSimplified(asset, currentPrice, currentPricePercentile, currentPercentiles);
  
  // Process latest snapshots if available
  const snapshots = await getSynthSnapshots(asset);
  if (snapshots.length > 0) {
    // Process all snapshots to update buffers
    snapshots.forEach(snap => processSnapshot(snap, asset));
    
    // Get latest snap
    const buffer = asset === 'BTC' ? btcBuffer : ethBuffer;
    const recentSnaps = buffer.getAll();
    
    if (recentSnaps.length > 0) {
      const latestSnap = recentSnaps[recentSnaps.length - 1];
      
      // Calculate regime
      const regimeResult = classifyRegime(asset);
      const stats = calculateRollingStats(asset);
      
      if (regimeResult && stats) {
        // Add regime information
        const regimeLines = result.split('\n');
        const insertIdx = regimeLines.findIndex(line => line.includes('KEY_PERCENTILE_LEVELS:'));
        
        const regimeInfo = [
          '',
          `MARKET_REGIME: ${regimeResult.regime}`,
          `REGIME_CONFIDENCE: ${(regimeResult.confidence * 100).toFixed(0)}%`,
          `DRIFT_24H: ${(stats.drift.mean * 100).toFixed(2)}% ± ${(stats.drift.std * 100).toFixed(2)}%`,
          `PREDICTION_BIAS: ${(stats.bias * 100).toFixed(2)}%`,
        ];
        
        // Generate appropriate signal based on regime
        let advancedSignal;
        if (regimeResult.regime === 'RANGE') {
          advancedSignal = generateRangeBandSignal(latestSnap);
        } else if (regimeResult.regime === 'TREND_UP' || regimeResult.regime === 'TREND_DOWN') {
          advancedSignal = generateContrarianSignal(latestSnap, stats, regimeResult.regime);
        } else {
          advancedSignal = { signal: 'NEUTRAL', strength: 0, reason: 'Market too choppy for signals' };
        }
        
        if (advancedSignal.signal !== 'NEUTRAL') {
          regimeInfo.push(`REGIME_SIGNAL: ${advancedSignal.signal}`);
          regimeInfo.push(`SIGNAL_STRENGTH: ${(advancedSignal.strength * 100).toFixed(0)}%`);
          regimeInfo.push(`SIGNAL_REASON: ${advancedSignal.reason}`);
        }
        
        regimeLines.splice(insertIdx, 0, ...regimeInfo);
        result = regimeLines.join('\n');
      }
    }
  }
  
  // Add volatility if provided
  if (volatility24h > 0) {
    const lines = result.split('\n');
    const insertIndex = lines.findIndex(line => line.startsWith('CURRENT_PRICE_PERCENTILE:')) + 1;
    lines.splice(insertIndex, 0, `VOLATILITY_24H: ${volatility24h.toFixed(2)}%`);
    result = lines.join('\n');
  }
  
  return result;
}