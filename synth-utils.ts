/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SYNTH LP BOUNDS API UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
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

// Load synth data from file
export function loadSynthDataStore(): SnapshotStorage | null {
  try {
    if (fs.existsSync(SYNTH_DATA_PATH)) {
      const data = fs.readFileSync(SYNTH_DATA_PATH, 'utf-8');
      const parsed = JSON.parse(data) as SnapshotStorage;
      // Validate structure
      if (parsed.version && parsed.snapshots && parsed.snapshots.BTC && parsed.snapshots.ETH) {
        return parsed;
      }
    }
    console.warn('[SynthUtils] No synth data file found at:', SYNTH_DATA_PATH);
    return null;
  } catch (error) {
    console.error('[SynthUtils] Error loading synth data:', error);
    return null;
  }
}

// Get synth data snapshots for analysis (24h-23h window)
export function getSynthSnapshots(asset: 'BTC' | 'ETH'): LPBoundsSnapshot[] {
  const store = loadSynthDataStore();
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
  const store = loadSynthDataStore();
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
export function getMergedPercentileBounds(asset: 'BTC' | 'ETH', currentPrice: number): { percentile: number; mergedBounds: { timestamp: string; percentiles: Array<{ price: number; percentile: number }> } } | null {
  const snapshots = getSynthSnapshots(asset);
  
  if (snapshots.length === 0) {
    console.warn(`[SynthUtils] No snapshots available in 24h-23h window for ${asset}`);
    return null;
  }
  
  // Merge all probability_below data from all snapshots into a single unified range
  const allPriceLevels = new Map<number, number[]>(); // price -> array of probability_below values
  
  snapshots.forEach(snapshot => {
    const probabilityBelow = snapshot.bounds.data['24h'].probability_below;
    Object.entries(probabilityBelow).forEach(([priceStr, probBelow]) => {
      const price = parseFloat(priceStr);
      if (!allPriceLevels.has(price)) {
        allPriceLevels.set(price, []);
      }
      allPriceLevels.get(price)!.push(probBelow as number);
    });
  });
  
  // Create merged percentile bounds by averaging probability values at each price level
  const mergedPercentiles: Array<{ price: number; percentile: number }> = [];
  allPriceLevels.forEach((probabilities, price) => {
    const avgProbability = probabilities.reduce((sum, prob) => sum + prob, 0) / probabilities.length;
    const percentile = avgProbability * 100; // Convert to percentage
    mergedPercentiles.push({ price, percentile });
  });
  
  // Sort by price (ascending)
  mergedPercentiles.sort((a, b) => a.price - b.price);
  
  // Calculate current price percentile within merged bounds
  let currentPercentile = 50; // default
  
  if (mergedPercentiles.length > 0) {
    // Find which percentile band the current price falls into
    if (currentPrice <= mergedPercentiles[0].price) {
      // Below all predictions
      currentPercentile = 0;
    } else if (currentPrice >= mergedPercentiles[mergedPercentiles.length - 1].price) {
      // Above all predictions
      currentPercentile = 100;
    } else {
      // Interpolate between percentile bands
      for (let i = 0; i < mergedPercentiles.length - 1; i++) {
        const lowerBand = mergedPercentiles[i];
        const upperBand = mergedPercentiles[i + 1];
        
        if (currentPrice >= lowerBand.price && currentPrice <= upperBand.price) {
          const priceDiff = upperBand.price - lowerBand.price;
          const levelDiff = upperBand.percentile - lowerBand.percentile;
          
          if (priceDiff > 0) {
            const fraction = (currentPrice - lowerBand.price) / priceDiff;
            currentPercentile = Math.round(lowerBand.percentile + (fraction * levelDiff));
          } else {
            currentPercentile = Math.round(lowerBand.percentile);
          }
          break;
        }
      }
    }
  }
  
  console.warn(`[SynthUtils] ${asset} at $${currentPrice.toFixed(0)}: P${currentPercentile} from ${snapshots.length} snapshots`);
  
  // Create merged percentile data structure for formatSynthAnalysisSimplified
  const mergedPercentileData = {
    timestamp: new Date().toISOString(),
    percentiles: mergedPercentiles
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
  
  // CURRENT ZONE PERCENTILES - Show all dynamic percentile price levels
  result += `\nCURRENT_ZONE_PERCENTILES:\n`;
  currentPercentiles.percentiles
    .sort((a, b) => a.percentile - b.percentile) // Sort by percentile
    .forEach(p => {
      result += `P${p.percentile.toFixed(1)}: $${p.price.toFixed(0)}\n`;
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