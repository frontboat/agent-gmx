/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SYNTH LP BOUNDS API UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { type Asset, ASSETS } from './gmx-types';

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
  snapshots: Record<Asset, LPBoundsSnapshot[]>;
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

// Get synth data snapshots for analysis (all available snapshots for 24h+ analysis)
export async function getSynthSnapshots(asset: Asset): Promise<LPBoundsSnapshot[]> {
  const store = await loadSynthDataStore();
  if (!store || !store.snapshots || !store.snapshots[asset]) {
    return [];
  }
  
  // Return all snapshots, sorted by timestamp (oldest first)
  return store.snapshots[asset]
    .sort((a, b) => a.timestamp - b.timestamp);
}

// Get merged percentile bounds from all available snapshots
export async function getMergedPercentileBounds(asset: Asset, currentPrice: number): Promise<{ percentile: number; mergedBounds: { timestamp: string; percentiles: Array<{ price: number; percentile: number }> } } | null> {
  const snapshots = await getSynthSnapshots(asset);
  
  if (snapshots.length === 0) {
    console.warn(`[SynthUtils] No snapshots available for ${asset}`);
    return null;
  }
  
  // Collect all price predictions from all snapshots
  const allPredictions: number[] = [];
  
  snapshots.forEach(snapshot => {
    const probabilityBelow = snapshot.bounds.data['24h'].probability_below;
    Object.entries(probabilityBelow).forEach(([priceStr, probBelow]) => {
      const price = parseFloat(priceStr);
      allPredictions.push(price);
    });
  });
  
  // Sort all predictions
  allPredictions.sort((a, b) => a - b);
  
  // Create clean percentile distribution
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
  
  // Create merged percentile data structure
  const mergedPercentileData = {
    timestamp: new Date().toISOString(),
    percentiles: cleanPercentiles
  };
  
  return {
    percentile: currentPercentile,
    mergedBounds: mergedPercentileData
  };
}


// Load synth data from file with retry logic
export async function loadSynthDataStore(): Promise<SnapshotStorage | null> {
  // Try up to 3 times with a small delay
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await fs.readFile(SYNTH_DATA_PATH, 'utf-8');
      const parsed = JSON.parse(data) as SnapshotStorage;
      // Validate structure - only require version and snapshots object
      // Assets may not all be present initially, they'll be added as data comes in
      if (parsed.version && parsed.snapshots && 
          typeof parsed.snapshots === 'object') {
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

// ═══════════════════════════════════════════════════════════════════════════════
// REGIME DETECTION AND ADVANCED SIGNAL GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

// Types for flattened snapshot data
export interface FlatSnap {
  t: number;            // timestamp ms
  symbol: Asset;
  price: number;        // current_price
  q10: number;          // 10th percentile price
  q50: number;          // 50th percentile price (median)
  q90: number;          // 90th percentile price
}

// Ring buffer for storing historical snapshots (keep last 355+ for full dataset)
export class SnapRingBuffer {
  private buffer: FlatSnap[] = [];
  public readonly maxSize = 500; // Increased to handle full dataset
  
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

// Global buffers for each asset (dynamically created)
const assetBuffers = new Map<Asset, SnapRingBuffer>();

// Initialize buffers for all assets
ASSETS.forEach(asset => {
  assetBuffers.set(asset, new SnapRingBuffer());
});

// Buffer mapping for cleaner access (replaces ternary chains)
const ASSET_BUFFER_MAP = Object.fromEntries(
  ASSETS.map(asset => [asset, assetBuffers.get(asset)!])
) as Record<Asset, SnapRingBuffer>;

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
export function processSnapshot(snapshot: LPBoundsSnapshot, symbol: Asset): void {
  const quantiles = extractQuantiles(snapshot.bounds);
  const flatSnap: FlatSnap = {
    t: snapshot.timestamp,
    symbol,
    price: snapshot.bounds.current_price,
    ...quantiles
  };
  
  const buffer = ASSET_BUFFER_MAP[symbol];
  buffer.push(flatSnap);
}

// Rolling statistics for regime detection
export interface RollingStats {
  drift: { mean: number; std: number };
  bias: number;
  realised24h: number[];
  biasErrors: number[];
}

// Calculate rolling statistics using both snapshot data and signal tracking
export function calculateRollingStats(symbol: Asset): RollingStats | null {
  const buffer = ASSET_BUFFER_MAP[symbol];
  const snaps = buffer.getAll();
  
  if (snaps.length < 2) {
    return null;
  }
  
  const realised24h: number[] = [];
  const biasErrors: number[] = [];
  
  // Use snapshot-based calculation
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
  
  if (realised24h.length < 3) {
    return null;
  }
  
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

export function classifyRegime(symbol: Asset): { regime: MarketRegime; confidence: number } | null {
  const stats = calculateRollingStats(symbol);
  if (!stats) return null;
  
  const { mean, std } = stats.drift;
  
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
function trackRegimeChange(symbol: Asset, newRegime: MarketRegime): void {
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

// Signal generation parameters - use volatility directly
const STRENGTH_DIVISOR = 50.0;  // Strength = |tilt| / (volatility * STRENGTH_DIVISOR)
const EPS = 0.0005;  // 0.05% band filter

// Signal strength scaling documentation:
// - Contrarian signals: TAU = volatility, strength = |tilt| / (volatility * STRENGTH_DIVISOR)
//   Uses actual market volatility as threshold - more volatile markets need bigger tilts
//   Strength scales with how much the tilt exceeds the volatility-based threshold
// - Range-band signals: Similar volatility-based scaling
// Both scales map 0-1 → position size fraction for execution layer

// Contrarian signal for trend regimes
export function generateContrarianSignal(snap: FlatSnap, stats: RollingStats, regime: MarketRegime): { signal: 'LONG' | 'SHORT' | 'NEUTRAL'; strength: number; reason: string } {
  const bias = stats.bias;
  const tilt = (snap.q50 / snap.price) - 1 - bias;
  
  // Use volatility directly as TAU threshold
  const volatility = stats.drift.std; // 24h rolling standard deviation
  const dynamicTAU = volatility; // TAU = volatility directly
  
  if (regime === 'TREND_DOWN') {
    if (tilt >= dynamicTAU) {
      return {
        signal: 'SHORT',
        strength: Math.min(Math.abs(tilt) / (volatility * STRENGTH_DIVISOR), 1),
        reason: `Contrarian SHORT: Tilt ${(tilt * 100).toFixed(2)}% > Vol ${(dynamicTAU * 100).toFixed(2)}%`
      };
    }
    if (tilt <= -dynamicTAU) {
      return {
        signal: 'LONG',
        strength: Math.min(Math.abs(tilt) / (volatility * STRENGTH_DIVISOR), 1),
        reason: `Contrarian LONG: Tilt ${(tilt * 100).toFixed(2)}% < -Vol ${(dynamicTAU * 100).toFixed(2)}%`
      };
    }
  }
  
  if (regime === 'TREND_UP') {
    if (tilt <= -dynamicTAU) {
      return {
        signal: 'LONG',
        strength: Math.min(Math.abs(tilt) / (volatility * STRENGTH_DIVISOR), 1),
        reason: `Contrarian LONG: Tilt ${(tilt * 100).toFixed(2)}% < -Vol ${(dynamicTAU * 100).toFixed(2)}%`
      };
    }
    if (tilt >= dynamicTAU) {
      return {
        signal: 'SHORT',
        strength: Math.min(Math.abs(tilt) / (volatility * STRENGTH_DIVISOR), 1),
        reason: `Contrarian SHORT: Tilt ${(tilt * 100).toFixed(2)}% > Vol ${(dynamicTAU * 100).toFixed(2)}%`
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
      strength: Math.min(deviation / 3, 1), // More restrictive: 3% for 100% strength
      reason: `Range LONG: Price ${deviation.toFixed(2)}% below Q10 support`
    };
  }
  
  if (snap.q90 < snap.price * (1 - EPS)) {
    const deviation = (1 - snap.q90 / snap.price) * 100;
    return {
      signal: 'SHORT',
      strength: Math.min(deviation / 3, 1), // More restrictive: 3% for 100% strength
      reason: `Range SHORT: Price ${deviation.toFixed(2)}% above Q90 resistance`
    };
  }
  
  return { signal: 'NEUTRAL', strength: 0, reason: 'Price within range bands' };
}

// Enhanced analysis incorporating regime detection
export async function getEnhancedSynthAnalysis(
  asset: Asset,
  currentPrice: number,
  currentPricePercentile: number,
  currentPercentiles: PercentileDataPoint,
  volatility24h: number
): Promise<string> {
  
  // Build base analysis output
  let result = `SYNTH_${asset}_ANALYSIS:\n\n`;
  
  // Start with regime-based analysis (populated later)
  result += `REGIME_SIGNAL: PENDING\n`;
  result += `SIGNAL_EXPLANATION: Analyzing market regime...\n`;
  result += `CURRENT_PRICE: $${currentPrice.toFixed(0)}\n`;
  result += `CURRENT_PRICE_PERCENTILE: P${currentPricePercentile}\n`;
  
  // Process latest snapshots if available
  const snapshots = await getSynthSnapshots(asset);
  
  if (snapshots.length > 0) {
    // Process all snapshots to update buffers (avoid reprocessing same data)
    const buffer = ASSET_BUFFER_MAP[asset];
    const currentBufferSize = buffer.getAll().length;
    
    snapshots.forEach(snap => processSnapshot(snap, asset));
    const newBufferSize = buffer.getAll().length;
    
    const recentSnaps = buffer.getAll();
    
    if (recentSnaps.length > 0) {
      const latestSnap = recentSnaps[recentSnaps.length - 1];
      
      // Calculate regime
      const regimeResult = classifyRegime(asset);
      const stats = calculateRollingStats(asset);
      
      
      if (regimeResult && stats) {
        // Generate appropriate signal based on regime
        let advancedSignal;
        if (regimeResult.regime === 'RANGE') {
          advancedSignal = generateRangeBandSignal(latestSnap);
        } else if (regimeResult.regime === 'TREND_UP' || regimeResult.regime === 'TREND_DOWN') {
          advancedSignal = generateContrarianSignal(latestSnap, stats, regimeResult.regime);
        } else {
          advancedSignal = { signal: 'NEUTRAL', strength: 0, reason: 'Market too choppy for signals' };
        }
        
        // Replace the placeholder regime signal at the top
        result = result.replace('REGIME_SIGNAL: PENDING', `REGIME_SIGNAL: ${advancedSignal.signal || 'NEUTRAL'}`);
        result = result.replace('SIGNAL_EXPLANATION: Analyzing market regime...', `SIGNAL_EXPLANATION: ${advancedSignal.reason || 'No actionable signal'}`);
        
        // Add detailed regime information after volatility
        const regimeLines = result.split('\n');
        const insertIdx = regimeLines.findIndex(line => line.includes('VOLATILITY_24H:')) + 1 || 
                         regimeLines.findIndex(line => line.includes('CURRENT_PRICE_PERCENTILE:')) + 1;
        
        const regimeInfo = [
          '',
          `MARKET_REGIME: ${regimeResult.regime}`,
          `REGIME_CONFIDENCE: ${(regimeResult.confidence * 100).toFixed(0)}%`,
          `DRIFT_24H: ${(stats.drift.mean * 100).toFixed(2)}% ± ${(stats.drift.std * 100).toFixed(2)}%`,
          `PREDICTION_BIAS: ${(stats.bias * 100).toFixed(2)}%`,
        ];
        
        if (advancedSignal.signal !== 'NEUTRAL') {
          regimeInfo.push(`SIGNAL_STRENGTH: ${(advancedSignal.strength * 100).toFixed(0)}%`);
          
        }
        
        regimeLines.splice(insertIdx, 0, ...regimeInfo);
        result = regimeLines.join('\n');
      } else {
        // Update placeholder with no signal
        result = result.replace('REGIME_SIGNAL: PENDING', 'REGIME_SIGNAL: NEUTRAL');
        result = result.replace('SIGNAL_EXPLANATION: Analyzing market regime...', 'SIGNAL_EXPLANATION: Insufficient data for regime analysis');
      }
    } else {
      // Update placeholder with no signal
      result = result.replace('REGIME_SIGNAL: PENDING', 'REGIME_SIGNAL: NEUTRAL');
      result = result.replace('SIGNAL_EXPLANATION: Analyzing market regime...', 'SIGNAL_EXPLANATION: No snapshots in buffer for analysis');
    }
  } else {
    // Update placeholder with no signal
    result = result.replace('REGIME_SIGNAL: PENDING', 'REGIME_SIGNAL: NEUTRAL');
    result = result.replace('SIGNAL_EXPLANATION: Analyzing market regime...', 'SIGNAL_EXPLANATION: No historical data available');
  }
  
  // Add volatility if provided
  if (volatility24h > 0) {
    const lines = result.split('\n');
    const insertIndex = lines.findIndex(line => line.startsWith('CURRENT_PRICE_PERCENTILE:')) + 1;
    lines.splice(insertIndex, 0, `VOLATILITY_24H: ${volatility24h.toFixed(2)}%`);
    result = lines.join('\n');
  }
  
  // Add key percentile levels at the end
  result += `KEY_PERCENTILE_LEVELS:\n`;
  currentPercentiles.percentiles
    .sort((a, b) => a.percentile - b.percentile) // Sort by percentile
    .forEach(p => {
      result += `P${p.percentile}: $${p.price.toFixed(0)}\n`;
    });
  
  return result;
}