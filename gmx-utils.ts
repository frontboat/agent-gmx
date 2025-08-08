/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔧 GMX UTILITY FUNCTIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Utility functions for GMX trading calculations and formatting
 */


// ═══════════════════════════════════════════════════════════════════════════════
// 📋 CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const USD_DECIMALS = 30;
export const BASIS_POINTS_DIVISOR = 10000n;
export const PRECISION = 10n ** 30n;

// ═══════════════════════════════════════════════════════════════════════════════
// 🏛️ ASSET TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

import { Asset, ASSETS } from './gmx-types';

/** Buffer name mappings for Synth data (dynamically generated) */
const ASSET_BUFFER_MAP = Object.fromEntries(
    ASSETS.map(asset => [asset, `${asset.toLowerCase()}Buffer`])
) as Record<Asset, string>;

/** GMX market symbol mappings (dynamically generated) */
const ASSET_MARKET_MAP = Object.fromEntries(
    ASSETS.map(asset => {
        // SOL market uses SOL-USDC, not WSOL-USDC
        const collateralSymbol = asset === 'BTC' ? 'BTC' : asset === 'ETH' ? 'WETH' : asset === 'SOL' ? 'SOL' : `W${asset}`;
        return [asset, `${asset}/USD [${collateralSymbol}-USDC]`];
    })
) as Record<Asset, string>;

// ═══════════════════════════════════════════════════════════════════════════════
// 🔧 ASSET HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get buffer name for asset (replaces ternary chains)
 * @param asset The asset symbol
 * @returns Buffer name string (e.g. 'btcBuffer', 'ethBuffer', 'solBuffer')
 */
export function getAssetBuffer(asset: Asset): string {
    return ASSET_BUFFER_MAP[asset];
}

/**
 * Get GMX market name for asset (replaces ternary chains)
 * @param asset The asset symbol  
 * @returns GMX market name (e.g. 'BTC/USD [BTC-USDC]')
 */
export function getGMXMarket(asset: Asset): string {
    return ASSET_MARKET_MAP[asset];
}

/**
 * Type guard to check if a string is a valid Asset
 * @param value String to check
 * @returns True if value is a valid Asset
 */
export function isValidAsset(value: string): value is Asset {
    return ASSETS.includes(value as Asset);
}

/**
 * Extract asset from GMX market name
 * @param marketName GMX market name (e.g. 'BTC/USD [BTC-USDC]' or 'ETH/USD [ETH-USDC]')
 * @returns Asset symbol (BTC, ETH, SOL) or null if not found
 */
export function getAssetFromMarketName(marketName: string): Asset | null {
    for (const asset of ASSETS) {
        if (marketName.includes(`${asset}/USD`)) {
            return asset;
        }
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔧 UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Safely convert string to BigInt (removes 'n' suffix if present)
 */
export function safeBigInt(value: string): bigint {
    const cleanValue = value.endsWith('n') ? value.slice(0, -1) : value;
    return BigInt(cleanValue);
}

/**
 * Format error objects consistently throughout the codebase
 * @param error - The error to format (can be Error, string, or unknown)
 * @returns Formatted error message string
 */
export function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

// Utility function to add delay before write operations to prevent nonce errors
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Use GMX SDK's decimal conversion utilities for maximum precision
export const bigIntToDecimal = (value: bigint, decimals: number): number => {
    // Handle negative values properly
    const negative = value < 0n;
    const absValue = negative ? -value : value;
    
    const divisor = 10n ** BigInt(decimals);
    const integerPart = absValue / divisor;
    const fractionalPart = absValue % divisor;
    
    // Convert to string to avoid precision loss, then parse as float
    const result = parseFloat(`${integerPart}.${fractionalPart.toString().padStart(decimals, "0")}`);
    return negative ? -result : result;
};

// More precise decimal formatting following GMX SDK patterns
export const formatTokenAmount = (value: bigint, decimals: number, displayDecimals: number = 6): string => {
    const num = bigIntToDecimal(value, decimals);
    return num.toFixed(displayDecimals);
};

// Proper USD formatting with commas
export const formatUsdAmount = (value: bigint, displayDecimals: number = 2): string => {
    const num = bigIntToDecimal(value, USD_DECIMALS);
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: displayDecimals,
        maximumFractionDigits: displayDecimals
    }).format(num);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🧮 GMX CALCULATION UTILITIES (Following Official SDK Patterns)
// ═══════════════════════════════════════════════════════════════════════════════

// Apply factor (similar to GMX SDK's applyFactor)
export const applyFactor = (value: bigint, factor: bigint): bigint => {
    return (value * factor) / PRECISION;
};

// Convert token amount to USD (following GMX SDK pattern)
export const convertToUsd = (
    tokenAmount: bigint | undefined,
    tokenDecimals: number | undefined,
    price: bigint | undefined
): bigint | undefined => {
    if (tokenAmount === undefined || typeof tokenDecimals !== "number" || price === undefined) {
        return undefined;
    }
    return (tokenAmount * price) / (10n ** BigInt(tokenDecimals));
};

// Convert USD amount to token amount (following GMX SDK pattern)
export const convertToTokenAmount = (
    usd: bigint | undefined,
    tokenDecimals: number | undefined,
    price: bigint | undefined
): bigint | undefined => {
    if (usd === undefined || typeof tokenDecimals !== "number" || price === undefined || price <= 0n) {
        return undefined;
    }
    return (usd * (10n ** BigInt(tokenDecimals))) / price;
};

// Calculate position PnL following GMX SDK logic
export const calculatePositionPnl = (params: {
    sizeInUsd: bigint;
    sizeInTokens: bigint;
    markPrice: bigint;
    isLong: boolean;
    indexTokenDecimals: number;
}): bigint => {
    const { sizeInUsd, sizeInTokens, markPrice, isLong, indexTokenDecimals } = params;
    
    // Calculate entry price from position data
    // Entry price = sizeInUsd / sizeInTokens (accounting for decimals)
    if (sizeInTokens === 0n) return 0n;
    
    const entryPrice = (sizeInUsd * (10n ** BigInt(indexTokenDecimals))) / sizeInTokens;
    
    // Calculate PnL based on price difference
    // Long: (current_price - entry_price) * size_in_tokens
    // Short: (entry_price - current_price) * size_in_tokens
    const priceDifference = isLong ? markPrice - entryPrice : entryPrice - markPrice;
    const pnl = (priceDifference * sizeInTokens) / (10n ** BigInt(indexTokenDecimals));
    
    return pnl;
};

// Calculate leverage following GMX SDK logic
export const calculateLeverage = (params: {
    sizeInUsd: bigint;
    collateralUsd: bigint;
    pnl: bigint;
    pendingFundingFeesUsd: bigint;
    pendingBorrowingFeesUsd: bigint;
}): bigint | undefined => {
    const { sizeInUsd, collateralUsd, pnl, pendingFundingFeesUsd, pendingBorrowingFeesUsd } = params;
    
    const totalPendingFeesUsd = pendingFundingFeesUsd + pendingBorrowingFeesUsd;
    const remainingCollateralUsd = collateralUsd + pnl - totalPendingFeesUsd;
    
    if (remainingCollateralUsd <= 0n) return undefined;
    
    return (sizeInUsd * BASIS_POINTS_DIVISOR) / remainingCollateralUsd;
};

// Calculate liquidation price following GMX SDK logic
export const calculateLiquidationPrice = (params: {
    sizeInUsd: bigint;
    sizeInTokens: bigint;
    collateralAmount: bigint;
    collateralUsd: bigint;
    markPrice: bigint;
    indexTokenDecimals: number;
    collateralTokenDecimals: number;
    isLong: boolean;
    minCollateralFactor: bigint;
    pendingBorrowingFeesUsd: bigint;
    pendingFundingFeesUsd: bigint;
    isSameCollateralAsIndex: boolean;
}): bigint | undefined => {
    const { 
        sizeInUsd, sizeInTokens, collateralAmount, collateralUsd, markPrice,
        indexTokenDecimals, isLong, minCollateralFactor, 
        pendingBorrowingFeesUsd, pendingFundingFeesUsd, isSameCollateralAsIndex
    } = params;
    
    const liquidationCollateralUsd = applyFactor(sizeInUsd, minCollateralFactor);
    const totalFeesUsd = pendingBorrowingFeesUsd + pendingFundingFeesUsd;
    
    try {
        if (isSameCollateralAsIndex) {
            // Same collateral as index token
            if (isLong) {
                const numerator = sizeInUsd + liquidationCollateralUsd + totalFeesUsd;
                const denominator = sizeInTokens + collateralAmount;
                if (denominator <= 0n) return undefined;
                return (numerator * (10n ** BigInt(indexTokenDecimals))) / denominator;
            } else {
                const numerator = sizeInUsd - liquidationCollateralUsd - totalFeesUsd;
                const denominator = sizeInTokens - collateralAmount;
                if (denominator <= 0n) return undefined;
                return (numerator * (10n ** BigInt(indexTokenDecimals))) / denominator;
            }
        } else {
            // Different collateral from index token
            const remainingCollateralUsd = collateralUsd - totalFeesUsd;
            
            if (isLong) {
                const numerator = liquidationCollateralUsd - remainingCollateralUsd + sizeInUsd;
                if (sizeInTokens <= 0n) return undefined;
                return (numerator * (10n ** BigInt(indexTokenDecimals))) / sizeInTokens;
            } else {
                const numerator = liquidationCollateralUsd - remainingCollateralUsd - sizeInUsd;
                if (sizeInTokens <= 0n) return undefined;
                return (numerator * (10n ** BigInt(indexTokenDecimals))) / (-sizeInTokens);
            }
        }
    } catch (error) {
        console.warn("Error calculating liquidation price:", error);
        return undefined;
    }
};

// Calculate position net value
export const calculatePositionNetValue = (params: {
    collateralUsd: bigint;
    pnl: bigint;
    pendingFundingFeesUsd: bigint;
    pendingBorrowingFeesUsd: bigint;
    closingFeeUsd?: bigint;
}): bigint => {
    const { collateralUsd, pnl, pendingFundingFeesUsd, pendingBorrowingFeesUsd, closingFeeUsd = 0n } = params;
    
    const pendingFeesUsd = pendingFundingFeesUsd + pendingBorrowingFeesUsd;
    return collateralUsd - pendingFeesUsd - closingFeeUsd + pnl;
};

// Enhanced version that can identify take profits when price context is available
export function getTradeActionDescriptionEnhanced(
    eventName: string, 
    orderType: number, 
    isLong: boolean,
    triggerPrice?: number,
    currentPrice?: number,
    entryPrice?: number
): string {
    let action = '';
    
    switch (eventName) {
        case 'OrderCreated': action = 'Created'; break;
        case 'OrderExecuted': action = 'Executed'; break;
        case 'OrderCancelled': action = 'Cancelled'; break;
        case 'OrderUpdated': action = 'Updated'; break;
        case 'OrderFrozen': action = 'Frozen'; break;
        default: action = eventName;
    }
    
    let orderTypeStr = '';
    switch (orderType) {
        case 0: orderTypeStr = 'Market Swap'; break;
        case 1: orderTypeStr = 'Limit Swap'; break;
        case 2: orderTypeStr = `Market ${isLong ? 'Long' : 'Short'} Increase`; break;
        case 3: orderTypeStr = `Limit ${isLong ? 'Long' : 'Short'} Increase`; break;
        case 4: orderTypeStr = `Market ${isLong ? 'Long' : 'Short'} Decrease`; break;
        case 5: {
            // For Limit Decrease orders, try to identify if it's a take profit
            if (triggerPrice && currentPrice) {
                const isTakeProfit = isLong ? 
                    triggerPrice > currentPrice : // Long take profit: sell above current price
                    triggerPrice < currentPrice;  // Short take profit: buy below current price
                
                if (isTakeProfit) {
                    orderTypeStr = `Take Profit ${isLong ? 'Long' : 'Short'}`;
                } else {
                    orderTypeStr = `Limit ${isLong ? 'Long' : 'Short'} Decrease`;
                }
            } else {
                orderTypeStr = `Limit ${isLong ? 'Long' : 'Short'} Decrease/Take Profit`;
            }
            break;
        }
        case 6: orderTypeStr = `Stop Loss ${isLong ? 'Long' : 'Short'} Decrease`; break;
        case 7: orderTypeStr = 'Liquidation'; break;
        case 8: orderTypeStr = `Stop ${isLong ? 'Long' : 'Short'} Increase`; break;
        default: orderTypeStr = `Order Type ${orderType}`;
    }
    
    return `${action} ${orderTypeStr}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔧 HELPER FUNCTIONS FOR EVENT-DRIVEN MONITORING
// ═══════════════════════════════════════════════════════════════════════════════

// Extract percentile value from Synth analysis string (for display purposes only, not triggering)
export function extractPercentileFromSynthAnalysis(synthAnalysis: string): number | null {
    // Match the new format with exact percentile
    let match = synthAnalysis.match(/CURRENT_PRICE_PERCENTILE:\s*P(\d+\.?\d*)/);
    if (match) {
        return parseFloat(match[1]);
    }
    
    return null;
}

// Extract position count from positions string
export function extractPositionCount(positionsStr: string): number {
    if (!positionsStr || positionsStr.includes('No positions')) return 0;
    const matches = positionsStr.match(/Position \d+:/g);
    return matches ? matches.length : 0;
}

// Check if a Synth signal is in cooldown period (1 hour per asset)
export function isInCooldown(
    asset: Asset, 
    triggerType: 'LONG' | 'SHORT',
    lastTriggerTimestamp?: number,
    lastTriggerType?: string
): boolean {
    const COOLDOWN_MS = 3600000; // 1 hour
    const now = Date.now();
    
    if (!lastTriggerTimestamp) return false;
    
    // Apply cooldown per asset regardless of signal type (LONG or SHORT)
    const isInCooldownPeriod = (now - lastTriggerTimestamp) < COOLDOWN_MS;
    
    return isInCooldownPeriod;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 TRADING PERFORMANCE METRICS
// ═══════════════════════════════════════════════════════════════════════════════

export const calculatePerformanceMetrics = (trades: any[]) => {
    if (!trades.length) {
        return {
            totalPnl: 0,
            winRate: 0,
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            averageProfit: 0,
            averageLoss: 0,
            largestWin: 0,
            largestLoss: 0,
            profitFactor: 0,
        };
    }

    const executedTrades = trades.filter(trade => 
        trade.pnlUsd !== undefined && 
        trade.pnlUsd !== 0
    );

    if (!executedTrades.length) {
        return {
            totalPnl: 0,
            winRate: 0,
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            averageProfit: 0,
            averageLoss: 0,
            largestWin: 0,
            largestLoss: 0,
            profitFactor: 0,
        };
    }

    const totalPnl = executedTrades.reduce((sum, trade) => sum + trade.pnlUsd, 0);
    const winningTrades = executedTrades.filter(trade => trade.pnlUsd > 0);
    const losingTrades = executedTrades.filter(trade => trade.pnlUsd < 0);
    
    const totalProfit = winningTrades.reduce((sum, trade) => sum + trade.pnlUsd, 0);
    const totalLoss = Math.abs(losingTrades.reduce((sum, trade) => sum + trade.pnlUsd, 0));
    
    const averageProfit = winningTrades.length > 0 ? totalProfit / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? totalLoss / losingTrades.length : 0;
    
    const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnlUsd)) : 0;
    const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnlUsd)) : 0;
    
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

    return {
        totalPnl,
        winRate: (winningTrades.length / executedTrades.length) * 100,
        totalTrades: executedTrades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        averageProfit,
        averageLoss,
        largestWin,
        largestLoss,
        profitFactor,
    };
};

// Calculate 24-hour rolling volatility from candlestick data
export function calculate24HourVolatility(candles: number[][]): number {
    if (!candles || candles.length < 2) {
        return 0;
    }
    
    // Extract closing prices
    const closePrices = candles.map(candle => candle[4]); // close is at index 4
    
    // Calculate log returns for each 15-minute period
    const returns: number[] = [];
    for (let i = 1; i < closePrices.length; i++) {
        const logReturn = Math.log(closePrices[i] / closePrices[i - 1]);
        returns.push(logReturn);
    }
    
    if (returns.length === 0) {
        return 0;
    }
    
    // Calculate mean return
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    
    // Calculate variance (sample variance with N-1 denominator)
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1);
    
    // Calculate standard deviation (volatility per 15-minute period)
    const stdDev = Math.sqrt(variance);
    
    // Annualize the volatility correctly for 15-minute intervals
    // 15-minute intervals: 4 per hour * 24 hours * 365 days = 35,040 intervals per year
    const periodsPerYear = 4 * 24 * 365; // 35,040
    const annualizedVolatility = stdDev * Math.sqrt(periodsPerYear) * 100; // Convert to percentage
    
    return annualizedVolatility;
}

// Extract prediction trend signal information from enhanced synth analysis
export function extractRegimeSignalFromSynthAnalysis(synthAnalysis: string): {
    hasRegimeSignal: boolean;
    regimeSignal: 'LONG' | 'SHORT' | null;
    signalStrength: number;
    signalReason: string;
    marketRegime: string;
    regimeConfidence: number;
} {
    const lines = synthAnalysis.split('\n');
    
    let hasRegimeSignal = false;
    let regimeSignal: 'LONG' | 'SHORT' | null = null;
    let signalStrength = 0;
    let signalReason = '';
    let marketRegime = '';
    let regimeConfidence = 0;
    
    for (const line of lines) {
        // Handle new simplified format
        if (line.startsWith('SIGNAL: ')) {
            const signal = line.replace('SIGNAL: ', '').trim();
            if (signal === 'LONG') {
                regimeSignal = 'LONG';
                hasRegimeSignal = true;
                signalStrength = 90; // High confidence for new simplified strategy
            } else if (signal === 'SHORT') {
                regimeSignal = 'SHORT';
                hasRegimeSignal = true;
                signalStrength = 90; // High confidence for new simplified strategy
            } else if (signal === 'WAIT') {
                regimeSignal = null;
                hasRegimeSignal = false;
                signalStrength = 0;
            }
            // Map legacy BUY/SELL to LONG/SHORT for compatibility
            else if (signal === 'BUY') {
                regimeSignal = 'LONG';
                hasRegimeSignal = true;
            } else if (signal === 'SELL') {
                regimeSignal = 'SHORT';
                hasRegimeSignal = true;
            }
        } 
        // Handle volatility regime as market regime
        else if (line.startsWith('VOLATILITY_REGIME: ')) {
            marketRegime = line.replace('VOLATILITY_REGIME: ', '').trim();
            // Assign confidence based on volatility regime
            if (marketRegime === 'LOW') regimeConfidence = 95;
            else if (marketRegime === 'MEDIUM') regimeConfidence = 85;
            else if (marketRegime === 'HIGH') regimeConfidence = 75;
        }
        // Legacy signal strength parsing
        else if (line.startsWith('SIGNAL_STRENGTH: ')) {
            const strengthStr = line.replace('SIGNAL_STRENGTH: ', '').replace('%', '').trim();
            signalStrength = parseInt(strengthStr) || signalStrength;
        }
        // Legacy parsing
        else if (line.startsWith('SIGNAL_EXPLANATION: ')) {
            signalReason = line.replace('SIGNAL_EXPLANATION: ', '').trim();
        } else if (line.startsWith('PREDICTION_TREND: ')) {
            const trend = line.replace('PREDICTION_TREND: ', '').trim();
            if (!marketRegime) marketRegime = trend; // Use as fallback if no volatility regime
        }
        // Extract strategy logic as signal reason for new format
        else if (line.startsWith('STRATEGY_LOGIC:')) {
            // Get the next line which contains the actual strategy
            const strategyIndex = lines.indexOf(line);
            if (strategyIndex >= 0 && strategyIndex + 1 < lines.length) {
                signalReason = lines[strategyIndex + 1].trim();
            }
        }
    }
    
    // Set default signal reason if not found
    if (!signalReason && hasRegimeSignal) {
        signalReason = `Simplified percentile strategy: ${regimeSignal} signal based on ${marketRegime} volatility`;
    }
    
    return {
        hasRegimeSignal,
        regimeSignal,
        signalStrength,
        signalReason,
        marketRegime: marketRegime || 'unknown',
        regimeConfidence
    };
}
