/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SYNTH VOLATILITY API UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// Types for the volatility API
export interface DashUpdateRequest {
  output: string;
  outputs: {
    id: string;
    property: string;
  };
  inputs: Array<{
    id: string;
    property: string;
    value: string | number;
  }>;
  changedPropIds: string[];
  parsedChangedPropsIds: string[];
}


export interface VolatilityDialResponse {
  multi: boolean;
  response: {
    "volatility-dial-1": {
      figure: {
        data: Array<{
          domain: { x: number[]; y: number[] };
          gauge: {
            axis: {
              range: number[];
              tickcolor: string;
              tickfont: { color: string; size: number };
              ticktext: string[];
              tickvals: number[];
              tickwidth: number;
            };
            bar: { color: string };
            bgcolor: string;
            bordercolor: string;
            borderwidth: number;
            steps: Array<{ color: string; range: number[] }>;
          };
          mode: string;
          number: { font: { color: string; size: number }; suffix: string };
          value: number;
          type: string;
        }>;
        layout: {
          template: any;
          font: { color: string; family: string };
          xaxis: any;
          yaxis: any;
          paper_bgcolor: string;
          plot_bgcolor: string;
          title: {
            font: { family: string; size: number; color: string };
            text: string;
            x: number;
            y: number;
            yanchor: string;
          };
          width: number;
          height: number;
        };
      };
    };
  };
}

export interface VolatilityData {
  value: number;
  category: string;
  title: string;
}

export interface PercentileDataPoint {
  timestamp: string;
  p0_5?: number;  // 0.5th percentile
  p5?: number;
  p20?: number;
  p35?: number;
  p50?: number;
  p65?: number;
  p80?: number;
  p95?: number;
  p99_5?: number;  // 99.5th percentile
  startTime?: string;  // Start time of this 5-minute interval's predictions
  endTime?: string;    // End time of this 5-minute interval's predictions
}

// Interface for consolidated predictions from Synth
export interface ConsolidatedPrediction {
  time: string;
  predictions: Array<{
    miner_uid: number;
    rank: number;
    price: number;
  }>;
}

// Calculate percentiles from consolidated predictions - now processes each 5-minute timestamp directly
export function calculatePercentilesFromConsolidated(
  consolidatedArray: ConsolidatedPrediction[], 
  currentPrice: number
): {
  percentileData: PercentileDataPoint[],
  currentPricePercentile: number  // e.g., 33 for P33
} {
  if (consolidatedArray.length === 0) {
    return { percentileData: [], currentPricePercentile: 50 };
  }
  
  // Sort by timestamp to ensure proper ordering
  const sortedArray = [...consolidatedArray].sort((a, b) => 
    new Date(a.time).getTime() - new Date(b.time).getTime()
  );
  
  console.log(`[Synth] Processing ${sortedArray.length} 5-minute time slots directly (no hourly grouping)`);

  // Calculate percentiles for each 5-minute time slot
  const percentileData: PercentileDataPoint[] = [];
  
  sortedArray.forEach((timePoint, index) => {
    // Collect all predictions with ranks for this 5-minute slot
    const pricesWithRanks: Array<{ price: number; rank: number }> = [];
    timePoint.predictions.forEach(pred => {
      pricesWithRanks.push({ price: pred.price, rank: pred.rank });
    });
    
    // Normalize ranks to sum to 1
    const totalRank = pricesWithRanks.reduce((sum, item) => sum + item.rank, 0);
    const pricesWithWeights = pricesWithRanks.map(item => ({
      price: item.price,
      weight: totalRank > 0 ? item.rank / totalRank : 1 / pricesWithRanks.length
    }));
    
    // Calculate weighted percentiles
    const percentiles = {
      p0_5: calculateWeightedPercentileValue(pricesWithWeights, 0.5),
      p5: calculateWeightedPercentileValue(pricesWithWeights, 5),
      p20: calculateWeightedPercentileValue(pricesWithWeights, 20),
      p35: calculateWeightedPercentileValue(pricesWithWeights, 35),
      p50: calculateWeightedPercentileValue(pricesWithWeights, 50),
      p65: calculateWeightedPercentileValue(pricesWithWeights, 65),
      p80: calculateWeightedPercentileValue(pricesWithWeights, 80),
      p95: calculateWeightedPercentileValue(pricesWithWeights, 95),
      p99_5: calculateWeightedPercentileValue(pricesWithWeights, 99.5)
    };
    
    percentileData.push({
      timestamp: timePoint.time,
      startTime: timePoint.time,
      endTime: timePoint.time,
      ...percentiles
    });
  });

  // Calculate current price percentile using last time slot's data
  let currentPricePercentile = 0;
  if (sortedArray.length > 0) {
    const lastTimePoint = sortedArray[sortedArray.length - 1];
    const lastPredictions: Array<{ price: number; rank: number }> = [];
    lastTimePoint.predictions.forEach(pred => {
      lastPredictions.push({ price: pred.price, rank: pred.rank });
    });
    currentPricePercentile = getCurrentPricePercentileRankWeighted(lastPredictions, currentPrice);
  }

  return {
    percentileData,
    currentPricePercentile
  };
}

// Helper function to calculate specific percentile value
function calculatePercentileValue(sortedArray: number[], percentile: number): number {
  if (sortedArray.length === 0) return 0;
  
  const index = (percentile / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;
  
  if (lower === upper) {
    return sortedArray[lower];
  }
  
  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

// Calculate weighted percentile value using miner ranks as weights
function calculateWeightedPercentileValue(
  pricesWithWeights: Array<{ price: number; weight: number }>, 
  percentile: number
): number {
  if (pricesWithWeights.length === 0) return 0;
  
  // Sort by price
  const sorted = [...pricesWithWeights].sort((a, b) => a.price - b.price);
  
  // Log details for P50 calculation only
  const isP50 = Math.abs(percentile - 50) < 0.1;
  if (isP50 && Math.random() < 0.1) { // Log 10% of P50 calculations to avoid spam
    console.log(`\n[DEBUG] calculateWeightedPercentileValue for P${percentile}:`);
    console.log(`  Total items: ${sorted.length}`);
    console.log(`  Price range: $${sorted[0].price.toFixed(0)} - $${sorted[sorted.length-1].price.toFixed(0)}`);
    console.log(`  First 5 weights: ${sorted.slice(0, 5).map(item => item.weight.toFixed(6)).join(', ')}`);
  }
  
  // Calculate cumulative weights
  let cumulativeWeight = 0;
  const cumulativeWeights = sorted.map(item => {
    cumulativeWeight += item.weight;
    return { price: item.price, cumWeight: cumulativeWeight };
  });
  
  // Find the percentile position
  const targetWeight = percentile / 100;
  
  if (isP50 && Math.random() < 0.1) {
    console.log(`  Target weight for P50: ${targetWeight}`);
  }
  
  // Find the price at the target percentile
  for (let i = 0; i < cumulativeWeights.length; i++) {
    if (cumulativeWeights[i].cumWeight >= targetWeight) {
      // Linear interpolation if between two values
      if (i === 0 || cumulativeWeights[i].cumWeight === targetWeight) {
        if (isP50 && Math.random() < 0.1) {
          console.log(`  Found exact match at index ${i}: $${cumulativeWeights[i].price.toFixed(0)}`);
        }
        return cumulativeWeights[i].price;
      }
      
      // Interpolate between previous and current
      const prevWeight = cumulativeWeights[i - 1].cumWeight;
      const currWeight = cumulativeWeights[i].cumWeight;
      const prevPrice = cumulativeWeights[i - 1].price;
      const currPrice = cumulativeWeights[i].price;
      
      const fraction = (targetWeight - prevWeight) / (currWeight - prevWeight);
      const result = prevPrice + fraction * (currPrice - prevPrice);
      
      if (isP50 && Math.random() < 0.1) {
        console.log(`  Interpolating at index ${i}:`);
        console.log(`    Previous: weight=${prevWeight.toFixed(6)}, price=$${prevPrice.toFixed(0)}`);
        console.log(`    Current: weight=${currWeight.toFixed(6)}, price=$${currPrice.toFixed(0)}`);
        console.log(`    Fraction: ${fraction.toFixed(6)}`);
        console.log(`    Result: $${result.toFixed(0)}`);
      }
      
      return result;
    }
  }
  
  // Return the highest price if we somehow didn't find it
  return sorted[sorted.length - 1].price;
}

// Get exact percentile rank of current price (0-100)
export function getCurrentPricePercentileRank(prices: number[], currentPrice: number): number {
  if (prices.length === 0) return 50;
  
  const sortedPrices = [...prices].sort((a, b) => a - b);
  
  // Count how many prices are below or equal to current price
  let countBelowOrEqual = 0;
  for (const price of sortedPrices) {
    if (price <= currentPrice) {
      countBelowOrEqual++;
    } else {
      break;
    }
  }
  
  // Calculate percentile rank (0-100)
  // Using standard percentile rank formula to avoid edge cases
  return Math.round((countBelowOrEqual / sortedPrices.length) * 100);
}

// Get weighted percentile rank of current price using miner ranks
export function getCurrentPricePercentileRankWeighted(
  predictions: Array<{ price: number; rank: number }>, 
  currentPrice: number
): number {
  if (predictions.length === 0) return 50;
  
  // Normalize ranks to sum to 1
  const totalRank = predictions.reduce((sum, pred) => sum + pred.rank, 0);
  const weightsAndPrices = predictions.map(pred => ({
    price: pred.price,
    weight: totalRank > 0 ? pred.rank / totalRank : 1 / predictions.length
  }));
  
  // Sort by price
  weightsAndPrices.sort((a, b) => a.price - b.price);
  
  // Sum weights of predictions below or equal to current price
  let weightBelowOrEqual = 0;
  for (const item of weightsAndPrices) {
    if (item.price <= currentPrice) {
      weightBelowOrEqual += item.weight;
    } else {
      break;
    }
  }
  
  // Return percentile rank (0-100)
  return Math.round(weightBelowOrEqual * 100);
}

// Detect trend based on weighted 5-minute interval analysis
export function detectPercentileTrend(percentileData: PercentileDataPoint[]): { 
  direction: 'UPWARD' | 'DOWNWARD' | 'NEUTRAL', 
  strength: number 
} {
  if (percentileData.length < 12) return { direction: 'NEUTRAL', strength: 0 };
  
  // Analyze different time horizons with different weights (converted to 5-minute intervals)
  const shortTermIntervals = Math.min(72, percentileData.length);   // Next 6 hours = 72 intervals (high weight)
  const mediumTermIntervals = Math.min(144, percentileData.length); // Next 12 hours = 144 intervals (medium weight)
  const longTermIntervals = Math.min(288, percentileData.length);   // Next 24 hours = 288 intervals (low weight)
  
  let shortTermScore = 0;
  let mediumTermScore = 0;
  let longTermScore = 0;
  
  // Short-term trend (next 6 hours = 72 intervals) - 60% weight
  // Use smaller thresholds since we're comparing 5-minute intervals
  for (let i = 1; i < shortTermIntervals; i++) {
    const prevP50 = percentileData[i-1].p50 || 0;
    const currP50 = percentileData[i].p50 || 0;
    const change = prevP50 > 0 ? ((currP50 - prevP50) / prevP50) * 100 : 0;
    
    if (change > 0.02) shortTermScore += 1;      // 0.02% threshold for 5-min intervals
    else if (change < -0.02) shortTermScore -= 1;
  }
  
  // Medium-term trend (next 12 hours = 144 intervals) - 30% weight
  for (let i = 1; i < mediumTermIntervals; i++) {
    const prevP50 = percentileData[i-1].p50 || 0;
    const currP50 = percentileData[i].p50 || 0;
    const change = prevP50 > 0 ? ((currP50 - prevP50) / prevP50) * 100 : 0;
    
    if (change > 0.01) mediumTermScore += 1;     // 0.01% threshold for 5-min intervals
    else if (change < -0.01) mediumTermScore -= 1;
  }
  
  // Long-term trend (next 24 hours = 288 intervals) - 10% weight
  for (let i = 1; i < longTermIntervals; i++) {
    const prevP50 = percentileData[i-1].p50 || 0;
    const currP50 = percentileData[i].p50 || 0;
    const change = prevP50 > 0 ? ((currP50 - prevP50) / prevP50) * 100 : 0;
    
    if (change > 0.005) longTermScore += 1;     // 0.005% threshold for 5-min intervals
    else if (change < -0.005) longTermScore -= 1;
  }
  
  // Calculate weighted score
  const weightedScore = (shortTermScore * 0.6) + (mediumTermScore * 0.3) + (longTermScore * 0.1);
  
  // Determine trend direction with stronger thresholds
  let direction: 'UPWARD' | 'DOWNWARD' | 'NEUTRAL';
  if (weightedScore >= 1) {
    direction = 'UPWARD';
  } else if (weightedScore <= -1) {
    direction = 'DOWNWARD';
  } else {
    direction = 'NEUTRAL';
  }
  
  return { direction, strength: weightedScore };
}


// NEW: Fetch percentile data directly from Synth dashboard
export async function fetchSynthPercentileData(asset: 'BTC' | 'ETH'): Promise<any> {
  const requestBody = {
    "output": "future-percentile-plot.figure",
    "outputs": {
      "id": "future-percentile-plot",
      "property": "figure"
    },
    "inputs": [
      {
        "id": "dropdown-asset",
        "property": "value",
        "value": asset
      },
      {
        "id": "last-update-time",
        "property": "data",
        "value": Date.now() / 1000
      }
    ],
    "changedPropIds": ["last-update-time.data"],
    "parsedChangedPropsIds": ["last-update-time.data"]
  };

  const response = await fetch("https://volatility.synthdata.co/_dash-update-component", {
    "credentials": "include",
    "headers": {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "Content-Type": "application/json",
      "X-CSRFToken": "undefined",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Priority": "u=4"
    },
    "referrer": "https://volatility.synthdata.co/",
    "body": JSON.stringify(requestBody),
    "method": "POST",
    "mode": "cors"
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

// Parse percentile data from dashboard response
export function parseSynthPercentileData(dashboardResponse: any): PercentileDataPoint[] {
  try {
    const figure = dashboardResponse.response["future-percentile-plot"].figure;
    const data = figure.data;
    
    if (!data || data.length === 0) {
      console.warn('[Synth] No percentile data found in dashboard response');
      return [];
    }

    // The data array contains multiple percentile lines (P0.5, P5, P20, etc.)
    // We need to extract timestamps and values for each percentile
    const timestamps = data[0].x; // All percentiles share the same timestamps
    
    if (!timestamps || timestamps.length === 0) {
      console.warn('[Synth] No timestamps found in percentile data');
      return [];
    }

    // Find each percentile line by examining hovertemplate
    const percentileLines: { [key: string]: number[] } = {};
    
    for (let i = 0; i < data.length; i++) {
      const line = data[i];
      const hoverTemplate = line.hovertemplate || '';
      
      // Extract percentile level from hovertemplate (e.g., "99.5th Percentile", "50th Percentile")
      // IMPORTANT: Check more specific patterns first (0.5th before 5th, 99.5th before 95th)
      let percentileKey = '';
      if (hoverTemplate.includes('99.5th Percentile')) percentileKey = 'p99_5';
      else if (hoverTemplate.includes('0.5th Percentile')) percentileKey = 'p0_5';
      else if (hoverTemplate.includes('95th Percentile')) percentileKey = 'p95';
      else if (hoverTemplate.includes('80th Percentile')) percentileKey = 'p80';
      else if (hoverTemplate.includes('65th Percentile')) percentileKey = 'p65';
      else if (hoverTemplate.includes('50th Percentile')) percentileKey = 'p50';
      else if (hoverTemplate.includes('35th Percentile')) percentileKey = 'p35';
      else if (hoverTemplate.includes('20th Percentile')) percentileKey = 'p20';
      else if (hoverTemplate.includes('5th Percentile')) percentileKey = 'p5';
      
      // Debug logging for 0.5th percentile specifically
      if (hoverTemplate.includes('0.5th Percentile')) {
        console.log(`[Synth] Found 0.5th percentile at index ${i}, mode: ${line.mode}, fill: ${line.fill}, existing: ${!!percentileLines.p0_5}`);
        console.log(`[Synth] Hover template: "${hoverTemplate}"`);
        console.log(`[Synth] Will set percentileKey to: ${percentileKey}`);
      }
      
      // Process if we found a percentile key and don't already have it (avoid duplicates)
      if (percentileKey && line.y && !percentileLines[percentileKey]) {
        // Handle binary data if present, otherwise use direct array
        if (line.y.bdata && line.y.dtype === 'f8') {
          // Decode base64 binary data as float64 array
          try {
            const binaryData = atob(line.y.bdata);
            const float64Array = new Float64Array(binaryData.length / 8);
            
            for (let j = 0; j < float64Array.length; j++) {
              const bytes = new Uint8Array(8);
              for (let k = 0; k < 8; k++) {
                bytes[k] = binaryData.charCodeAt(j * 8 + k);
              }
              const dataView = new DataView(bytes.buffer);
              float64Array[j] = dataView.getFloat64(0, true); // little-endian
            }
            
            percentileLines[percentileKey] = Array.from(float64Array);
            console.log(`[Synth] Decoded ${float64Array.length} binary values for ${percentileKey} (index ${i})`);
            
            // Debug for 0.5th percentile
            if (hoverTemplate.includes('0.5th Percentile')) {
              console.log(`[Synth] *** STORED 0.5th percentile as key: ${percentileKey} ***`);
            }
          } catch (error) {
            console.warn(`[Synth] Failed to decode binary data for ${percentileKey}:`, error);
          }
        } else if (Array.isArray(line.y)) {
          percentileLines[percentileKey] = line.y;
          console.log(`[Synth] Found array data for ${percentileKey} (index ${i})`);
        }
      }
    }

    // Build PercentileDataPoint array
    const percentileData: PercentileDataPoint[] = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      const dataPoint: PercentileDataPoint = {
        timestamp: timestamps[i],
        startTime: timestamps[i],
        endTime: timestamps[i],
        p0_5: percentileLines.p0_5?.[i],
        p5: percentileLines.p5?.[i],
        p20: percentileLines.p20?.[i],
        p35: percentileLines.p35?.[i],
        p50: percentileLines.p50?.[i],
        p65: percentileLines.p65?.[i],
        p80: percentileLines.p80?.[i],
        p95: percentileLines.p95?.[i],
        p99_5: percentileLines.p99_5?.[i]
      };
      
      percentileData.push(dataPoint);
    }

    console.log(`[Synth] Parsed ${percentileData.length} percentile data points from dashboard`);
    console.log(`[Synth] Found percentiles: ${Object.keys(percentileLines).sort().join(', ')}`);
    
    // Debug: Check if we have all expected percentiles
    const expectedPercentiles = ['p0_5', 'p5', 'p20', 'p35', 'p50', 'p65', 'p80', 'p95', 'p99_5'];
    const missingPercentiles = expectedPercentiles.filter(p => !percentileLines[p]);
    if (missingPercentiles.length > 0) {
      console.warn(`[Synth] Missing percentiles: ${missingPercentiles.join(', ')}`);
    }
    
    return percentileData;
    
  } catch (error) {
    console.error('[Synth] Error parsing percentile data from dashboard:', error);
    return [];
  }
}

// Function to format the volatility dial API request
export function formatVolatilityDialRequest(asset: 'BTC' | 'ETH', timestamp: number = Date.now() / 1000): string {
  const request: DashUpdateRequest = {
    output: "volatility-dial-1.figure",
    outputs: {
      id: "volatility-dial-1",
      property: "figure"
    },
    inputs: [
      {
        id: "dropdown-asset",
        property: "value",
        value: asset
      },
      {
        id: "last-update-time",
        property: "data",
        value: timestamp
      }
    ],
    changedPropIds: ["last-update-time.data"],
    parsedChangedPropsIds: ["last-update-time.data"]
  };

  return JSON.stringify(request);
}


// Function to fetch volatility dial data from API
export async function fetchVolatilityDialRaw(asset: 'BTC' | 'ETH'): Promise<VolatilityDialResponse> {
  const requestBody = formatVolatilityDialRequest(asset);
  
  const response = await fetch("https://volatility.synthdata.co/_dash-update-component", {
    credentials: "include",
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: requestBody
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}


// Function to extract volatility data from dial response
export function extractVolatilityData(responseData: VolatilityDialResponse, asset: 'BTC' | 'ETH'): VolatilityData {
  const figure = responseData.response["volatility-dial-1"].figure;
  const data = figure.data[0];
  const layout = figure.layout;
  
  const value = data.value;
  const title = layout.title.text;
  
  // Extract category from title (e.g., "Moderate-Low Volatility")
  const titleLines = title.split('<br>');
  const volatilityLine = titleLines.find(line => line.includes('Volatility')) || '';
  const category = volatilityLine.replace(/.*:\s*/, '').trim();
  
  return {
    value: Math.round(value * 100) / 100, // Round to 2 decimal places
    category,
    title: titleLines[0] || `${asset} Future 24 Hours Synth Forecast`
  };
}




// Calculate current price percentile using Synth dashboard percentile bands
export function calculateCurrentPricePercentile(
  percentileDataPoint: PercentileDataPoint,
  currentPrice: number
): number {
  // Find which percentile band the current price falls into
  const percentileBands = [
    { level: 0.5, price: percentileDataPoint.p0_5 || 0 },
    { level: 5, price: percentileDataPoint.p5 || 0 },
    { level: 20, price: percentileDataPoint.p20 || 0 },
    { level: 35, price: percentileDataPoint.p35 || 0 },
    { level: 50, price: percentileDataPoint.p50 || 0 },
    { level: 65, price: percentileDataPoint.p65 || 0 },
    { level: 80, price: percentileDataPoint.p80 || 0 },
    { level: 95, price: percentileDataPoint.p95 || 0 },
    { level: 99.5, price: percentileDataPoint.p99_5 || 0 }
  ].filter(band => band.price > 0); // Remove invalid percentiles
  
  if (percentileBands.length === 0) {
    return 50; // Default to median if no valid percentiles
  }
  
  // Find the appropriate band
  if (currentPrice <= percentileBands[0].price) {
    // Below lowest percentile
    return 0;
  } else if (currentPrice >= percentileBands[percentileBands.length - 1].price) {
    // Above highest percentile
    return 100;
  } else {
    // Find the band the price falls between
    for (let i = 0; i < percentileBands.length - 1; i++) {
      const lowerBand = percentileBands[i];
      const upperBand = percentileBands[i + 1];
      
      if (currentPrice >= lowerBand.price && currentPrice <= upperBand.price) {
        // Interpolate between the two bands
        const priceDiff = upperBand.price - lowerBand.price;
        const levelDiff = upperBand.level - lowerBand.level;
        
        if (priceDiff > 0) {
          const fraction = (currentPrice - lowerBand.price) / priceDiff;
          return Math.round(lowerBand.level + (fraction * levelDiff));
        } else {
          // Prices are the same, use lower band
          return Math.round(lowerBand.level);
        }
      }
    }
  }
  
  // Fallback (should never reach here)
  return 50;
}

// Generate trading signal based on percentile rank only
export function generateTradingSignalFromPercentile(
  currentPricePercentile: number, 
  trend: 'UPWARD' | 'DOWNWARD' | 'NEUTRAL',
  trendStrength: number
): { signal: string; explanation: string } {
  let signal = 'NEUTRAL';
  let explanation = '';
  
  if (currentPricePercentile <= 0.5) {
    signal = 'EXTREME_LONG';
    explanation = `Price at absolute floor (P${currentPricePercentile}) - 99.5%+ of AI predictions above current level. Maximum conviction long with exceptional risk/reward ratio and minimal downside exposure.`;
  } else if (currentPricePercentile <= 5) {
    signal = 'STRONG_LONG';
    explanation = `Price at extreme low (P${currentPricePercentile}) - 95%+ of AI predictions above current level. High conviction long setup with favorable asymmetric risk profile and strong upside potential.`;
  } else if (currentPricePercentile <= 20) {
    signal = 'LONG';
    explanation = `Price trading below 80% of AI predictions (P${currentPricePercentile}) - significant long opportunity with good risk/reward. Consider larger position sizes as price approaches lower percentiles.`;
  } else if (currentPricePercentile <= 35) {
    signal = 'POSSIBLE_LONG';
    explanation = `Price below 65% of AI predictions (P${currentPricePercentile}) - moderate long opportunity with reasonable upside. Suitable for standard position sizing with defined risk management.`;
  } else if (currentPricePercentile >= 99.5) {
    signal = 'EXTREME_SHORT';
    explanation = `Price at absolute ceiling (P${currentPricePercentile}) - 99.5%+ of AI predictions below current level. Maximum conviction short with exceptional risk/reward ratio and minimal upside exposure.`;
  } else if (currentPricePercentile >= 95) {
    signal = 'STRONG_SHORT';
    explanation = `Price at extreme high (P${currentPricePercentile}) - 95%+ of AI predictions below current level. High conviction short setup with favorable asymmetric risk profile and strong downside potential.`;
  } else if (currentPricePercentile >= 80) {
    signal = 'SHORT';
    explanation = `Price trading above 80% of AI predictions (P${currentPricePercentile}) - significant short opportunity with good risk/reward. Consider larger position sizes as price approaches higher percentiles.`;
  } else if (currentPricePercentile >= 65) {
    signal = 'POSSIBLE_SHORT';
    explanation = `Price above 65% of AI predictions (P${currentPricePercentile}) - moderate short opportunity with reasonable downside. Suitable for standard position sizing with defined risk management.`;
  } else {
    signal = 'NEUTRAL';
    explanation = `Price in consensus range (P${currentPricePercentile}) - no clear directional edge. AI predictions evenly distributed around current level. Consider range-bound strategies or wait for clearer signals.`;
  }
  
  return { signal, explanation };
}

