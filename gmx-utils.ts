/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔧 GMX UTILITY FUNCTIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Utility functions for GMX trading calculations and formatting
 */

// Percentile analysis result
export interface PercentileAnalysis {
    asset: 'BTC' | 'ETH';
    currentPrice: number;
    dataPoints: Array<{
        timestamp: number;
        percentile: number;
        hoursAgo: number;
    }>;
    min: number;
    max: number;
    average: number;
    median: number;
    trend: 'rising' | 'falling' | 'stable';
    trendStrength: number; // 0-1, higher = stronger trend
    currentPercentile: number; // from most recent valid snapshot (3h)
    range: number; // max - min
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📋 CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const USD_DECIMALS = 30;
export const BASIS_POINTS_DIVISOR = 10000n;
export const PRECISION = 10n ** 30n;

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

// Extract percentile value from Synth analysis string
export function extractPercentileFromSynthAnalysis(synthAnalysis: string): number | null {
    const match = synthAnalysis.match(/CURRENT_PRICE_PERCENTILE:\s*P(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

// Extract position count from positions string
export function extractPositionCount(positionsStr: string): number {
    if (!positionsStr || positionsStr.includes('No positions')) return 0;
    const matches = positionsStr.match(/Position \d+:/g);
    return matches ? matches.length : 0;
}

// Check if a Synth signal is in cooldown period (30 minutes)
export function isInCooldown(
    asset: 'BTC' | 'ETH', 
    triggerType: 'LONG' | 'SHORT',
    lastTriggerTimestamp?: number,
    lastTriggerType?: string
): boolean {
    const COOLDOWN_MS = 1800000; // 30 minutes
    const now = Date.now();
    
    if (!lastTriggerTimestamp || !lastTriggerType) return false;
    
    // Only apply cooldown if same asset and same signal type
    const isSameSignal = lastTriggerType === triggerType;
    const isInCooldownPeriod = (now - lastTriggerTimestamp) < COOLDOWN_MS;
    
    return isSameSignal && isInCooldownPeriod;
}

// Get volatility-based activation thresholds
export function getVolatilityThresholds(volatilityPercent: number): { lowThreshold: number, highThreshold: number } {
    if (volatilityPercent < 20) {
        // Low volatility: P25/P75 (wider thresholds, filter noise)
        return { lowThreshold: 25, highThreshold: 75 };
    } else if (volatilityPercent < 40) {
        // Standard volatility: P15/P85
        return { lowThreshold: 15, highThreshold: 85 };
    } else if (volatilityPercent < 60) {
        // High volatility: P10/P90
        return { lowThreshold: 10, highThreshold: 90 };
    } else {
        // Very high volatility: P5/P95 (tighter thresholds, catch real moves)
        return { lowThreshold: 5, highThreshold: 95 };
    }
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
