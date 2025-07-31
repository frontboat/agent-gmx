/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SYNTH LP BOUNDS API UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// Rate limiting cache to prevent 429 errors
interface ApiRequestCache {
  lastRequestTime: number;
  data?: LPBoundsResponse;
}

const synthApiCache: Map<string, ApiRequestCache> = new Map();
const RATE_LIMIT_COOLDOWN_MS = 3000; // 3 seconds

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

// Fetch LP bounds data from new Synth API endpoint with rate limiting
export async function fetchLPBoundsData(asset: 'BTC' | 'ETH'): Promise<LPBoundsResponse> {
  const now = Date.now();
  const cacheKey = asset;
  const cached = synthApiCache.get(cacheKey);
  
  // Check if we need to wait due to rate limiting
  if (cached && (now - cached.lastRequestTime) < RATE_LIMIT_COOLDOWN_MS) {
    const waitTime = RATE_LIMIT_COOLDOWN_MS - (now - cached.lastRequestTime);
    console.warn(`[LP_BOUNDS] Rate limit cooldown: waiting ${waitTime}ms for ${asset}`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  const url = `https://api.synthdata.co/insights/lp-bounds-chart?asset=${asset}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Apikey ${process.env.SYNTH_API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LP_BOUNDS] API Error: ${response.status} - ${errorText}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Update cache with successful request
    synthApiCache.set(cacheKey, {
      lastRequestTime: Date.now(),
      data
    });
    
    return data;
  } catch (error) {
    // Update cache even on error to maintain rate limiting
    synthApiCache.set(cacheKey, {
      lastRequestTime: Date.now()
    });
    throw error;
  }
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
  if (currentPricePercentile <= 20) {
    return {
      signal: 'POSSIBLE_LONG',
      explanation: `P${currentPricePercentile}: ${predictionsAbove}% predictions above. BOTTOM QUINTILE.`
    };
  }
  if (currentPricePercentile >= 85) {
    return {
      signal: 'POSSIBLE_SHORT',
      explanation: `P${currentPricePercentile}: ${predictionsBelow}% predictions below. Reaching possible highs.`
    };
  }
  if (currentPricePercentile >= 80) {
    return {
      signal: 'POSSIBLE_SHORT',
      explanation: `P${currentPricePercentile}: ${predictionsBelow}% predictions below. TOP QUINTILE.`
    };
  }

  // Neutral zone - no edge
  return {
    signal: 'NEUTRAL',
    explanation: `P${currentPricePercentile}: ${predictionsAbove}% above, ${predictionsBelow}% below. NO EDGE - Wait for clearer levels.`
  };
}