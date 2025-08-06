/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SYNTH LP BOUNDS API UTILITIES - SIMPLIFIED PERCENTILE STRATEGY
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { type Asset } from './gmx-types';

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Types for the LP bounds API
export interface LPBoundsResponse {
  data: {
    '24h': {
      probability_above: { [price: string]: number };
      probability_below: { [price: string]: number };
    };
  };
  current_price: number;
}

// Types for LP bounds snapshots
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

// Get synth data snapshots for analysis (need 24h+ of data)
export async function getSynthSnapshots(asset: Asset): Promise<LPBoundsSnapshot[]> {
  const store = await loadSynthDataStore();
  if (!store || !store.snapshots || !store.snapshots[asset]) {
    return [];
  }
  
  // Filter to last 72h of data to ensure sufficient lookback
  const now = Date.now();
  const H72 = 72 * 60 * 60 * 1000; // 72 hours in milliseconds
  
  return store.snapshots[asset]
    .filter(snapshot => now - snapshot.timestamp <= H72)
    .sort((a, b) => a.timestamp - b.timestamp);
}

// Load synth data from file with retry logic
export async function loadSynthDataStore(): Promise<SnapshotStorage | null> {
  // Try up to 3 times with a small delay
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await fs.readFile(SYNTH_DATA_PATH, 'utf-8');
      const parsed = JSON.parse(data) as SnapshotStorage;
      
      if (parsed.version && parsed.snapshots && typeof parsed.snapshots === 'object') {
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
// SIMPLIFIED PERCENTILE-BASED STRATEGY
// ═══════════════════════════════════════════════════════════════════════════════

// Merge multiple snapshots by averaging their percentile values
function calculateMergedPercentiles(snapshots: LPBoundsSnapshot[]): { prices: number[], probs: number[] } {
  // Target percentiles we want to calculate
  const targetPercentiles = [0.01, 0.05, 0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.85, 0.90, 0.95, 0.99];
  
  // Calculate percentiles for each snapshot
  const allPercentileValues: number[][] = [];
  
  for (const snapshot of snapshots) {
    const bounds = snapshot.bounds.data['24h'].probability_below;
    const prices = Object.keys(bounds).map(p => parseFloat(p)).sort((a, b) => a - b);
    const probs = prices.map(p => bounds[p.toString()]);
    
    // Calculate each target percentile for this snapshot
    const percentileValues: number[] = [];
    for (const target of targetPercentiles) {
      // Linear interpolation to find percentile value
      let found = false;
      for (let i = 0; i < probs.length - 1; i++) {
        if (probs[i] <= target && target <= probs[i + 1]) {
          const t = (target - probs[i]) / (probs[i + 1] - probs[i]);
          percentileValues.push(prices[i] + t * (prices[i + 1] - prices[i]));
          found = true;
          break;
        }
      }
      if (!found) {
        // Fallback: use closest price
        if (target <= probs[0]) {
          percentileValues.push(prices[0]);
        } else if (target >= probs[probs.length - 1]) {
          percentileValues.push(prices[prices.length - 1]);
        } else {
          percentileValues.push(prices[Math.floor(prices.length / 2)]);
        }
      }
    }
    allPercentileValues.push(percentileValues);
  }
  
  // Average the percentile values across all snapshots
  const mergedPrices: number[] = [];
  for (let i = 0; i < targetPercentiles.length; i++) {
    const sum = allPercentileValues.reduce((acc, values) => acc + values[i], 0);
    mergedPrices.push(sum / snapshots.length);
  }
  
  return {
    prices: mergedPrices,
    probs: targetPercentiles
  };
}

interface SimplifiedSynthAnalysis {
  signal: 'LONG' | 'SHORT' | 'WAIT';
  currentPrice: number;
  currentPercentile: number;
  percentiles24h: {
    p1: number;
    p5: number;
    p10: number;
    p15: number;
    p20: number;
    p30: number;
    p40: number;
    p50: number;
    p60: number;
    p70: number;
    p80: number;
    p85: number;
    p90: number;
    p95: number;
    p99: number;
  };
  volatility: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH';
  target: number;
}

// Main analysis function - compares current price against 24h ago percentiles
export async function getEnhancedSynthAnalysis(
  asset: Asset,
  currentPrice: number,
  volatility24h: number
): Promise<string> {
  try {
    // Load snapshots to get 24h ago data (288 snapshots @ 5min intervals = 24h)
    const snapshots = await getSynthSnapshots(asset);
    
    // Need at least 291 snapshots to get 7 snapshots around the 24h mark
    if (snapshots.length < 291) {
      throw new Error(`Need at least 291 snapshots (24h+3 of data), have ${snapshots.length}`);
    }

    // Gather 7 snapshots around the 24h ago mark (indices 285-291, with 288 being the center)
    const targetSnapshots: LPBoundsSnapshot[] = [];
    for (let i = 285; i <= 291; i++) {
      const snapshot = snapshots[snapshots.length - i];
      const bounds = snapshot?.bounds?.data?.['24h']?.probability_below;
      
      if (!bounds || Object.keys(bounds).length === 0) {
        throw new Error(`Invalid snapshot at index ${i} - missing probability data`);
      }
      targetSnapshots.push(snapshot);
    }
    
    // Verify we have exactly 7 snapshots
    if (targetSnapshots.length !== 7) {
      throw new Error(`Expected 7 snapshots, got ${targetSnapshots.length}`);
    }
    
    // Merge the 7 snapshots by averaging their percentiles
    const mergedData = calculateMergedPercentiles(targetSnapshots);
    
    // Use merged data for analysis
    const prices = mergedData.prices;
    const probs = mergedData.probs;
    
    // Calculate key percentiles using interpolation
    const findPercentile = (target: number): number => {
      for (let i = 0; i < probs.length - 1; i++) {
        if (probs[i] <= target && target <= probs[i + 1]) {
          const t = (target - probs[i]) / (probs[i + 1] - probs[i]);
          return prices[i] + t * (prices[i + 1] - prices[i]);
        }
      }
      return prices[Math.floor(prices.length / 2)]; // fallback to median
    };

    const percentiles24h = {
      p1: findPercentile(0.01),
      p5: findPercentile(0.05),
      p10: findPercentile(0.10),
      p15: findPercentile(0.15),
      p20: findPercentile(0.20),
      p30: findPercentile(0.30),
      p40: findPercentile(0.40),
      p50: findPercentile(0.50),
      p60: findPercentile(0.60),
      p70: findPercentile(0.70),
      p80: findPercentile(0.80),
      p85: findPercentile(0.85),
      p90: findPercentile(0.90),
      p95: findPercentile(0.95),
      p99: findPercentile(0.99)
    };

    // Determine volatility regime based on 24h volatility (0-100% scale)
    let volatilityRegime: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH';
    if (volatility24h < 20) { // 0-20%
      volatilityRegime = 'VERY_LOW';
    } else if (volatility24h < 40) { // 20-40%
      volatilityRegime = 'LOW';
    } else if (volatility24h < 60) { // 40-60%
      volatilityRegime = 'MEDIUM';
    } else { // 60%+
      volatilityRegime = 'HIGH';
    }

    // Calculate exact percentile of current price within 24h ago distribution using interpolation
    const currentPricePercentileIn24h = calculateCurrentPricePercentileIn24hDistribution(currentPrice, prices, probs);

    // Check if price is outside prediction bounds - if so, wait
    if (currentPrice < percentiles24h.p1 || currentPrice > percentiles24h.p99) {
      return formatSimplifiedAnalysis(asset, {
        signal: 'WAIT',
        currentPrice,
        currentPercentile: currentPricePercentileIn24h,
        percentiles24h,
        volatility: volatilityRegime,
        target: percentiles24h.p50,
      });
    }

    // Apply strategy based on volatility
    let signal: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
    let entry: number | null = null;
    let stopLoss: number | null = null;
    
    if (volatilityRegime === 'VERY_LOW') {
      // Very low vol: P20 <= long / P80 >= short
      if (currentPrice <= percentiles24h.p20) {
        signal = 'LONG';
        entry = currentPrice;
        // Ensure stop is below current price for LONG positions
        stopLoss = Math.min(percentiles24h.p15, currentPrice * 0.995); // At least 0.5% below entry
      } else if (currentPrice >= percentiles24h.p80) {
        signal = 'SHORT';
        entry = currentPrice;
        // Ensure stop is above current price for SHORT positions
        stopLoss = Math.max(percentiles24h.p85, currentPrice * 1.005); // At least 0.5% above entry
      }
    } else if (volatilityRegime === 'LOW') {
      // Low vol: P15 <= long / P85 >= short
      if (currentPrice <= percentiles24h.p15) {
        signal = 'LONG';
        entry = currentPrice;
        // Ensure stop is below current price for LONG positions
        stopLoss = Math.min(percentiles24h.p10, currentPrice * 0.99); // At least 1% below entry
      } else if (currentPrice >= percentiles24h.p85) {
        signal = 'SHORT';
        entry = currentPrice;
        // Ensure stop is above current price for SHORT positions
        stopLoss = Math.max(percentiles24h.p90, currentPrice * 1.01); // At least 1% above entry
      }
    } else if (volatilityRegime === 'MEDIUM') {
      // Medium vol: P10 <= long / P90 >= short
      if (currentPrice <= percentiles24h.p10) {
        signal = 'LONG';
        entry = currentPrice;
        // Ensure stop is below current price for LONG positions
        stopLoss = Math.min(percentiles24h.p5, currentPrice * 0.99); // At least 1% below entry
      } else if (currentPrice >= percentiles24h.p90) {
        signal = 'SHORT';
        entry = currentPrice;
        // Ensure stop is above current price for SHORT positions
        stopLoss = Math.max(percentiles24h.p95, currentPrice * 1.01); // At least 1% above entry
      }
    } else { // HIGH volatility
      // High vol: P5 <= long / P95 >= short
      if (currentPrice <= percentiles24h.p5) {
        signal = 'LONG';
        entry = currentPrice;
        // Ensure stop is below current price for LONG positions
        stopLoss = Math.min(percentiles24h.p1, currentPrice * 0.98); // At least 2% below entry for high vol
      } else if (currentPrice >= percentiles24h.p95) {
        signal = 'SHORT';
        entry = currentPrice;
        // Ensure stop is above current price for SHORT positions
        stopLoss = Math.max(percentiles24h.p99, currentPrice * 1.02); // At least 2% above entry for high vol
      }
    }

    // Target is always P50 (median from 24h ago)
    const target = percentiles24h.p50;

    // Format output for agent consumption
    const analysis: SimplifiedSynthAnalysis = {
      signal,
      currentPrice,
      currentPercentile: currentPricePercentileIn24h,
      percentiles24h,
      volatility: volatilityRegime,
      target
    };

    return formatSimplifiedAnalysis(asset, analysis);

  } catch (error) {
    console.error(`[SimplifiedSynthAnalysis] Error for ${asset}:`, error);
    return `SYNTH_${asset}_ANALYSIS:\n\nERROR: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// Calculate exact percentile of current price within 24h ago distribution using interpolation
function calculateCurrentPricePercentileIn24hDistribution(currentPrice: number, prices: number[], probs: number[]): number {
  // If current price is below the lowest price in distribution
  if (currentPrice <= prices[0]) {
    return probs[0] * 100; // Convert probability to percentile
  }
  
  // If current price is above the highest price in distribution
  if (currentPrice >= prices[prices.length - 1]) {
    return probs[prices.length - 1] * 100; // Convert probability to percentile
  }
  
  // Find the two prices that bracket the current price and interpolate
  for (let i = 0; i < prices.length - 1; i++) {
    if (prices[i] <= currentPrice && currentPrice <= prices[i + 1]) {
      // Linear interpolation between the two probability points
      const t = (currentPrice - prices[i]) / (prices[i + 1] - prices[i]);
      const interpolatedProb = probs[i] + t * (probs[i + 1] - probs[i]);
      return interpolatedProb * 100; // Convert probability to percentile
    }
  }
  
  // Fallback to 0 if no bracket found
  return 0;
}

// Format the simplified analysis for agent consumption
function formatSimplifiedAnalysis(asset: Asset, analysis: SimplifiedSynthAnalysis): string {
  const { signal, currentPrice, currentPercentile: currentPricePercentileIn24h, percentiles24h, volatility, target } = analysis;
  
  let output = `SYNTH_${asset}_ANALYSIS:\n\n`;
  
  // Signal and basic info
  output += `SIGNAL: ${signal}\n`;
  output += `CURRENT_PRICE: $${currentPrice.toFixed(2)}\n`;
  output += `CURRENT_PRICE_PERCENTILE: P${currentPricePercentileIn24h.toFixed(1)}\n`;
  output += `VOLATILITY_REGIME: ${volatility}\n`;
  output += `TARGET: $${target.toFixed(2)}\n\n`;
  
  // 24h ago percentiles (the reference data for strategy)
  output += `PERCENTILES:\n`;
  output += `├─ P1:  $${percentiles24h.p1.toFixed(2)}\n`;
  output += `├─ P5:  $${percentiles24h.p5.toFixed(2)}\n`;
  output += `├─ P10: $${percentiles24h.p10.toFixed(2)}\n`;
  output += `├─ P15: $${percentiles24h.p15.toFixed(2)}\n`;
  output += `├─ P20: $${percentiles24h.p20.toFixed(2)}\n`;
  output += `├─ P30: $${percentiles24h.p30.toFixed(2)}\n`;
  output += `├─ P40: $${percentiles24h.p40.toFixed(2)}\n`;
  output += `├─ P50: $${percentiles24h.p50.toFixed(2)} (TARGET)\n`;
  output += `├─ P60: $${percentiles24h.p60.toFixed(2)}\n`;
  output += `├─ P70: $${percentiles24h.p70.toFixed(2)}\n`;
  output += `├─ P80: $${percentiles24h.p80.toFixed(2)}\n`;
  output += `├─ P85: $${percentiles24h.p85.toFixed(2)}\n`;
  output += `├─ P90: $${percentiles24h.p90.toFixed(2)}\n`;
  output += `├─ P95: $${percentiles24h.p95.toFixed(2)}\n`;
  output += `└─ P99: $${percentiles24h.p99.toFixed(2)}\n\n`;
  
  // Strategy explanation
  output += `STRATEGY_LOGIC:\n`;
  if (signal === 'WAIT' && (currentPrice < percentiles24h.p1 || currentPrice > percentiles24h.p99)) {
    output += `Price outside prediction bounds [P1: $${percentiles24h.p1.toFixed(2)} - P99: $${percentiles24h.p99.toFixed(2)}] - WAITING\n`;
  } else if (volatility === 'VERY_LOW') {
    output += `Very low volatility: LONG ≤ P20 ($${percentiles24h.p20.toFixed(2)}), SHORT ≥ P80 ($${percentiles24h.p80.toFixed(2)})\n`;
  } else if (volatility === 'LOW') {
    output += `Low volatility: LONG ≤ P15 ($${percentiles24h.p15.toFixed(2)}), SHORT ≥ P85 ($${percentiles24h.p85.toFixed(2)})\n`;
  } else if (volatility === 'MEDIUM') {
    output += `Medium volatility: LONG ≤ P10 ($${percentiles24h.p10.toFixed(2)}), SHORT ≥ P90 ($${percentiles24h.p90.toFixed(2)})\n`;
  } else {
    output += `High volatility: LONG ≤ P5 ($${percentiles24h.p5.toFixed(2)}), SHORT ≥ P95 ($${percentiles24h.p95.toFixed(2)})\n`;
  }
  
  return output;
}
