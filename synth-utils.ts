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
  startTime?: string;  // Start time of this hour's predictions
  endTime?: string;    // End time of this hour's predictions
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

// Calculate percentiles from consolidated predictions
export function calculatePercentilesFromConsolidated(
  consolidatedArray: ConsolidatedPrediction[], 
  currentPrice: number
): {
  percentileData: PercentileDataPoint[],
  currentPricePercentile: number  // e.g., 33 for P33
} {
  // Group predictions into hourly buckets (12 time points = 1 hour)
  const hourlyGroups: ConsolidatedPrediction[][] = [];
  for (let i = 0; i < consolidatedArray.length; i += 12) {
    const hourGroup = consolidatedArray.slice(i, i + 12);
    if (hourGroup.length > 0) {
      hourlyGroups.push(hourGroup);
    }
  }

  // Calculate percentiles for each hour
  const percentileData: PercentileDataPoint[] = [];
  
  hourlyGroups.forEach((hourGroup, hourIndex) => {
    // Collect all prices for this hour
    const allPrices: number[] = [];
    hourGroup.forEach(timePoint => {
      timePoint.predictions.forEach(pred => {
        allPrices.push(pred.price);
      });
    });
    
    // Sort prices for percentile calculation
    allPrices.sort((a, b) => a - b);
    
    // Calculate standard percentiles
    const percentiles = {
      p0_5: calculatePercentileValue(allPrices, 0.5),
      p5: calculatePercentileValue(allPrices, 5),
      p20: calculatePercentileValue(allPrices, 20),
      p35: calculatePercentileValue(allPrices, 35),
      p50: calculatePercentileValue(allPrices, 50),
      p65: calculatePercentileValue(allPrices, 65),
      p80: calculatePercentileValue(allPrices, 80),
      p95: calculatePercentileValue(allPrices, 95),
      p99_5: calculatePercentileValue(allPrices, 99.5)
    };
    
    // Use median timestamp for the hour
    const medianIndex = Math.floor(hourGroup.length / 2);
    const timestamp = hourGroup[medianIndex].time;
    
    percentileData.push({
      timestamp,
      startTime: hourGroup[0].time,
      endTime: hourGroup[hourGroup.length - 1].time,
      ...percentiles
    });
  });

  // Calculate current price percentile using first hour's data
  let currentPricePercentile = 0;
  if (hourlyGroups.length > 0) {
    const firstHourPrices: number[] = [];
    hourlyGroups[0].forEach(timePoint => {
      timePoint.predictions.forEach(pred => {
        firstHourPrices.push(pred.price);
      });
    });
    currentPricePercentile = getCurrentPricePercentileRank(firstHourPrices, currentPrice);
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

// Get exact percentile rank of current price (0-100)
export function getCurrentPricePercentileRank(prices: number[], currentPrice: number): number {
  if (prices.length === 0) return 50;
  
  const sortedPrices = [...prices].sort((a, b) => a - b);
  
  // Count how many prices are below current price
  let countBelow = 0;
  for (const price of sortedPrices) {
    if (price < currentPrice) {
      countBelow++;
    } else {
      break;
    }
  }
  
  // Calculate percentile rank (0-100)
  return Math.round((countBelow / sortedPrices.length) * 100);
}

// Detect trend based on weighted hourly analysis
export function detectPercentileTrend(percentileData: PercentileDataPoint[]): { 
  direction: 'UPWARD' | 'DOWNWARD' | 'NEUTRAL', 
  strength: number 
} {
  if (percentileData.length < 6) return { direction: 'NEUTRAL', strength: 0 };
  
  // Analyze different time horizons with different weights
  const shortTermHours = Math.min(6, percentileData.length);   // Next 6 hours (high weight)
  const mediumTermHours = Math.min(12, percentileData.length); // Next 12 hours (medium weight)
  const longTermHours = Math.min(24, percentileData.length);   // Next 24 hours (low weight)
  
  let shortTermScore = 0;
  let mediumTermScore = 0;
  let longTermScore = 0;
  
  // Short-term trend (next 6 hours) - 60% weight
  for (let i = 1; i < shortTermHours; i++) {
    const prevP50 = percentileData[i-1].p50 || 0;
    const currP50 = percentileData[i].p50 || 0;
    const change = prevP50 > 0 ? ((currP50 - prevP50) / prevP50) * 100 : 0;
    
    if (change > 0.1) shortTermScore += 1;
    else if (change < -0.1) shortTermScore -= 1;
  }
  
  // Medium-term trend (next 12 hours) - 30% weight
  for (let i = 1; i < mediumTermHours; i++) {
    const prevP50 = percentileData[i-1].p50 || 0;
    const currP50 = percentileData[i].p50 || 0;
    const change = prevP50 > 0 ? ((currP50 - prevP50) / prevP50) * 100 : 0;
    
    if (change > 0.05) mediumTermScore += 1;
    else if (change < -0.05) mediumTermScore -= 1;
  }
  
  // Long-term trend (next 24 hours) - 10% weight
  for (let i = 1; i < longTermHours; i++) {
    const prevP50 = percentileData[i-1].p50 || 0;
    const currP50 = percentileData[i].p50 || 0;
    const change = prevP50 > 0 ? ((currP50 - prevP50) / prevP50) * 100 : 0;
    
    if (change > 0.02) longTermScore += 1;
    else if (change < -0.02) longTermScore -= 1;
  }
  
  // Calculate weighted score
  const weightedScore = (shortTermScore * 0.6) + (mediumTermScore * 0.3) + (longTermScore * 0.1);
  
  // Determine trend direction with stronger thresholds
  let direction: 'UPWARD' | 'DOWNWARD' | 'NEUTRAL';
  if (weightedScore > 1.5) {
    direction = 'UPWARD';
  } else if (weightedScore < -1.5) {
    direction = 'DOWNWARD';
  } else {
    direction = 'NEUTRAL';
  }
  
  return { direction, strength: weightedScore };
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




// Generate trading signal based on percentile rank and trend
export function generateTradingSignalFromPercentile(
  currentPricePercentile: number, 
  trend: 'UPWARD' | 'DOWNWARD' | 'NEUTRAL',
  trendStrength: number
): { signal: string; explanation: string } {
  let signal = 'NEUTRAL';
  let explanation = '';
  const trendStr = `${trend} (${trendStrength >= 0 ? '+' : ''}${trendStrength.toFixed(1)}%)`;
  
  if (currentPricePercentile < 30 && trend === 'UPWARD') {
    signal = 'LONG';
    explanation = `Price at P${currentPricePercentile} (low percentile) with ${trendStr} trend`;
  } else if (currentPricePercentile > 70 && trend === 'DOWNWARD') {
    signal = 'SHORT';
    explanation = `Price at P${currentPricePercentile} (high percentile) with ${trendStr} trend`;
  } else if (currentPricePercentile < 10 && trend !== 'DOWNWARD') {
    signal = 'STRONG_LONG';
    explanation = `Price at P${currentPricePercentile} (extreme low) with ${trendStr} trend`;
  } else if (currentPricePercentile > 90 && trend !== 'UPWARD') {
    signal = 'STRONG_SHORT';
    explanation = `Price at P${currentPricePercentile} (extreme high) with ${trendStr} trend`;
  } else {
    explanation = `Price at P${currentPricePercentile} with ${trendStr} trend - no clear signal`;
  }
  
  return { signal, explanation };
}

