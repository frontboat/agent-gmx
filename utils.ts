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
// 🔧 UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

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