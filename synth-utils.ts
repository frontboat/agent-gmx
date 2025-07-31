/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SYNTH LP BOUNDS API UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { EnhancedDataCache } from './gmx-cache';
import type { PercentileAnalysis } from './gmx-utils';


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

export interface PercentileDataPoint {
  timestamp: string;
  percentiles: Array<{
    price: number;
    percentile: number;
  }>;
}

// Fetch LP bounds data using cache
export async function fetchLPBoundsData(asset: 'BTC' | 'ETH', gmxDataCache: EnhancedDataCache): Promise<LPBoundsResponse> {
  return await gmxDataCache.getLPBoundsData(asset);
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

// Format analysis with historical percentile data
export function formatSynthAnalysisWithPercentileAnalysis(asset: 'BTC' | 'ETH', analysis: PercentileAnalysis): string {
  // Generate trading signal based on analysis
  const { signal, explanation } = generateTradingSignalFromAnalysis(analysis);
  
  let result = '';
  result += `ASSET: ${asset}\n`;
  result += `SIGNAL: ${signal}\n`;
  result += `SIGNAL_EXPLANATION: ${explanation}\n`;
  result += `CURRENT_PRICE: $${analysis.currentPrice.toFixed(0)}\n`;
  result += `CURRENT_PERCENTILE: P${Math.round(analysis.currentPercentile)}\n`;
  
  // Historical analysis
  result += `\nHISTORICAL_ANALYSIS (3h-24h window):\n`;
  result += `PERCENTILE_RANGE: P${Math.round(analysis.min)}-P${Math.round(analysis.max)} (${Math.round(analysis.range)} point range)\n`;
  result += `AVERAGE_PERCENTILE: P${Math.round(analysis.average)}\n`;
  result += `MEDIAN_PERCENTILE: P${Math.round(analysis.median)}\n`;
  result += `TREND: ${analysis.trend.toUpperCase()} (strength: ${(analysis.trendStrength * 100).toFixed(0)}%)\n`;
  result += `DATA_POINTS: ${analysis.dataPoints.length} snapshots\n`;
  
  // Position analysis
  const positionVsAvg = analysis.currentPercentile - analysis.average;
  const positionDesc = positionVsAvg > 10 ? 'well above average' :
                      positionVsAvg > 5 ? 'above average' :
                      positionVsAvg < -10 ? 'well below average' :
                      positionVsAvg < -5 ? 'below average' : 'near average';
  
  result += `POSITION_ANALYSIS: Currently ${positionDesc} (${positionVsAvg > 0 ? '+' : ''}${Math.round(positionVsAvg)} vs avg)\n`;
  
  return result;
}

// Generate trading signal from percentile analysis
function generateTradingSignalFromAnalysis(analysis: PercentileAnalysis): { signal: string; explanation: string } {
  const { currentPercentile, min, max, average, trend, trendStrength, range } = analysis;
  
  // Strong signals based on extremes + trend
  if (currentPercentile <= 10 && trend === 'falling' && trendStrength > 0.3) {
    return {
      signal: 'EXTREME_LONG',
      explanation: `P${Math.round(currentPercentile)} with strong falling trend. Price crashed through historical predictions.`
    };
  }
  
  if (currentPercentile >= 90 && trend === 'rising' && trendStrength > 0.3) {
    return {
      signal: 'EXTREME_SHORT',
      explanation: `P${Math.round(currentPercentile)} with strong rising trend. Price exceeded historical predictions.`
    };
  }
  
  // Strong signals based on position relative to range
  if (currentPercentile <= 15 && Math.abs(currentPercentile - min) < 5) {
    return {
      signal: 'STRONG_LONG',
      explanation: `P${Math.round(currentPercentile)} near 24h low (P${Math.round(min)}). At bottom of historical range.`
    };
  }
  
  if (currentPercentile >= 85 && Math.abs(currentPercentile - max) < 5) {
    return {
      signal: 'STRONG_SHORT',
      explanation: `P${Math.round(currentPercentile)} near 24h high (P${Math.round(max)}). At top of historical range.`
    };
  }
  
  // Reversal signals
  if (currentPercentile >= 80 && trend === 'falling' && trendStrength > 0.4) {
    return {
      signal: 'POSSIBLE_SHORT',
      explanation: `P${Math.round(currentPercentile)} but falling trend developing. Momentum may be reversing from highs.`
    };
  }
  
  if (currentPercentile <= 20 && trend === 'rising' && trendStrength > 0.4) {
    return {
      signal: 'POSSIBLE_LONG',
      explanation: `P${Math.round(currentPercentile)} but rising trend developing. Momentum may be reversing from lows.`
    };
  }
  
  // Range-based signals
  if (range < 15) {
    return {
      signal: 'WAIT',
      explanation: `P${Math.round(currentPercentile)} in narrow ${Math.round(range)}-point range. Low volatility, waiting for breakout.`
    };
  }
  
  // Default to neutral
  return {
    signal: 'NEUTRAL',
    explanation: `P${Math.round(currentPercentile)} in ${Math.round(range)}-point range. No clear directional bias.`
  };
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