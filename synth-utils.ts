/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SYNTH VOLATILITY API UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// Types for the volatility API

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

// Fetch past percentile data from Synth dashboard (historical data with actual price)
export async function fetchSynthPastPercentileData(asset: 'BTC' | 'ETH'): Promise<any> {
  const requestBody = {
    "output": "past-percentile-plot.figure",
    "outputs": {
      "id": "past-percentile-plot",
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

// Parse past percentile data to get current price percentile and percentile values
export function parseSynthPastPercentileData(dashboardResponse: any): { 
  currentPrice: number; 
  currentPricePercentile: number;
  currentPercentiles: PercentileDataPoint;
} {
  try {
    // Handle the response structure properly
    if (!dashboardResponse || !dashboardResponse.response || !dashboardResponse.response["past-percentile-plot"]) {
      throw new Error(`Invalid response structure for past percentile data`);
    }
    
    const figure = dashboardResponse.response["past-percentile-plot"].figure;
    
    if (!figure || !figure.data) {
      throw new Error(`No figure data found in past percentile response`);
    }
    
    const data = figure.data;
    
    if (!data || data.length === 0) {
      throw new Error(`No data found in past percentile response`);
    }

    // Find the actual price line (index 21 based on the structure you showed)
    let actualPriceLine = null;
    for (let i = 0; i < data.length; i++) {
      const line = data[i];
      const hoverTemplate = line.hovertemplate || '';
      if (hoverTemplate.includes('Price') && !hoverTemplate.includes('Percentile')) {
        actualPriceLine = line;
        break;
      }
    }

    if (!actualPriceLine || !actualPriceLine.y || actualPriceLine.y.length === 0) {
      throw new Error(`No actual price data found in past percentile response`);
    }

    // Get the latest actual price (last point in the time series)
    let currentPrice: number;
    
    // Handle binary data if present
    if (actualPriceLine.y.bdata && actualPriceLine.y.dtype === 'f8') {
      // Decode base64 binary data as float64 array
      const binaryData = atob(actualPriceLine.y.bdata);
      const float64Array = new Float64Array(binaryData.length / 8);
      
      for (let j = 0; j < float64Array.length; j++) {
        const bytes = new Uint8Array(8);
        for (let k = 0; k < 8; k++) {
          bytes[k] = binaryData.charCodeAt(j * 8 + k);
        }
        const dataView = new DataView(bytes.buffer);
        float64Array[j] = dataView.getFloat64(0, true); // little-endian
      }
      
      currentPrice = float64Array[float64Array.length - 1];
    } else if (Array.isArray(actualPriceLine.y)) {
      currentPrice = actualPriceLine.y[actualPriceLine.y.length - 1];
    } else {
      throw new Error('Unable to extract current price from actual price line');
    }
    
    // Get the same timestamp index for all percentile lines
    // For actual price line, x array is longer (1440 points) than percentile lines (289 points)
    // We need to use the last timestamp from x array
    const actualPriceLastIndex = actualPriceLine.x ? actualPriceLine.x.length - 1 : 0;
    const currentTimestamp = actualPriceLine.x ? actualPriceLine.x[actualPriceLastIndex] : new Date().toISOString();
    
    // For percentile lines, we need to find the last index from their data
    const percentileLastIndex = 288; // Based on your data showing 289 points
    
    // Extract percentile values at the current time
    const percentileValues: Array<{ level: number; price: number }> = [];
    const currentPercentiles: PercentileDataPoint = {
      timestamp: currentTimestamp,
      p0_5: 0,
      p5: 0,
      p20: 0,
      p35: 0,
      p50: 0,
      p65: 0,
      p80: 0,
      p95: 0,
      p99_5: 0
    };
    
    for (let i = 0; i < data.length; i++) {
      const line = data[i];
      const hoverTemplate = line.hovertemplate || '';
      
      let percentileLevel = 0;
      let percentileKey = '';
      
      if (hoverTemplate.includes('99.5th Percentile')) {
        percentileLevel = 99.5;
        percentileKey = 'p99_5';
      } else if (hoverTemplate.includes('0.5th Percentile')) {
        percentileLevel = 0.5;
        percentileKey = 'p0_5';
      } else if (hoverTemplate.includes('95th Percentile')) {
        percentileLevel = 95;
        percentileKey = 'p95';
      } else if (hoverTemplate.includes('80th Percentile')) {
        percentileLevel = 80;
        percentileKey = 'p80';
      } else if (hoverTemplate.includes('65th Percentile')) {
        percentileLevel = 65;
        percentileKey = 'p65';
      } else if (hoverTemplate.includes('50th Percentile')) {
        percentileLevel = 50;
        percentileKey = 'p50';
      } else if (hoverTemplate.includes('35th Percentile')) {
        percentileLevel = 35;
        percentileKey = 'p35';
      } else if (hoverTemplate.includes('20th Percentile')) {
        percentileLevel = 20;
        percentileKey = 'p20';
      } else if (hoverTemplate.includes('5th Percentile')) {
        percentileLevel = 5;
        percentileKey = 'p5';
      }
      
      if (percentileLevel > 0 && line.y) {
        let price: number;
        
        // Handle binary data if present
        if (line.y.bdata && line.y.dtype === 'f8') {
          // Decode base64 binary data as float64 array
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
          
          price = float64Array[Math.min(percentileLastIndex, float64Array.length - 1)];
        } else if (Array.isArray(line.y) && line.y[percentileLastIndex] !== undefined) {
          price = line.y[percentileLastIndex];
        } else {
          continue; // Skip this percentile if we can't get the price
        }
        
        percentileValues.push({ level: percentileLevel, price });
        if (percentileKey) {
          (currentPercentiles as any)[percentileKey] = price;
        }
      }
    }
    
    // Sort percentiles by level for easier interpolation
    percentileValues.sort((a, b) => a.level - b.level);
    
    // Calculate where current price sits in the percentile distribution
    let currentPricePercentile = 50; // default
    
    if (percentileValues.length > 0) {
      // Find which percentile band the current price falls into
      if (currentPrice <= percentileValues[0].price) {
        currentPricePercentile = 0;
      } else if (currentPrice >= percentileValues[percentileValues.length - 1].price) {
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
    
    return { currentPrice, currentPricePercentile, currentPercentiles };
    
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to parse past percentile data: ${error}`);
  }
}

// Parse percentile data from dashboard response
export function parseSynthPercentileData(dashboardResponse: any): PercentileDataPoint[] {
  try {
    // Handle the response structure properly
    if (!dashboardResponse || !dashboardResponse.response || !dashboardResponse.response["future-percentile-plot"]) {
      throw new Error(`Invalid response structure for future percentile data`);
    }
    
    const figure = dashboardResponse.response["future-percentile-plot"].figure;
    
    if (!figure || !figure.data) {
      throw new Error(`No figure data found in future percentile response`);
    }
    
    const data = figure.data;
    
    if (!data || data.length === 0) {
      throw new Error('No data found in future percentile response');
    }

    // The data array contains multiple percentile lines (P0.5, P5, P20, etc.)
    // We need to extract timestamps and values for each percentile
    const timestamps = data[0].x; // All percentiles share the same timestamps
    
    if (!timestamps || timestamps.length === 0) {
      throw new Error('No timestamps found in future percentile data');
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
          } catch (error) {
          }
        } else if (Array.isArray(line.y)) {
          percentileLines[percentileKey] = line.y;
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

    
    return percentileData;
    
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to parse future percentile data: ${error}`);
  }
}

// Function to fetch volatility dial data from API
export async function fetchVolatilityDialRaw(asset: 'BTC' | 'ETH'): Promise<VolatilityDialResponse> {
  const requestBody = JSON.stringify({
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
        value: Date.now() / 1000
      }
    ],
    changedPropIds: ["last-update-time.data"],
    parsedChangedPropsIds: ["last-update-time.data"]
  });
  
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

// Helper function to calculate where current price sits in percentile distribution
export function calculatePricePercentile(currentPrice: number, currentPercentiles: PercentileDataPoint): number {
  const percentileValues: Array<{ level: number; price: number }> = [];
  
  // Extract percentile values
  if (currentPercentiles.p0_5) percentileValues.push({ level: 0.5, price: currentPercentiles.p0_5 });
  if (currentPercentiles.p5) percentileValues.push({ level: 5, price: currentPercentiles.p5 });
  if (currentPercentiles.p20) percentileValues.push({ level: 20, price: currentPercentiles.p20 });
  if (currentPercentiles.p35) percentileValues.push({ level: 35, price: currentPercentiles.p35 });
  if (currentPercentiles.p50) percentileValues.push({ level: 50, price: currentPercentiles.p50 });
  if (currentPercentiles.p65) percentileValues.push({ level: 65, price: currentPercentiles.p65 });
  if (currentPercentiles.p80) percentileValues.push({ level: 80, price: currentPercentiles.p80 });
  if (currentPercentiles.p95) percentileValues.push({ level: 95, price: currentPercentiles.p95 });
  if (currentPercentiles.p99_5) percentileValues.push({ level: 99.5, price: currentPercentiles.p99_5 });
  
  // Sort percentiles by level for easier interpolation
  percentileValues.sort((a, b) => a.level - b.level);
  
  // Calculate where current price sits in the percentile distribution
  let currentPricePercentile = 50; // default
  
  if (percentileValues.length > 0) {
    // Find which percentile band the current price falls into
    if (currentPrice <= percentileValues[0].price) {
      currentPricePercentile = 0;
    } else if (currentPrice >= percentileValues[percentileValues.length - 1].price) {
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

// Simplified function to format Synth analysis with only current percentile data
export function formatSynthAnalysisSimplified(
  asset: 'BTC' | 'ETH', 
  currentPrice: number, 
  volatilityData: VolatilityData | undefined,
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
  
  if (volatilityData) {
    result += `VOLATILITY_FORECAST: ${volatilityData.value}%\n`;
    result += `VOLATILITY_CATEGORY: ${volatilityData.category}\n`;
  }
  
  // CURRENT ZONE PERCENTILES - Show the percentile price levels
  result += `\nCURRENT_ZONE_PERCENTILES:\n`;
  result += `P0.5: $${(currentPercentiles.p0_5 || 0).toFixed(0)}\n`;
  result += `P5: $${(currentPercentiles.p5 || 0).toFixed(0)}\n`;
  result += `P20: $${(currentPercentiles.p20 || 0).toFixed(0)}\n`;
  result += `P35: $${(currentPercentiles.p35 || 0).toFixed(0)}\n`;
  result += `P50: $${(currentPercentiles.p50 || 0).toFixed(0)}\n`;
  result += `P65: $${(currentPercentiles.p65 || 0).toFixed(0)}\n`;
  result += `P80: $${(currentPercentiles.p80 || 0).toFixed(0)}\n`;
  result += `P95: $${(currentPercentiles.p95 || 0).toFixed(0)}\n`;
  result += `P99.5: $${(currentPercentiles.p99_5 || 0).toFixed(0)}\n`;
  
  return result;
}

// Function to format the Synth AI analysis output optimized for AI processing
export function formatSynthAnalysis(
  percentileData: PercentileDataPoint[], 
  asset: 'BTC' | 'ETH', 
  currentPrice: number, 
  volatilityData: VolatilityData | undefined,
  currentPricePercentile: number,
  currentPercentiles: PercentileDataPoint
): string {

  // Generate new trading signal based on percentile rank only
  const { signal, explanation } = generateTradingSignalFromPercentile(currentPricePercentile);
  
  // Build structured output for AI consumption
  let result = `SYNTH_${asset}_ANALYSIS:\n\n`;

  // PRIORITY SECTION - Most important info first
  result += `TRADING_SIGNAL: ${signal}\n`;
  result += `SIGNAL_EXPLANATION: ${explanation}\n`;
  result += `CURRENT_PRICE: $${currentPrice.toFixed(0)}\n`;
  result += `CURRENT_PRICE_PERCENTILE: P${currentPricePercentile}\n`;
  
  if (volatilityData) {
    result += `VOLATILITY_FORECAST: ${volatilityData.value}%\n`;
    result += `VOLATILITY_CATEGORY: ${volatilityData.category}\n`;
  }
  
  // HOURLY PREDICTIONS - Start with current data, then show predictions for each hour over next 24 hours
  result += `\nHOURLY_PREDICTIONS:\n`;
  
  // First line: Current data point from past percentile data
  const currentTimestamp = currentPercentiles.timestamp ? new Date(currentPercentiles.timestamp).toISOString().substring(11, 16) : 'NOW';
  result += `${currentTimestamp}: P0.5=$${(currentPercentiles.p0_5 || 0).toFixed(0)} P5=$${(currentPercentiles.p5 || 0).toFixed(0)} P20=$${(currentPercentiles.p20 || 0).toFixed(0)} P35=$${(currentPercentiles.p35 || 0).toFixed(0)} P50=$${(currentPercentiles.p50 || 0).toFixed(0)} P65=$${(currentPercentiles.p65 || 0).toFixed(0)} P80=$${(currentPercentiles.p80 || 0).toFixed(0)} P95=$${(currentPercentiles.p95 || 0).toFixed(0)} P99.5=$${(currentPercentiles.p99_5 || 0).toFixed(0)}\n`;
  
  if (percentileData.length > 0) {
    // Filter and align hourly predictions
    const validHourlyPredictions = getValidHourlyPredictions(percentileData, currentPercentiles.timestamp);
    
    validHourlyPredictions.forEach(dataPoint => {
      const timestamp = dataPoint.timestamp ? new Date(dataPoint.timestamp).toISOString().substring(11, 16) : '';
      result += `${timestamp}: P0.5=$${(dataPoint.p0_5 || 0).toFixed(0)} P5=$${(dataPoint.p5 || 0).toFixed(0)} P20=$${(dataPoint.p20 || 0).toFixed(0)} P35=$${(dataPoint.p35 || 0).toFixed(0)} P50=$${(dataPoint.p50 || 0).toFixed(0)} P65=$${(dataPoint.p65 || 0).toFixed(0)} P80=$${(dataPoint.p80 || 0).toFixed(0)} P95=$${(dataPoint.p95 || 0).toFixed(0)} P99.5=$${(dataPoint.p99_5 || 0).toFixed(0)}\n`;
    });
  }
    
  return result;
}

// Function to filter invalid data and align hourly predictions
export function getValidHourlyPredictions(percentileData: PercentileDataPoint[], currentTimestamp?: string): PercentileDataPoint[] {
  // Helper function to check if percentile data is valid (not all identical values)
  function isValidPercentileData(dataPoint: PercentileDataPoint): boolean {
    const values = [
      dataPoint.p0_5 || 0,
      dataPoint.p5 || 0,
      dataPoint.p20 || 0,
      dataPoint.p35 || 0,
      dataPoint.p50 || 0,
      dataPoint.p65 || 0,
      dataPoint.p80 || 0,
      dataPoint.p95 || 0,
      dataPoint.p99_5 || 0
    ].filter(v => v > 0); // Only consider non-zero values
    
    if (values.length < 5) return false; // Need at least 5 valid percentiles
    
    // Check if values are properly ordered (ascending)
    for (let i = 1; i < values.length; i++) {
      if (values[i] < values[i-1]) return false;
    }
    
    // Check if not all values are identical (with small tolerance for floating point)
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const tolerance = minVal * 0.001; // 0.1% tolerance
    
    return (maxVal - minVal) > tolerance;
  }
  
  // Calculate target time for first prediction (current time + 1 hour)
  let targetTime: Date;
  if (currentTimestamp) {
    targetTime = new Date(currentTimestamp);
    targetTime.setHours(targetTime.getHours() + 1);
  } else {
    targetTime = new Date();
    targetTime.setHours(targetTime.getHours() + 1);
  }
  
  const validPredictions: PercentileDataPoint[] = [];
  const usedIndices = new Set<number>(); // Track used data points to avoid duplicates
  let currentTargetTime = new Date(targetTime);
  
  // Look for up to 24 hourly predictions
  for (let hour = 0; hour < 24 && validPredictions.length < 24; hour++) {
    let bestMatch: PercentileDataPoint | null = null;
    let bestMatchIndex = -1;
    let bestTimeDiff = Infinity;
    
    // Find the valid data point closest to current target time
    for (let i = 0; i < percentileData.length; i++) {
      if (usedIndices.has(i)) continue; // Skip already used data points
      
      const dataPoint = percentileData[i];
      if (!dataPoint.timestamp || !isValidPercentileData(dataPoint)) {
        continue; // Skip invalid data
      }
      
      const dataTime = new Date(dataPoint.timestamp);
      const timeDiff = Math.abs(dataTime.getTime() - currentTargetTime.getTime());
      
      // Only consider data points within 30 minutes of target time
      if (timeDiff < 30 * 60 * 1000 && timeDiff < bestTimeDiff) {
        bestTimeDiff = timeDiff;
        bestMatch = dataPoint;
        bestMatchIndex = i;
      }
    }
    
    if (bestMatch && bestMatchIndex >= 0) {
      validPredictions.push(bestMatch);
      usedIndices.add(bestMatchIndex); // Mark as used
    }
    
    // Move to next hour target
    currentTargetTime.setHours(currentTargetTime.getHours() + 1);
  }
  
  return validPredictions;
}

// Fetch synth data - used by cache and direct calls
export const fetchSynthData = async (asset: 'BTC' | 'ETH'): Promise<any[]> => {
    // Step 1: Fetch top miners from leaderboard
    const leaderboardResponse = await fetch(`https://api.synthdata.co/leaderboard/latest`);
    
    if (leaderboardResponse.status === 429) {
        throw new Error('Rate limited - predictions temporarily unavailable');
    }
    
    if (!leaderboardResponse.ok) {
        throw new Error(`Failed to fetch predictions leaderboard: ${leaderboardResponse.statusText}`);
    }
    
    const leaderboardData = await leaderboardResponse.json();
    
    if (!leaderboardData || !Array.isArray(leaderboardData)) {
        throw new Error("Invalid leaderboard data format");
    }
    
    const topMiners = leaderboardData.slice(0, 10);
    
    if (topMiners.length === 0) {
        throw new Error('No miners available on leaderboard');
    }
    
    // Leaderboard rank values loaded
    
    // Step 2: Fetch predictions for each miner individually
    const minerIds = topMiners.map((m: any) => m.neuron_uid);
    const allPredictions = [];
    
    for (let i = 0; i < minerIds.length; i++) {
        const minerId = minerIds[i];
        const predictionsUrl = `https://api.synthdata.co/prediction/latest?miner=${minerId}&asset=${asset}&time_increment=300&time_length=86400`;
        
        try {
            const predictionsResponse = await fetch(predictionsUrl, {
                headers: {
                    'Authorization': `Apikey ${process.env.SYNTH_API_KEY}`
                }
            });
            
            if (predictionsResponse.status === 429) {
                console.warn(`Rate limited for miner ${minerId} - skipping`);
                continue;
            }
            
            if (!predictionsResponse.ok) {
                console.warn(`Failed to fetch predictions for miner ${minerId}: ${predictionsResponse.statusText}`);
                continue;
            }
            
            const minerPredictions = await predictionsResponse.json();
            
            if (minerPredictions && Array.isArray(minerPredictions) && minerPredictions.length > 0) {
                allPredictions.push(...minerPredictions);
            }
        } catch (error) {
            console.warn(`Error fetching predictions for miner ${minerId}:`, error);
            continue;
        }
        
        // Add 2 second delay between requests (except for the last one)
        if (i < minerIds.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    if (allPredictions.length === 0) {
        throw new Error('No predictions available from any miners');
    }
    
    const predictionsData = allPredictions;
    
    // Step 3: Consolidate predictions by original 5-minute intervals
    const consolidatedMap = new Map<string, any>();
    
    predictionsData.forEach((minerPrediction: any) => {
        const minerInfo = topMiners.find((m: any) => m.neuron_uid === minerPrediction.miner_uid);
        if (!minerInfo) {
            console.warn(`Miner ${minerPrediction.miner_uid} not found in top miners list`);
            return;
        }
        
        if (!minerPrediction.prediction || !Array.isArray(minerPrediction.prediction) || 
            !minerPrediction.prediction[0] || !Array.isArray(minerPrediction.prediction[0])) {
            console.warn(`Invalid prediction structure for miner ${minerPrediction.miner_uid}`);
            return;
        }
        
        const predictions = minerPrediction.prediction[0];
        
        predictions.forEach((pred: any) => {
            if (!pred.time || pred.price === undefined) {
                return;
            }
            
            // Keep original 5-minute timestamp
            const time = pred.time;
            const price = pred.price;
            
            if (!consolidatedMap.has(time)) {
                consolidatedMap.set(time, {
                    time,
                    predictions: []
                });
            }
            
            const prediction = {
                miner_uid: minerPrediction.miner_uid,
                rank: minerInfo.rank, // Use actual rank/incentive value from leaderboard
                price
            };
            
            // Rank assigned to miner prediction
            
            consolidatedMap.get(time)!.predictions.push(prediction);
        });
    });
    
    // Convert to array and sort by time
    const consolidatedArray = Array.from(consolidatedMap.values())
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        return consolidatedArray;
};

// Generate trading signal based on percentile rank - optimized for Claude Sonnet 4 agent processing
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

