/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SYNTH LP BOUNDS API UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import * as path from 'path';
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

// Signal tracking for 24h performance analysis
interface SignalTrackingEntry {
  timestamp: number;
  symbol: Asset;
  signalType: 'CONTRARIAN' | 'RANGE_BAND';
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  predictedPrice: number; // q50 at time of signal
  exitTimestamp?: number;
  exitPrice?: number;
  realizedReturn?: number;
  predictedReturn?: number;
  biasError?: number;
  completed: boolean;
}

// Signal tracking
const SIGNAL_TRACK_PATH = path.join(__dirname, 'data', 'signal-tracking.json');

let signalTrackingLog: SignalTrackingEntry[] = [];

(function loadSignalTrackingLog() {
  try {
    if (existsSync(SIGNAL_TRACK_PATH)) {
      const raw = readFileSync(SIGNAL_TRACK_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as SignalTrackingEntry[];
      if (Array.isArray(parsed)) {
        signalTrackingLog = parsed;
        console.log(`[SIGNAL_TRACK] Loaded ${signalTrackingLog.length} entries from disk`);
      }
    }
  } catch (error) {
    console.error('[SIGNAL_TRACK] Failed to load log:', error);
  }
})();

function saveSignalTrackingLog(): void {
  try {
    const dir = path.dirname(SIGNAL_TRACK_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const tmp = `${SIGNAL_TRACK_PATH}.tmp`;
    writeFileSync(tmp, JSON.stringify(signalTrackingLog, null, 2));
    renameSync(tmp, SIGNAL_TRACK_PATH);
  } catch (error) {
    console.error('[SIGNAL_TRACK] Failed to save log:', error);
  }
}

// Track a new signal for 24h analysis
function trackSignal(
  symbol: Asset,
  signalType: 'CONTRARIAN' | 'RANGE_BAND',
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  predictedPrice: number
): void {
  const entry: SignalTrackingEntry = {
    timestamp: Date.now(),
    symbol,
    signalType,
    direction,
    entryPrice,
    predictedPrice,
    completed: false
  };
  
  signalTrackingLog.push(entry);
  // Persist to disk
  saveSignalTrackingLog();
  
  // Clean up old entries (keep last 100)
  if (signalTrackingLog.length > 100) {
    signalTrackingLog = signalTrackingLog.slice(-100);
  }
  
  console.log(`[SIGNAL_TRACK] ${symbol} ${signalType} ${direction} tracked at $${entryPrice.toFixed(2)}`);
}

// Process signal exits and calculate performance
function processSignalExits(currentSnaps: FlatSnap[]): void {
  let updated = false;
  const now = Date.now();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  
  signalTrackingLog.forEach(entry => {
    if (entry.completed) return;
    
    // Check if 24h has passed
    if (now - entry.timestamp >= twentyFourHoursMs) {
      // Find the closest current snap for this symbol
      const symbolSnaps = currentSnaps.filter(snap => snap.symbol === entry.symbol);
      if (symbolSnaps.length === 0) return;
      
      // Use the most recent price for exit
      const latestSnap = symbolSnaps[symbolSnaps.length - 1];
      const exitPrice = latestSnap.price;
      
      // Calculate realized return
      const realizedReturn = (exitPrice / entry.entryPrice) - 1;
      
      // Calculate predicted return (what the q50 prediction was)
      const predictedReturn = (entry.predictedPrice / entry.entryPrice) - 1;
      
      // Calculate bias error
      const biasError = realizedReturn - predictedReturn;
      
      // Update entry
      entry.exitTimestamp = now;
      entry.exitPrice = exitPrice;
      entry.realizedReturn = realizedReturn;
      entry.predictedReturn = predictedReturn;
      entry.biasError = biasError;
      entry.completed = true;
      updated = true;
      
      console.log(`[SIGNAL_EXIT] ${entry.symbol} ${entry.signalType} ${entry.direction}: Real ${(realizedReturn * 100).toFixed(2)}% vs Pred ${(predictedReturn * 100).toFixed(2)}% | Bias: ${(biasError * 100).toFixed(2)}%`);
    }
  });
  if (updated) {
    saveSignalTrackingLog();
  }
}

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
  
  console.log(`[ROLLING_STATS] ${symbol}: Buffer has ${snaps.length} snaps`);
  if (snaps.length < 2) {
    console.log(`[ROLLING_STATS] ${symbol}: Insufficient snaps (${snaps.length} < 2) - returning null`);
    return null;
  }
  
  const realised24h: number[] = [];
  const biasErrors: number[] = [];
  
  // First, use completed signal tracking entries for more accurate bias calculation
  const completedSignals = signalTrackingLog.filter(entry => 
    entry.completed && entry.symbol === symbol
  );
  
  if (completedSignals.length >= 3) {
    // Use signal-based bias calculation (more accurate)
    console.log(`[ROLLING_STATS] ${symbol}: Using ${completedSignals.length} completed signals for bias calculation`);
    completedSignals.slice(-8).forEach(signal => {
      if (signal.realizedReturn !== undefined && signal.biasError !== undefined) {
        realised24h.push(signal.realizedReturn);
        biasErrors.push(signal.biasError);
      }
    });
  } else {
    console.log(`[ROLLING_STATS] ${symbol}: Only ${completedSignals.length} completed signals, falling back to snapshot-based calculation`);
    // Fallback to snapshot-based calculation
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
  }
  
  console.log(`[ROLLING_STATS] ${symbol}: Collected ${realised24h.length} realized returns and ${biasErrors.length} bias errors`);
  if (realised24h.length < 3) {
    console.log(`[ROLLING_STATS] ${symbol}: Insufficient data points (${realised24h.length} < 3) - returning null`);
    return null;
  }
  
  // Take last 8 observations
  const recentRealised = realised24h.slice(-8);
  const recentBias = biasErrors.slice(-8);
  console.log(`[ROLLING_STATS] ${symbol}: Using last ${recentRealised.length} observations for stats`);
  console.log(`[ROLLING_STATS] ${symbol}: Recent realized returns:`, recentRealised.map(r => `${(r * 100).toFixed(2)}%`).join(', '));
  
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

// Signal generation parameters
const TAU = 0.015;   // 1.5% tilt threshold (increased from 0.6% to make 100% strength harder)
const EPS = 0.0005;  // 0.05% band filter

// Signal strength scaling documentation:
// - Contrarian signals: strength = min(tilt / (2*TAU), 1)
//   When tilt = TAU (1.5%), strength = 0.5
//   When tilt = 2*TAU (3.0%), strength = 1.0 (max)
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
    
    // Process any signal exits that are ready
    const recentSnaps = buffer.getAll();
    
    if (recentSnaps.length > 0) {
      processSignalExits(recentSnaps);
    }
    
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
          
          // Track the signal for 24h performance analysis (avoid duplicates)
          const signalType = regimeResult.regime === 'RANGE' ? 'RANGE_BAND' : 'CONTRARIAN';
          const hasOpenSignal = signalTrackingLog.some(entry => 
            !entry.completed && 
            entry.symbol === asset && 
            entry.signalType === signalType &&
            entry.direction === advancedSignal.signal
          );
          
          if (!hasOpenSignal) {
            trackSignal(asset, signalType, advancedSignal.signal, latestSnap.price, latestSnap.q50);
          } else {
          }
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