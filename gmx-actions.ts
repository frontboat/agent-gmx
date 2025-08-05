// ═══════════════════════════════════════════════════════════════════════════════
// 📦 GMX ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

import { action } from "@daydreamsai/core";
import { z } from "zod/v4";
import type { GmxSdk } from "@gmx-io/sdk";
import type { GmxMemory } from './gmx-types';
import type { EnhancedDataCache } from './gmx-cache';
import { 
    USD_DECIMALS, 
    bigIntToDecimal, 
    formatTokenAmount, 
    formatUsdAmount,
    convertToUsd,
    safeBigInt,
    calculatePositionPnl,
    sleep,
    formatError
} from './gmx-utils';
import { get_positions_str, get_portfolio_balance_str, get_orders_str } from './gmx-queries';
import { transactionQueue } from './transaction-queue';

// Fixed slippage constant (1%)
const FIXED_SLIPPAGE_BPS = 100;

// Fixed price impact for take profit/stop loss orders (0.3%)
const FIXED_PRICE_IMPACT_BPS = 30;

// Delay after write operations before fetching fresh data (5 seconds)
const MEMORY_UPDATE_DELAY_MS = 5000;

// ═══════════════════════════════════════════════════════════════════════════════
// 🔄 MEMORY UPDATE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update positions in memory after position-affecting writes
 * Forces cache invalidation for fresh data
 */
export async function updatePositionsMemory(
    memory: GmxMemory, 
    gmxDataCache: EnhancedDataCache
): Promise<GmxMemory> {
    try {
        await sleep(MEMORY_UPDATE_DELAY_MS);
        
        // Force cache invalidation for positions
        gmxDataCache.invalidatePositions();
        
        // Get fresh data (cache will be refreshed due to invalidation)
        const [freshPositions, freshPortfolio] = await Promise.all([
            get_positions_str(gmxDataCache),
            get_portfolio_balance_str(gmxDataCache)
        ]);
        
        return {
            ...memory,
            positions: freshPositions,
            portfolio: freshPortfolio,
            lastResult: `Position data refreshed after write operation`,
            currentTask: memory.currentTask
        };
        
    } catch (error) {
        console.error('[MemoryUpdate] Failed to update position memory:', error);
        return memory; // Return unchanged memory on failure
    }
}

/**
 * Update orders in memory after order-affecting writes
 * Orders are NOT cached, so we fetch fresh data directly
 */
export async function updateOrdersMemory(
    memory: GmxMemory,
    sdk: GmxSdk,
    gmxDataCache: EnhancedDataCache
): Promise<GmxMemory> {
    try {
        await sleep(MEMORY_UPDATE_DELAY_MS);
        
        
        // Orders are fetched directly from SDK, not cached
        const freshOrders = await get_orders_str(sdk, gmxDataCache);
        
        
        return {
            ...memory,
            orders: freshOrders,
            lastResult: `Order data refreshed after write operation`,
            currentTask: memory.currentTask
        };
        
    } catch (error) {
        console.error('[MemoryUpdate] Failed to update order memory:', error);
        return memory;
    }
}

/**
 * Update portfolio (token balances) after swaps or position changes
 */
export async function updatePortfolioMemory(
    memory: GmxMemory,
    gmxDataCache: EnhancedDataCache
): Promise<GmxMemory> {
    try {
        await sleep(MEMORY_UPDATE_DELAY_MS);
        
        
        // Force cache invalidation for tokens
        gmxDataCache.invalidateTokens();
        
        const freshPortfolio = await get_portfolio_balance_str(gmxDataCache);
        
        
        return {
            ...memory,
            portfolio: freshPortfolio,
            lastResult: `Portfolio data refreshed after write operation`,
            currentTask: memory.currentTask
        };
        
    } catch (error) {
        console.error('[MemoryUpdate] Failed to update portfolio memory:', error);
        return memory;
    }
}

/**
 * Update multiple memory fields after complex operations like position close
 */
export async function updateMemoryAfterClose(
    memory: GmxMemory,
    sdk: GmxSdk,
    gmxDataCache: EnhancedDataCache
): Promise<GmxMemory> {
    try {
        await sleep(MEMORY_UPDATE_DELAY_MS);
        
        
        // Invalidate position and token caches
        gmxDataCache.invalidatePositions();
        gmxDataCache.invalidateTokens();
        
        // Fetch all updated data in parallel
        const [freshPositions, freshPortfolio, freshOrders] = await Promise.all([
            get_positions_str(gmxDataCache),
            get_portfolio_balance_str(gmxDataCache),
            get_orders_str(sdk, gmxDataCache)
        ]);
        
        
        return {
            ...memory,
            positions: freshPositions,
            portfolio: freshPortfolio,
            orders: freshOrders,
            lastResult: `All data refreshed after position close`,
            currentTask: memory.currentTask
        };
        
    } catch (error) {
        console.error('[MemoryUpdate] Failed to update memory after close:', error);
        return memory;
    }
}

export function createGmxActions(sdk: GmxSdk, gmxDataCache: EnhancedDataCache) {
    return [
    // ═══════════════════════════════════════════════════════════════════════════════
    // ✍️ WRITE METHODS - TRADING ACTIONS
    // ═══════════════════════════════════════════════════════════════════════════════

    // Cancel Orders (Official SDK Method)
    action({
        name: "cancel_orders",
        description: "Cancel one or more pending orders using GMX SDK",
        schema: z.object({
            orderKeys: z.array(z.string()).describe("Array of order key strings (32-byte hex strings starting with 0x)"),
        }),
        async handler(data, ctx, agent) {
            try {
                
                const result = await transactionQueue.enqueueWriteTransaction(
                    "cancel_orders",
                    async () => {
                        return await sdk.orders.cancelOrders(data.orderKeys);
                    }
                );
                
                let memory = ctx.memory as GmxMemory;
                
                // Update memory with fresh order data after cancellation
                memory = await updateOrdersMemory(memory, sdk, gmxDataCache);
                
                memory = {
                    ...memory,
                    currentTask: "❌ Cancelling stale orders",
                    lastResult: `Cancelled ${data.orderKeys.length} order(s)`
                };

                const successResult = {
                    success: true,
                    message: `Successfully cancelled ${data.orderKeys.length} order(s)`,
                    orderKeys: data.orderKeys,
                    transactionHash: result?.transactionHash || result?.hash || null,
                    details: {
                        cancelledOrderCount: data.orderKeys.length,
                        orderKeys: data.orderKeys
                    }
                };
                
                
                return successResult;
            } catch (error) {
                const errorResult = {
                    success: false,
                    error: formatError(error),
                    message: "Failed to cancel orders"
                };
                
                console.error('CANCEL_ORDERS', 'Failed to cancel orders', errorResult);
                
                return errorResult;
            }
        }
    }),

        // Open Long Market Order (Immediate Execution)
        action({
            name: "open_long_market",
            description: "Open a long position with a market order (immediate execution at current market price).",
            schema: z.object({
                marketAddress: z.string().describe("Market token address from getMarketsInfo response (e.g. '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336' for ETH/USD market)"),
                payAmount: z.string().describe("Amount to pay in BigInt string format using token's native decimals (e.g. '1000000' for 1 USDC with 6 decimals). Use this for collateral-based position sizing."),
                payTokenAddress: z.string().describe("ERC20 token contract address you're paying with (e.g. '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' for USDC)"),
                collateralTokenAddress: z.string().describe("ERC20 token contract address for collateral (e.g. '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' for WETH)"),
                leverage: z.string().optional().describe("Leverage in basis points as BigInt string (e.g. '50000' = 5x, '10000' = 1x, '60000' = 6x). Optional for helper function."),
            }),
            async handler(data, ctx, agent) {
                try {
                    
                    const marketsResult = await gmxDataCache.getMarketsInfo().catch(error => {
                        const errorMsg = `Failed to get market data: ${error.message || error}`;
                        console.error('OPEN_LONG_MARKET', error, { stage: 'getMarketsInfo' });
                        throw new Error(errorMsg);
                    });
                    const { marketsInfoData, tokensData } = marketsResult;
                    
                    if (!marketsInfoData || !tokensData) {
                        console.error('OPEN_LONG_MARKET', 'Invalid market data received', { marketsInfoData: !!marketsInfoData, tokensData: !!tokensData });
                        throw new Error("Invalid market data received");
                    }
                    
                    const marketInfo = marketsInfoData[data.marketAddress];
                    if (!marketInfo) {
                        console.error('OPEN_LONG_MARKET', `Market not found: ${data.marketAddress}`, { availableMarkets: Object.keys(marketsInfoData) });
                        throw new Error(`Market not found: ${data.marketAddress}`);
                    }
                                                            
                    const payToken = tokensData[data.payTokenAddress];
                    const collateralToken = tokensData[data.collateralTokenAddress];
                    
                    if (!payToken) {
                        console.error('OPEN_LONG_MARKET', `Pay token not found: ${data.payTokenAddress}`, { availableTokens: Object.keys(tokensData) });
                        throw new Error(`Pay token not found: ${data.payTokenAddress}`);
                    }
                    
                    if (!collateralToken) {
                        console.error('OPEN_LONG_MARKET', `Collateral token not found: ${data.collateralTokenAddress}`, { availableTokens: Object.keys(tokensData) });
                        throw new Error(`Collateral token not found: ${data.collateralTokenAddress}`);
                    }
                                        
                    const helperParams: any = {
                        payAmount: BigInt(data.payAmount),
                        marketAddress: data.marketAddress,
                        payTokenAddress: data.payTokenAddress,
                        collateralTokenAddress: data.collateralTokenAddress,
                        allowedSlippageBps: FIXED_SLIPPAGE_BPS,
                    };
    
                    if (data.leverage) {
                        helperParams.leverage = BigInt(data.leverage);
                    }
                    
                    console.warn('OPEN_LONG_MARKET', 'Helper params prepared', helperParams);
    
                    const result = await transactionQueue.enqueueWriteTransaction(
                        "open_long_market",
                        async () => {                            
                            return await sdk.orders.long(helperParams).catch(error => {
                                console.error('OPEN_LONG_MARKET', error, { 
                                    helperParams, 
                                    stage: 'sdk.orders.long',
                                    errorInfo: error.info,
                                    errorData: error.data,
                                    fullError: error
                                });
                                throw new Error(`Failed to open long position: ${error.message || error}`);
                            });
                        }
                    );
    
                    let memory = ctx.memory as GmxMemory;
                    
                    // Update memory with fresh position and portfolio data after opening position
                    memory = await updatePositionsMemory(memory, gmxDataCache);
                    
                    const leverageX = data.leverage ? parseFloat(data.leverage) / 10000 : 'Auto';
                    memory = {
                        ...memory,
                        currentTask: "🚀 Executing LONG market order",
                        lastResult: `Opened long market position${typeof leverageX === 'number' ? ` with ${leverageX}x leverage` : ''}`
                    }
    
                    const successResult = {
                        success: true,
                        message: `Successfully opened long market position`,
                        orderDetails: {
                            marketAddress: data.marketAddress,
                            direction: 'LONG',
                            orderType: 'Market',
                            payAmount: data.payAmount,
                            payToken: data.payTokenAddress,
                            collateralToken: data.collateralTokenAddress,
                            leverage: typeof leverageX === 'number' ? `${leverageX}x` : leverageX,
                        },
                        transactionHash: result?.transactionHash || null
                    };
                    
                    console.warn('OPEN_LONG_MARKET', 'Long market order opened successfully', successResult);
                                        
                    return successResult;
                } catch (error) {
                    const errorResult = {
                        success: false,
                        error: formatError(error),
                        message: "Failed to open long position"
                    };
                    
                    console.error('OPEN_LONG_MARKET', 'Failed to open long market order', errorResult);
                    
                    return errorResult;
                }
            }
        }),

        // Open Long Limit Order
        action({
            name: "open_long_limit",
            description: "Open a long position with a limit order (executes when price reaches or goes below your specified limit price).",
            schema: z.object({
                marketAddress: z.string().describe("Market token address from getMarketsInfo response (e.g. '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336' for ETH/USD market)"),
                payAmount: z.string().describe("Amount to pay in BigInt string format using token's native decimals (e.g. '1000000' for 1 USDC with 6 decimals). Use this for collateral-based position sizing."),
                payTokenAddress: z.string().describe("ERC20 token contract address you're paying with (e.g. '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' for USDC)"),
                collateralTokenAddress: z.string().describe("ERC20 token contract address for collateral (e.g. '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' for WETH)"),
                limitPrice: z.string().describe("Limit price for the order in BigInt string with 30-decimal precision (e.g. '65000000000000000000000000000000000' for $65,000). Order executes when market price reaches this level or better."),
                leverage: z.string().optional().describe("Leverage in basis points as BigInt string (e.g. '50000' = 5x, '10000' = 1x, '60000' = 6x). Optional for helper function."),
            }),
            async handler(data, ctx, agent) {
                try {
                    
                    const marketsResult = await gmxDataCache.getMarketsInfo().catch(error => {
                        const errorMsg = `Failed to get market data: ${error.message || error}`;
                        console.error('OPEN_LONG_LIMIT', error, { stage: 'getMarketsInfo' });
                        throw new Error(errorMsg);
                    });
                    const { marketsInfoData, tokensData } = marketsResult;
                    
                    if (!marketsInfoData || !tokensData) {
                        console.error('OPEN_LONG_LIMIT', 'Invalid market data received', { marketsInfoData: !!marketsInfoData, tokensData: !!tokensData });
                        throw new Error("Invalid market data received");
                    }
                    
                    const marketInfo = marketsInfoData[data.marketAddress];
                    if (!marketInfo) {
                        console.error('OPEN_LONG_LIMIT', `Market not found: ${data.marketAddress}`, { availableMarkets: Object.keys(marketsInfoData) });
                        throw new Error(`Market not found: ${data.marketAddress}`);
                    }
                    
                    const payToken = tokensData[data.payTokenAddress];
                    const collateralToken = tokensData[data.collateralTokenAddress];
                    
                    if (!payToken) {
                        console.error('OPEN_LONG_LIMIT', `Pay token not found: ${data.payTokenAddress}`, { availableTokens: Object.keys(tokensData) });
                        throw new Error(`Pay token not found: ${data.payTokenAddress}`);
                    }
                    
                    if (!collateralToken) {
                        console.error('OPEN_LONG_LIMIT', `Collateral token not found: ${data.collateralTokenAddress}`, { availableTokens: Object.keys(tokensData) });
                        throw new Error(`Collateral token not found: ${data.collateralTokenAddress}`);
                    }
                                        
                    const indexToken = tokensData[marketInfo.indexTokenAddress];
                    if (!indexToken) {
                        throw new Error(`Index token not found: ${marketInfo.indexTokenAddress}`);
                    }
                    
                    const currentMarketPrice = indexToken.prices?.maxPrice || 0n;
                    const limitPriceBigInt = BigInt(data.limitPrice);
                    
                    if (limitPriceBigInt >= currentMarketPrice) {
                        const currentPriceFormatted = formatUsdAmount(currentMarketPrice, 2);
                        const limitPriceFormatted = formatUsdAmount(limitPriceBigInt, 2);
                        throw new Error(`Invalid long limit order: limit price (${limitPriceFormatted}) must be lower than current market price (${currentPriceFormatted})`);
                    }
                    
                    const helperParams: any = {
                        payAmount: BigInt(data.payAmount),
                        marketAddress: data.marketAddress,
                        payTokenAddress: data.payTokenAddress,
                        collateralTokenAddress: data.collateralTokenAddress,
                        allowedSlippageBps: FIXED_SLIPPAGE_BPS,
                        limitPrice: BigInt(data.limitPrice) // Always include limit price for limit orders
                    };
    
                    if (data.leverage) {
                        helperParams.leverage = BigInt(data.leverage);
                    }
    
                    console.warn('OPEN_LONG_LIMIT', 'Helper params prepared', helperParams);
    
                    const result = await transactionQueue.enqueueWriteTransaction(
                        "open_long_limit",
                        async () => {                            
                            return await sdk.orders.long(helperParams).catch(error => {
                                console.error('OPEN_LONG_LIMIT', error, { 
                                    helperParams, 
                                    stage: 'sdk.orders.long',
                                    errorInfo: error.info,
                                    errorData: error.data,
                                    fullError: error
                                });
                                throw new Error(`Failed to open long limit order: ${error.message || error}`);
                            });
                        }
                    );
    
                    let memory = ctx.memory as GmxMemory;
                    
                    // Update memory with fresh order data after placing limit order
                    memory = await updateOrdersMemory(memory, sdk, gmxDataCache);
                    
                    const leverageX = data.leverage ? parseFloat(data.leverage) / 10000 : 'Auto';
                    memory = {
                        ...memory,
                        currentTask: "🎯 Placing LONG limit order",
                        lastResult: `Placed long limit order${typeof leverageX === 'number' ? ` with ${leverageX}x leverage` : ''} at ${formatUsdAmount(BigInt(data.limitPrice), 2)}`
                    }
    
                    const successResult = {
                        success: true,
                        message: `Successfully placed long limit order`,
                        orderDetails: {
                            marketAddress: data.marketAddress,
                            direction: 'LONG',
                            orderType: 'Limit',
                            payAmount: data.payAmount,
                            payToken: data.payTokenAddress,
                            collateralToken: data.collateralTokenAddress,
                            limitPrice: formatUsdAmount(BigInt(data.limitPrice), 2),
                            leverage: typeof leverageX === 'number' ? `${leverageX}x` : leverageX,
                        },
                        transactionHash: result?.transactionHash || null
                    };
                    
                    console.warn('OPEN_LONG_LIMIT', 'Long limit order placed successfully', successResult);
                                        
                    return successResult;
                } catch (error) {
                    const errorResult = {
                        success: false,
                        error: formatError(error),
                        message: "Failed to place long limit order"
                    };
                    
                    console.error('OPEN_LONG_LIMIT', 'Failed to place long limit order', errorResult);
                    
                    return errorResult;
                }
            }
        }),
    
        action({
            name: "open_short_market", 
            description: "Open a short position with a market order (immediate execution at current market price).",
            schema: z.object({
                marketAddress: z.string().describe("Market token address from getMarketsInfo response (e.g. '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336' for ETH/USD market)"),
                payAmount: z.string().describe("Amount to pay in BigInt string format using token's native decimals (e.g. '1000000' for 1 USDC with 6 decimals). Use this for collateral-based position sizing."),
                payTokenAddress: z.string().describe("ERC20 token contract address you're paying with (e.g. '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' for USDC)"),
                collateralTokenAddress: z.string().describe("ERC20 token contract address for collateral (e.g. '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' for WETH)"),
                leverage: z.string().optional().describe("Leverage in basis points as BigInt string (e.g. '50000' = 5x, '10000' = 1x, '60000' = 6x). Optional for helper function."),
            }),
            async handler(data, ctx, agent) {
                try {
                    
                    const marketsResult = await gmxDataCache.getMarketsInfo().catch(error => {
                        const errorMsg = `Failed to get market data: ${error.message || error}`;
                        console.error('OPEN_SHORT', error, { stage: 'getMarketsInfo' });
                        throw new Error(errorMsg);
                    });
                    const { marketsInfoData, tokensData } = marketsResult;
                    
                    if (!marketsInfoData || !tokensData) {
                        console.error('OPEN_SHORT', 'Invalid market data received', { marketsInfoData: !!marketsInfoData, tokensData: !!tokensData });
                        throw new Error("Invalid market data received");
                    }
                    
                    // Validate market and tokens exist
                    const marketInfo = marketsInfoData[data.marketAddress];
                    if (!marketInfo) {
                        console.error('OPEN_SHORT', `Market not found: ${data.marketAddress}`, { availableMarkets: Object.keys(marketsInfoData) });
                        throw new Error(`Market not found: ${data.marketAddress}`);
                    }
                    
                    const payToken = tokensData[data.payTokenAddress];
                    const collateralToken = tokensData[data.collateralTokenAddress];
                    
                    if (!payToken || !collateralToken) {
                        console.error('OPEN_SHORT', 'Invalid token addresses provided', { 
                            payTokenFound: !!payToken, 
                            collateralTokenFound: !!collateralToken,
                            availableTokens: Object.keys(tokensData)
                        });
                        throw new Error("Invalid token addresses provided");
                    }
                        
                    const helperParams: any = {
                        marketAddress: data.marketAddress,
                        payTokenAddress: data.payTokenAddress,
                        collateralTokenAddress: data.collateralTokenAddress,
                        allowedSlippageBps: FIXED_SLIPPAGE_BPS,
                        payAmount: safeBigInt(data.payAmount),
                    };
    
                    if (data.leverage) {
                        helperParams.leverage = safeBigInt(data.leverage);
                    }
    
                    console.warn('OPEN_SHORT', 'Helper params prepared', helperParams);
    
                    const result = await transactionQueue.enqueueWriteTransaction(
                        "open_short_market",
                        async () => {                            
                            return await sdk.orders.short(helperParams).catch(error => {
                                console.error('OPEN_SHORT_MARKET', error, { helperParams, stage: 'sdk.orders.short' });
                                throw new Error(`Failed to open short position: ${error.message || error}`);
                            });
                        }
                    );
    
                    let memory = ctx.memory as GmxMemory;
                    
                    // Update memory with fresh position and portfolio data after opening position
                    memory = await updatePositionsMemory(memory, gmxDataCache);
                    
                    const leverageX = data.leverage ? parseFloat(data.leverage) / 10000 : 'Auto';
                    memory = {
                        ...memory,
                        currentTask: "📉 Executing SHORT market order",
                        lastResult: `Opened short market position${typeof leverageX === 'number' ? ` with ${leverageX}x leverage` : ''}`
                    }
    
                    const successResult = {
                        success: true,
                        message: `Successfully opened short market position`,
                        orderDetails: {
                            marketAddress: data.marketAddress,
                            direction: 'SHORT',
                            orderType: 'Market',
                            payAmount: data.payAmount,
                            payToken: data.payTokenAddress,
                            collateralToken: data.collateralTokenAddress,
                            leverage: typeof leverageX === 'number' ? `${leverageX}x` : leverageX,
                        },
                        transactionHash: result?.transactionHash || null
                    };
                    
                    console.warn('OPEN_SHORT_MARKET', 'Short market order opened successfully', successResult);
                                        
                    return successResult;
                } catch (error) {
                    const errorResult = {
                        success: false,
                        error: formatError(error),
                        message: "Failed to open short market order"
                    };
                    
                    console.error('OPEN_SHORT_MARKET', 'Failed to open short market order', errorResult);
                    
                    return errorResult;
                }
            }
        }),

        // Open Short Limit Order (Execute at Specific Price)
        action({
            name: "open_short_limit",
            description: "Open a short position with a limit order (executes when price reaches or goes above your specified limit price).",
            schema: z.object({
                marketAddress: z.string().describe("Market token address from getMarketsInfo response (e.g. '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336' for ETH/USD market)"),
                payAmount: z.string().describe("Amount to pay in BigInt string format using token's native decimals (e.g. '1000000' for 1 USDC with 6 decimals). Use this for collateral-based position sizing."),
                payTokenAddress: z.string().describe("ERC20 token contract address you're paying with (e.g. '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' for USDC)"),
                collateralTokenAddress: z.string().describe("ERC20 token contract address for collateral (e.g. '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' for WETH)"),
                limitPrice: z.string().describe("Limit price for the order in BigInt string with 30-decimal precision (e.g. '67000000000000000000000000000000000' for $67,000). Order executes when market price reaches this level or better."),
                leverage: z.string().optional().describe("Leverage in basis points as BigInt string (e.g. '50000' = 5x, '10000' = 1x, '60000' = 6x). Optional for helper function."),
            }),
            async handler(data, ctx, agent) {
                try {
                    
                    const marketsResult = await gmxDataCache.getMarketsInfo().catch(error => {
                        const errorMsg = `Failed to get market data: ${error.message || error}`;
                        console.error('OPEN_SHORT_LIMIT', error, { stage: 'getMarketsInfo' });
                        throw new Error(errorMsg);
                    });
                    const { marketsInfoData, tokensData } = marketsResult;
                    
                    if (!marketsInfoData || !tokensData) {
                        console.error('OPEN_SHORT_LIMIT', 'Invalid market data received', { marketsInfoData: !!marketsInfoData, tokensData: !!tokensData });
                        throw new Error("Invalid market data received");
                    }
                    
                    const marketInfo = marketsInfoData[data.marketAddress];
                    if (!marketInfo) {
                        console.error('OPEN_SHORT_LIMIT', `Market not found: ${data.marketAddress}`, { availableMarkets: Object.keys(marketsInfoData) });
                        throw new Error(`Market not found: ${data.marketAddress}`);
                    }
                    
                    const payToken = tokensData[data.payTokenAddress];
                    const collateralToken = tokensData[data.collateralTokenAddress];
                    
                    if (!payToken || !collateralToken) {
                        console.error('OPEN_SHORT_LIMIT', 'Invalid token addresses provided', { 
                            payTokenFound: !!payToken, 
                            collateralTokenFound: !!collateralToken,
                            availableTokens: Object.keys(tokensData)
                        });
                        throw new Error("Invalid token addresses provided");
                    }
                    
                    const indexToken = tokensData[marketInfo.indexTokenAddress];
                    if (!indexToken) {
                        throw new Error(`Index token not found: ${marketInfo.indexTokenAddress}`);
                    }
                    
                    const currentMarketPrice = indexToken.prices?.minPrice || 0n;
                    const limitPriceBigInt = BigInt(data.limitPrice);
                    
                    if (limitPriceBigInt <= currentMarketPrice) {
                        const currentPriceFormatted = formatUsdAmount(currentMarketPrice, 2);
                        const limitPriceFormatted = formatUsdAmount(limitPriceBigInt, 2);
                        throw new Error(`Invalid short limit order: limit price (${limitPriceFormatted}) must be higher than current market price (${currentPriceFormatted})`);
                    }                    
    
                    const helperParams: any = {
                        marketAddress: data.marketAddress,
                        payTokenAddress: data.payTokenAddress,
                        collateralTokenAddress: data.collateralTokenAddress,
                        allowedSlippageBps: FIXED_SLIPPAGE_BPS,
                        payAmount: safeBigInt(data.payAmount),
                        limitPrice: safeBigInt(data.limitPrice) // Always include limit price for limit orders
                    };
    
                    if (data.leverage) {
                        helperParams.leverage = safeBigInt(data.leverage);
                    }
    
                    console.warn('OPEN_SHORT_LIMIT', 'Helper params prepared', helperParams);
    
                    const result = await transactionQueue.enqueueWriteTransaction(
                        "open_short_limit",
                        async () => {            
                            return await sdk.orders.short(helperParams).catch(error => {
                                console.error('OPEN_SHORT_LIMIT', error, { helperParams, stage: 'sdk.orders.short' });
                                throw new Error(`Failed to open short limit order: ${error.message || error}`);
                            });
                        }
                    );
    
                    let memory = ctx.memory as GmxMemory;
                    
                    // Update memory with fresh order data after placing limit order
                    memory = await updateOrdersMemory(memory, sdk, gmxDataCache);
                    
                    const leverageX = data.leverage ? parseFloat(data.leverage) / 10000 : 'Auto';
                    memory = {
                        ...memory,
                        currentTask: "🎯 Placing SHORT limit order",
                        lastResult: `Placed short limit order${typeof leverageX === 'number' ? ` with ${leverageX}x leverage` : ''} at ${formatUsdAmount(BigInt(data.limitPrice), 2)}`
                    }
    
                    const successResult = {
                        success: true,
                        message: `Successfully placed short limit order`,
                        orderDetails: {
                            marketAddress: data.marketAddress,
                            direction: 'SHORT',
                            orderType: 'Limit',
                            payAmount: data.payAmount,
                            payToken: data.payTokenAddress,
                            collateralToken: data.collateralTokenAddress,
                            limitPrice: formatUsdAmount(BigInt(data.limitPrice), 2),
                            leverage: typeof leverageX === 'number' ? `${leverageX}x` : leverageX,
                        },
                        transactionHash: result?.transactionHash || null
                    };
                    
                    console.warn('OPEN_SHORT_LIMIT', 'Short limit order placed successfully', successResult);
                                        
                    return successResult;
                } catch (error) {
                    const errorResult = {
                        success: false,
                        error: formatError(error),
                        message: "Failed to place short limit order"
                    };
                    
                    console.error('OPEN_SHORT_LIMIT', 'Failed to place short limit order', errorResult);
                    
                    return errorResult;
                }
            }
        }),
    

    // Close Position (Universal - handles both long and short)
    action({
        name: "close_position",
        description: "Fully close an existing position (long or short) automatically. Detects position direction and closes the entire position.",
        schema: z.object({
            marketAddress: z.string().describe("Market token address from get_positions response - must be the exact marketAddress field"),
            receiveTokenAddress: z.string().describe("Token address to receive proceeds in (typically USDC: 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 or the collateral token)"),
        }),
        async handler(data, ctx, agent) {
            try {
                let memory = ctx.memory as GmxMemory;
                

                // Get required market and token data
                const marketsResult = await gmxDataCache.getMarketsInfo().catch(error => {
                    console.error('CLOSE_POSITION', error, { stage: 'getMarketsInfo' });
                    throw new Error(`Failed to get market data: ${error.message || error}`);
                });
                const { marketsInfoData, tokensData } = marketsResult;
                
                if (!marketsInfoData || !tokensData) {
                    console.error('CLOSE_POSITION', 'Invalid market data received', { marketsInfoData: !!marketsInfoData, tokensData: !!tokensData });
                    throw new Error("Failed to get market and token data");
                }
                
                // Validate market exists
                const marketInfo = marketsInfoData[data.marketAddress];
                if (!marketInfo) {
                    console.error('CLOSE_POSITION', `Market not found: ${data.marketAddress}`, { availableMarkets: Object.keys(marketsInfoData) });
                    throw new Error(`Market not found: ${data.marketAddress}. Please use get_positions to find valid market addresses.`);
                }
                                                
                // Get current positions to find the position to close
                const positionsResult = await gmxDataCache.getPositions(marketsInfoData, tokensData);
                
                // Find ANY position for this market (long or short)
                const positions = positionsResult.positionsData ? Object.values(positionsResult.positionsData) : [];
                const position = positions.find((pos: any) => 
                    pos.marketAddress === data.marketAddress
                );
                
                if (!position) {
                    throw new Error(`No position found for market ${marketInfo.name}. Use get_positions to see current positions.`);
                }
                                
                const isLong = position.isLong;
                const direction = isLong ? 'LONG' : 'SHORT';
                
                // Validate receive token
                const receiveToken = tokensData[data.receiveTokenAddress];
                if (!receiveToken) {
                    throw new Error(`Invalid receive token address: ${data.receiveTokenAddress}`);
                }
                
                // Get index token data
                const indexToken = tokensData[marketInfo.indexTokenAddress];
                const collateralToken = tokensData[position.collateralTokenAddress];
                
                if (!indexToken || !collateralToken) {
                    throw new Error("Failed to get token data for position");
                }
                
                // Calculate PnL to check if positive
                const markPrice = isLong ? 
                    (indexToken.prices?.maxPrice || 0n) : 
                    (indexToken.prices?.minPrice || 0n);
                    
                const calculatedPnl = calculatePositionPnl({
                    sizeInUsd: position.sizeInUsd,
                    sizeInTokens: position.sizeInTokens,
                    markPrice,
                    isLong: position.isLong,
                    indexTokenDecimals: indexToken.decimals || 18
                });
                
                // Check if PnL is positive
                if (calculatedPnl <= 0n) {
                    const pnlFormatted = formatUsdAmount(calculatedPnl, 2);
                    throw new Error(`Cannot close position with negative PnL (${pnlFormatted}). Position must be in profit to close.`);
                }
                
                console.warn(`[CLOSE_POSITION] Position PnL: ${formatUsdAmount(calculatedPnl, 2)} - Proceeding with close`);
                               
                // Use GMX SDK's low-level transaction method with proper DecreasePositionAmounts
                const slippageBps = FIXED_SLIPPAGE_BPS;
                    
                // For longs: subtract price impact buffer (willing to accept lower price)
                // For shorts: add price impact buffer (willing to accept higher price)
                const acceptablePrice = isLong ? 
                    markPrice - (markPrice * BigInt(FIXED_PRICE_IMPACT_BPS) / 10000n) :
                    markPrice + (markPrice * BigInt(FIXED_PRICE_IMPACT_BPS) / 10000n);
                
                const collateralPrice = collateralToken.prices?.minPrice || 0n;
                const collateralDeltaUsd = convertToUsd(
                    position.collateralAmount,
                    collateralToken.decimals,
                    collateralPrice
                ) || 0n;
                                                
                // Create complete DecreasePositionAmounts object with ALL required fields
                const decreaseAmounts = {
                    isFullClose: true,
                    sizeDeltaUsd: position.sizeInUsd,
                    sizeDeltaInTokens: position.sizeInTokens,
                    collateralDeltaUsd: collateralDeltaUsd,
                    collateralDeltaAmount: position.collateralAmount,
                    indexPrice: markPrice,
                    collateralPrice: collateralPrice,
                    acceptablePrice: acceptablePrice,
                    acceptablePriceDeltaBps: BigInt(slippageBps),
                    recommendedAcceptablePriceDeltaBps: BigInt(slippageBps),
                    estimatedPnl: 0n,
                    estimatedPnlPercentage: 0n,
                    realizedPnl: 0n,
                    realizedPnlPercentage: 0n,
                    positionFeeUsd: 0n,
                    uiFeeUsd: 0n,
                    swapUiFeeUsd: 0n,
                    feeDiscountUsd: 0n,
                    borrowingFeeUsd: 0n,
                    fundingFeeUsd: 0n,
                    swapProfitFeeUsd: 0n,
                    positionPriceImpactDeltaUsd: 0n,
                    priceImpactDiffUsd: 0n,
                    payedRemainingCollateralAmount: 0n,
                    payedOutputUsd: 0n,
                    payedRemainingCollateralUsd: 0n,
                    receiveTokenAmount: 0n,
                    receiveUsd: 0n,
                    decreaseSwapType: 0, // No swap by default
                };
                
                console.warn('CLOSE_POSITION', 'DecreaseAmounts prepared', { 
                    fieldCount: Object.keys(decreaseAmounts).length,
                    decreaseAmounts 
                });

                const result = await transactionQueue.enqueueWriteTransaction(
                    "close_position", 
                    async () => {
                        return await sdk.orders.createDecreaseOrder({
                            marketsInfoData,
                            tokensData,
                            marketInfo,
                            decreaseAmounts,
                            collateralToken,
                            allowedSlippage: FIXED_SLIPPAGE_BPS,
                            isLong: isLong,
                            referralCode: undefined,
                            isTrigger: false // Market order
                        });
                    }
                ).catch(error => {
                    console.error('CLOSE_POSITION', error, { 
                        stage: 'createDecreaseOrder',
                        direction,
                        decreaseAmounts
                    });
                    let errorMessage = `Failed to close ${direction.toLowerCase()} position`;
                    
                    if (error?.message?.includes("insufficient")) {
                        errorMessage = "Insufficient liquidity or invalid parameters";
                    } else if (error?.message?.includes("slippage")) {
                        errorMessage = "Slippage tolerance exceeded";
                    } else if (error?.message?.includes("fee")) {
                        errorMessage = "Insufficient funds for execution fee";
                    } else if (error?.message) {
                        errorMessage = error.message;
                    }
                    
                    throw new Error(errorMessage);
                });
                               
                // Update memory with fresh data after closing position
                memory = await updateMemoryAfterClose(memory, sdk, gmxDataCache);
                
                memory = {
                    ...memory,
                    currentTask: `📉 Closing ${direction} position`,
                    lastResult: `Fully closed ${direction.toLowerCase()} position in ${marketInfo.name} (100%)`
                };
                
                const successResult = {
                    success: true,
                    message: `Successfully fully closed ${direction.toLowerCase()} position`,
                    closeDetails: {
                        market: marketInfo.name,
                        direction: direction,
                        closeType: 'Full',
                        sizeClosedUsd: formatUsdAmount(position.sizeInUsd, 2),
                        sizeClosedTokens: formatTokenAmount(position.sizeInTokens, indexToken.decimals, 6),
                        collateralReturned: formatTokenAmount(position.collateralAmount, collateralToken.decimals, 6),
                        receiveToken: receiveToken.symbol,
                        closePercentage: `100%`,
                    },
                    transactionHash: result?.transactionHash || null
                };
                
                console.warn('CLOSE_POSITION', 'Position closed successfully', successResult);
                
                return successResult;
            } catch (error) {
                const errorResult = {
                    success: false,
                    error: formatError(error),
                    message: "Failed to close position"
                };
                
                console.error('CLOSE_POSITION', 'Failed to close position', errorResult);                
                return errorResult;
            }
        }
    }),

    // ═══════════════════════════════════════════════════════════════════════════════
    // 💱 TOKEN SWAPS
    // ═══════════════════════════════════════════════════════════════════════════════

    // Swap Tokens
    action({
        name: "swap_tokens",
        description: "Swap tokens using GMX's liquidity pools. Specify EITHER fromAmount (when you know input amount, e.g., swapping X USDC) OR toAmount (when you need exact output amount). For USDC swaps, typically use fromAmount.",
        schema: z.object({
            fromTokenAddress: z.string().describe("ERC20 token address to swap from (e.g. '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' for USDC)"),
            toTokenAddress: z.string().describe("ERC20 token address to receive (e.g. '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' for WETH)"),
            fromAmount: z.string().optional().describe("Amount to swap in BigInt string using token's native decimals (e.g. '1000000' for 1 USDC with 6 decimals). Use this when swapping FROM a stablecoin like USDC."),
            toAmount: z.string().optional().describe("Exact amount to receive in BigInt string using token's native decimals (e.g. '1000000000000000000' for 1 WETH with 18 decimals). Use this when you need exact output amount."),
            triggerPrice: z.string().optional().describe("For limit swaps: price at which to execute swap in BigInt string with 30-decimal precision. Omit for market swaps.")
        }).refine(data => data.fromAmount || data.toAmount, {
            message: "Either fromAmount or toAmount must be specified"
        }),
        async handler(data, ctx, agent) {
            try {
                let memory = ctx.memory as GmxMemory;
                

                const tokensResult = await gmxDataCache.getTokensData().catch(error => {
                    console.error('SWAP_TOKENS', error, { stage: 'getTokensData' });
                    throw new Error(`Failed to get token data: ${error.message || error}`);
                });
                
                const { tokensData } = tokensResult;
                
                if (!tokensData) {
                    console.error('SWAP_TOKENS', 'Invalid token data received');
                    throw new Error("Failed to get token data");
                }

                const fromToken = tokensData[data.fromTokenAddress];
                const toToken = tokensData[data.toTokenAddress];
                
                if (!fromToken) {
                    console.error('SWAP_TOKENS', `From token not found: ${data.fromTokenAddress}`, { availableTokens: Object.keys(tokensData) });
                    throw new Error(`From token not found: ${data.fromTokenAddress}`);
                }
                
                if (!toToken) {
                    console.error('SWAP_TOKENS', `To token not found: ${data.toTokenAddress}`, { availableTokens: Object.keys(tokensData) });
                    throw new Error(`To token not found: ${data.toTokenAddress}`);
                }

                if (fromToken.isSynthetic) {
                    throw new Error(`Synthetic tokens are not supported: ${fromToken.symbol}`);
                }
                if (toToken.isSynthetic) {
                    throw new Error(`Synthetic tokens are not supported: ${toToken.symbol}`);
                }

                const swapParams: any = {
                    fromTokenAddress: data.fromTokenAddress,
                    toTokenAddress: data.toTokenAddress,
                    allowedSlippageBps: FIXED_SLIPPAGE_BPS,
                };

                // Add amount parameter (either fromAmount or toAmount)
                if (data.fromAmount) {
                    swapParams.fromAmount = BigInt(data.fromAmount);
                } else if (data.toAmount) {
                    swapParams.toAmount = BigInt(data.toAmount);
                } else {
                    throw new Error("Either fromAmount or toAmount must be specified");
                }

                if (data.triggerPrice) {
                    swapParams.triggerPrice = BigInt(data.triggerPrice);
                }

                const isLimitOrder = !!data.triggerPrice;
                const orderType = isLimitOrder ? 'Limit' : 'Market';

                const result = await transactionQueue.enqueueWriteTransaction(
                    "swap_tokens",
                    async () => {
                        console.warn('SWAP_TOKENS', 'Executing swap transaction', { 
                            fromToken: fromToken.symbol,
                            toToken: toToken.symbol,
                            orderType,
                            fromAmount: data.fromAmount,
                            toAmount: data.toAmount,
                            triggerPrice: data.triggerPrice ? `$${(Number(data.triggerPrice) / 1e30).toFixed(6)}` : undefined
                        });

                        return await sdk.orders.swap(swapParams).catch(error => {
                            console.error('SWAP_TOKENS', error, { 
                                swapParams,
                                stage: 'sdk.orders.swap',
                                errorInfo: error.info,
                                errorData: error.data,
                                fullError: error
                            });
                            
                            let errorMessage = `Failed to execute swap: ${error.message || error}`;
                            
                            if (error?.message?.includes("insufficient")) {
                                errorMessage = "Insufficient balance for swap";
                            } else if (error?.message?.includes("slippage")) {
                                errorMessage = "Slippage tolerance exceeded - try increasing allowedSlippageBps";
                            } else if (error?.message?.includes("synthetic")) {
                                errorMessage = "Synthetic tokens are not supported for swaps";
                            }
                            
                            throw new Error(errorMessage);
                        });
                    }
                );

                let swapAmountDisplay = '';
                let receiveAmountDisplay = '';
                
                if (data.fromAmount) {
                    swapAmountDisplay = formatTokenAmount(BigInt(data.fromAmount), fromToken.decimals, 6);
                    receiveAmountDisplay = isLimitOrder && data.triggerPrice ? 
                        `~${(Number(data.fromAmount) / Math.pow(10, fromToken.decimals) * Number(data.triggerPrice) / 1e30).toFixed(6)}` :
                        'Market rate';
                } else if (data.toAmount) {
                    receiveAmountDisplay = formatTokenAmount(BigInt(data.toAmount), toToken.decimals, 6);
                    swapAmountDisplay = 'Market rate';
                }

                // Update memory with fresh portfolio data after swap
                memory = await updatePortfolioMemory(memory, gmxDataCache);

                memory = {
                    ...memory,
                    currentTask: `💱 Swapping ${fromToken.symbol} to ${toToken.symbol}`,
                    lastResult: `${orderType} swap initiated: ${swapAmountDisplay} ${fromToken.symbol} → ${receiveAmountDisplay} ${toToken.symbol}`
                };

                const successResult = {
                    success: true,
                    message: `Successfully initiated ${orderType.toLowerCase()} swap`,
                    swapDetails: {
                        orderType: orderType,
                        fromToken: fromToken.symbol,
                        toToken: toToken.symbol,
                        fromAmount: swapAmountDisplay,
                        toAmount: receiveAmountDisplay
                    },
                    transactionHash: result?.transactionHash || null
                };

                console.warn('SWAP_TOKENS', 'Swap initiated successfully', successResult);

                return successResult;
            } catch (error) {
                const errorResult = {
                    success: false,
                    error: formatError(error),
                    message: "Failed to execute token swap"
                };
                
                console.error('SWAP_TOKENS', 'Failed to execute swap', errorResult);
                return errorResult;
            }
        }
    }),

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🛡️ RISK MANAGEMENT - TAKE PROFIT & STOP LOSS
    // ═══════════════════════════════════════════════════════════════════════════════

    // Set Take Profit Order
    action({
        name: "set_take_profit",
        description: "Set a take profit order for an existing position. Creates a LimitDecrease order that executes when price reaches profit target. Specify percentage of position to close (1-100).",
        schema: z.object({
            marketAddress: z.string().describe("Market address of the position (from get_positions response)"),
            triggerPrice: z.string().describe("Price at which to take profit in BigInt string with 30-decimal precision (e.g. '67000000000000000000000000000000000' for $67,000)"),
            percentage: z.number().min(1).max(100).describe("Percentage of position to close (1-100). Use 100 for full position close.")
        }),
        async handler(data, ctx, agent) {
            try {
                let memory = ctx.memory as GmxMemory;
                
                console.warn(`[SET_TAKE_PROFIT] Starting take profit order creation`);

                const marketsResult = await gmxDataCache.getMarketsInfo().catch(error => {
                    console.error('SET_TAKE_PROFIT', error, { stage: 'getMarketsInfo' });
                    throw new Error(`Failed to get market data: ${error.message || error}`);
                });
                const { marketsInfoData, tokensData } = marketsResult;
                
                if (!marketsInfoData || !tokensData) {
                    console.error('SET_TAKE_PROFIT', 'Invalid market data received');
                    throw new Error("Failed to get market and token data");
                }
                
                const positionsInfoResult = await gmxDataCache.getPositionsInfo(marketsInfoData, tokensData);
                
                const position = Object.values(positionsInfoResult).find((pos: any) => 
                    pos.marketAddress === data.marketAddress
                );
                
                const marketInfo = marketsInfoData[data.marketAddress];
                if (!marketInfo) { 
                    console.error('SET_TAKE_PROFIT', `Market not found: ${data.marketAddress}`, { availableMarkets: Object.keys(marketsInfoData) });
                    throw new Error(`Market not found: ${data.marketAddress}. Please use get_positions to find valid market addresses.`);
                }

                if (!position) {
                    throw new Error(`No position found for market address ${data.marketAddress}. Use get_positions to see current positions.`);
                }
                
                const isLong = position.isLong;
                const direction = isLong ? 'LONG' : 'SHORT';
                
                const markPrice = position.markPrice;
                const currentPrice = bigIntToDecimal(markPrice, USD_DECIMALS);
                const triggerPriceDecimal = bigIntToDecimal(BigInt(data.triggerPrice), USD_DECIMALS);
                
                const triggerPriceBigInt = BigInt(data.triggerPrice);
                const currentPriceFormatted = currentPrice.toFixed(2);
                const triggerPriceFormatted = triggerPriceDecimal.toFixed(2);
                
                if (isLong && triggerPriceBigInt <= markPrice) {
                    throw new Error(`Invalid take profit for LONG: price ($${triggerPriceFormatted}) must be higher than current price ($${currentPriceFormatted})`);
                }
                if (!isLong && triggerPriceBigInt >= markPrice) {
                    throw new Error(`Invalid take profit for SHORT: price ($${triggerPriceFormatted}) must be lower than current price ($${currentPriceFormatted})`);
                }
                
                const priceDiff = Math.abs(triggerPriceDecimal - currentPrice);
                const minDistance = currentPrice * 0.001; // 0.1%
                if (priceDiff < minDistance) {
                    throw new Error(`Take profit price too close to current price. Minimum distance: 0.1% (at least $${minDistance.toFixed(2)} from current $${currentPriceFormatted})`);
                }
                
                // Calculate position size to close based on percentage
                const positionSizeUsd = data.percentage === 100 ? 
                    position.sizeInUsd : 
                    (position.sizeInUsd * BigInt(data.percentage)) / 100n;
                
                // Get collateral token
                const collateralToken = tokensData[position.collateralTokenAddress];
                if (!collateralToken) {
                    throw new Error("Failed to get collateral token data");
                }
                
                // Create comprehensive DecreaseAmounts object for take profit
                const decreaseAmounts = {
                    // Core position data
                    isFullClose: data.percentage === 100,
                    sizeDeltaUsd: positionSizeUsd,
                    sizeDeltaInTokens: data.percentage === 100 ?
                        position.sizeInTokens :
                        (position.sizeInTokens * BigInt(data.percentage)) / 100n,
                    collateralDeltaUsd: 0n, // Let SDK calculate
                    collateralDeltaAmount: 0n, // Let SDK calculate
                    indexPrice: position.markPrice || 0n,
                    collateralPrice: collateralToken.prices?.minPrice || 0n,
                    triggerPrice: BigInt(data.triggerPrice),
                    acceptablePrice: isLong ? 
                        BigInt(data.triggerPrice) - (BigInt(data.triggerPrice) * BigInt(FIXED_PRICE_IMPACT_BPS) / 10000n) :
                        BigInt(data.triggerPrice) + (BigInt(data.triggerPrice) * BigInt(FIXED_PRICE_IMPACT_BPS) / 10000n),
                    acceptablePriceDeltaBps: BigInt(FIXED_SLIPPAGE_BPS),
                    recommendedAcceptablePriceDeltaBps: BigInt(FIXED_SLIPPAGE_BPS),
                    estimatedPnl: 0n,
                    estimatedPnlPercentage: 0n,
                    realizedPnl: 0n,
                    realizedPnlPercentage: 0n,
                    positionFeeUsd: 0n,
                    uiFeeUsd: 0n,
                    swapUiFeeUsd: 0n,
                    feeDiscountUsd: 0n,
                    borrowingFeeUsd: 0n,
                    fundingFeeUsd: 0n,
                    swapProfitFeeUsd: 0n,
                    positionPriceImpactDeltaUsd: 0n,
                    priceImpactDiffUsd: 0n,
                    payedRemainingCollateralAmount: 0n,
                    payedOutputUsd: 0n,
                    payedRemainingCollateralUsd: 0n,
                    receiveTokenAmount: 0n,
                    receiveUsd: 0n,
                    triggerOrderType: 5, // LimitDecrease
                    decreaseSwapType: 0, // NoSwap
                };
                
                console.warn('SET_TAKE_PROFIT', 'Creating take profit order', { 
                    direction,
                    triggerPrice: triggerPriceDecimal,
                    currentPrice,
                    positionSize: formatUsdAmount(positionSizeUsd, 2)
                });
                
                const result = await transactionQueue.enqueueWriteTransaction(
                    "set_take_profit",
                    async () => {                        
                        return await sdk.orders.createDecreaseOrder({
                            marketsInfoData,
                            tokensData,
                            marketInfo,
                            decreaseAmounts,
                            collateralToken,
                            allowedSlippage: FIXED_SLIPPAGE_BPS,
                            isLong: isLong,
                            referralCode: undefined,
                            isTrigger: true // This is a trigger order
                        }).catch(error => {
                            console.error('SET_TAKE_PROFIT', error, { 
                                direction,
                                triggerPrice: triggerPriceDecimal,
                                decreaseAmounts 
                            });
                            throw new Error(`Failed to create take profit order: ${error.message || error}`);
                        });
                    }
                );
                
                // Update memory with fresh order data after setting take profit
                memory = await updateOrdersMemory(memory, sdk, gmxDataCache);
                
                memory = {
                    ...memory,
                    currentTask: `🎯 Setting take profit for ${direction} position`,
                    lastResult: `Take profit set at $${triggerPriceDecimal.toFixed(2)} for ${direction} position in ${marketInfo.name}`
                };
                
                const successResult = {
                    success: true,
                    message: `Successfully set take profit order for ${direction} position`,
                    orderDetails: {
                        market: marketInfo.name,
                        direction: direction,
                        orderType: 'Take Profit (LimitDecrease)',
                        triggerPrice: `$${triggerPriceDecimal.toFixed(2)}`,
                        currentPrice: `$${currentPrice.toFixed(2)}`,
                        percentage: `${data.percentage}%`,
                        sizeDeltaUsd: formatUsdAmount(positionSizeUsd, 2),
                        profitTarget: isLong ? 
                            `+${((triggerPriceDecimal - currentPrice) / currentPrice * 100).toFixed(2)}%` :
                            `+${((currentPrice - triggerPriceDecimal) / currentPrice * 100).toFixed(2)}%`,
                    },
                    transactionHash: result?.transactionHash || null
                };
                
                console.warn('SET_TAKE_PROFIT', 'Take profit order created successfully', successResult);
                
                return successResult;
            } catch (error) {
                const errorResult = {
                    success: false,
                    error: formatError(error),
                    message: "Failed to set take profit order"
                };
                
                console.error('SET_TAKE_PROFIT', 'Failed to set take profit', errorResult);
                return errorResult;
            }
        }
    }),

    // Set Stop Loss Order
    action({
        name: "set_stop_loss",
        description: "Set a stop loss order for an existing position. Creates a StopLossDecrease order that executes when price reaches stop loss level. Specify percentage of position to close (1-100).",
        schema: z.object({
            marketAddress: z.string().describe("Market address of the position (from get_positions response)"),
            triggerPrice: z.string().describe("Price at which to stop loss in BigInt string with 30-decimal precision (e.g. '63000000000000000000000000000000000' for $63,000)"),
            percentage: z.number().min(1).max(100).describe("Percentage of position to close (1-100). Use 100 for full position close.")
        }),
        async handler(data, ctx, agent) {
            try {
                let memory = ctx.memory as GmxMemory;
                
                console.warn(`[SET_STOP_LOSS] Starting stop loss order creation`);

                const marketsResult = await gmxDataCache.getMarketsInfo().catch(error => {
                    console.error('SET_STOP_LOSS', error, { stage: 'getMarketsInfo' });
                    throw new Error(`Failed to get market data: ${error.message || error}`);
                });
                const { marketsInfoData, tokensData } = marketsResult;
                
                if (!marketsInfoData || !tokensData) {
                    console.error('SET_STOP_LOSS', 'Invalid market data received');
                    throw new Error("Failed to get market and token data");
                }
                
                const positionsInfoResult = await gmxDataCache.getPositionsInfo(marketsInfoData, tokensData);
                
                const position = Object.values(positionsInfoResult).find((pos: any) => 
                    pos.marketAddress === data.marketAddress
                );

                const marketInfo = marketsInfoData[data.marketAddress];
                if (!marketInfo) { 
                    console.error('SET_STOP_LOSS', `Market not found: ${data.marketAddress}`, { availableMarkets: Object.keys(marketsInfoData) });
                    throw new Error(`Market not found: ${data.marketAddress}. Please use get_positions to find valid market addresses.`);
                }
                
                if (!position) {
                    throw new Error(`No position found for market address ${data.marketAddress}. Use get_positions to see current positions.`);
                }
                
                const isLong = position.isLong;
                const direction = isLong ? 'LONG' : 'SHORT';
                
                const markPrice = position.markPrice;
                const currentPrice = bigIntToDecimal(markPrice, USD_DECIMALS);
                const triggerPriceDecimal = bigIntToDecimal(BigInt(data.triggerPrice), USD_DECIMALS);
                
                const triggerPriceBigInt = BigInt(data.triggerPrice);
                const currentPriceFormatted = currentPrice.toFixed(2);
                const triggerPriceFormatted = triggerPriceDecimal.toFixed(2);
                
                if (isLong && triggerPriceBigInt >= markPrice) {
                    throw new Error(`Invalid stop loss for LONG: price ($${triggerPriceFormatted}) must be lower than current price ($${currentPriceFormatted})`);
                }
                if (!isLong && triggerPriceBigInt <= markPrice) {
                    throw new Error(`Invalid stop loss for SHORT: price ($${triggerPriceFormatted}) must be higher than current price ($${currentPriceFormatted})`);
                }
                
                const priceDiff = Math.abs(triggerPriceDecimal - currentPrice);
                const minDistance = currentPrice * 0.001; // 0.1%
                if (priceDiff < minDistance) {
                    throw new Error(`Stop loss price too close to current price. Minimum distance: 0.1% (at least $${minDistance.toFixed(2)} from current $${currentPriceFormatted})`);
                }
                
                console.warn('SET_STOP_LOSS', 'Position and price data retrieved', {
                    market: marketInfo.name,
                    direction,
                    currentPrice: `$${currentPrice.toFixed(2)}`,
                    triggerPrice: `$${triggerPriceDecimal.toFixed(2)}`,
                    positionSize: formatUsdAmount(position.sizeInUsd, 2)
                });
                
                // Calculate position size to close based on percentage
                const positionSizeUsd = data.percentage === 100 ? 
                    position.sizeInUsd : 
                    (position.sizeInUsd * BigInt(data.percentage)) / 100n;
                
                // Get collateral token
                const collateralToken = tokensData[position.collateralTokenAddress];
                if (!collateralToken) {
                    throw new Error("Failed to get collateral token data");
                }
                
                // Create comprehensive DecreaseAmounts object for stop loss
                const decreaseAmounts = {
                    isFullClose: data.percentage === 100,
                    sizeDeltaUsd: positionSizeUsd,
                    sizeDeltaInTokens: data.percentage === 100 ?
                        position.sizeInTokens :
                        (position.sizeInTokens * BigInt(data.percentage)) / 100n,
                    collateralDeltaUsd: 0n, // Let SDK calculate
                    collateralDeltaAmount: 0n, // Let SDK calculate
                    indexPrice: position.markPrice || 0n,
                    collateralPrice: collateralToken.prices?.minPrice || 0n,
                    triggerPrice: BigInt(data.triggerPrice),
                    acceptablePrice: isLong ? 
                        BigInt(data.triggerPrice) - (BigInt(data.triggerPrice) * BigInt(FIXED_PRICE_IMPACT_BPS) / 10000n) :
                        BigInt(data.triggerPrice) + (BigInt(data.triggerPrice) * BigInt(FIXED_PRICE_IMPACT_BPS) / 10000n),
                    acceptablePriceDeltaBps: BigInt(FIXED_SLIPPAGE_BPS),
                    recommendedAcceptablePriceDeltaBps: BigInt(FIXED_SLIPPAGE_BPS),
                    estimatedPnl: 0n,
                    estimatedPnlPercentage: 0n,
                    realizedPnl: 0n,
                    realizedPnlPercentage: 0n,
                    positionFeeUsd: 0n,
                    uiFeeUsd: 0n,
                    swapUiFeeUsd: 0n,
                    feeDiscountUsd: 0n,
                    borrowingFeeUsd: 0n,
                    fundingFeeUsd: 0n,
                    swapProfitFeeUsd: 0n,
                    positionPriceImpactDeltaUsd: 0n,
                    priceImpactDiffUsd: 0n,
                    payedRemainingCollateralAmount: 0n,
                    payedOutputUsd: 0n,
                    payedRemainingCollateralUsd: 0n,
                    receiveTokenAmount: 0n,
                    receiveUsd: 0n,
                    triggerOrderType: 6, // StopLossDecrease
                    decreaseSwapType: 0, // NoSwap
                };

                const result = await transactionQueue.enqueueWriteTransaction(
                    "set_stop_loss",
                    async () => {
                        return await sdk.orders.createDecreaseOrder({
                            marketsInfoData,
                            tokensData,
                            marketInfo,
                            decreaseAmounts,
                            collateralToken,
                            allowedSlippage: FIXED_SLIPPAGE_BPS,
                            isLong: isLong,
                            referralCode: undefined,
                            isTrigger: true // This is a trigger order
                        }).catch(error => {
                            console.error('SET_STOP_LOSS', error, { 
                                direction,
                                triggerPrice: triggerPriceDecimal,
                                decreaseAmounts 
                            });
                            throw new Error(`Failed to create stop loss order: ${error.message || error}`);
                        });
                    }
                );
                
                // Update memory with fresh order data after setting stop loss
                memory = await updateOrdersMemory(memory, sdk, gmxDataCache);
                
                memory = {
                    ...memory,
                    currentTask: `🛡️ Setting stop loss for ${direction} position`,
                    lastResult: `Stop loss set at $${triggerPriceDecimal.toFixed(2)} for ${direction} position in ${marketInfo.name}`
                };
                
                const successResult = {
                    success: true,
                    message: `Successfully set stop loss order for ${direction} position`,
                    orderDetails: {
                        market: marketInfo.name,
                        direction: direction,
                        orderType: 'Stop Loss (StopLossDecrease)',
                        triggerPrice: `$${triggerPriceDecimal.toFixed(2)}`,
                        currentPrice: `$${currentPrice.toFixed(2)}`,
                        percentage: `${data.percentage}%`,
                        sizeDeltaUsd: formatUsdAmount(positionSizeUsd, 2),
                        maxLoss: isLong ? 
                            `-${((currentPrice - triggerPriceDecimal) / currentPrice * 100).toFixed(2)}%` :
                            `-${((triggerPriceDecimal - currentPrice) / currentPrice * 100).toFixed(2)}%`,
                    },
                    transactionHash: result?.transactionHash || null
                };
                
                console.warn('SET_STOP_LOSS', 'Stop loss order created successfully', successResult);
                
                return successResult;
            } catch (error) {
                const errorResult = {
                    success: false,
                    error: formatError(error),
                    message: "Failed to set stop loss order"
                };
                
                console.error('SET_STOP_LOSS', 'Failed to set stop loss', errorResult);
                return errorResult;
            }
        }
    }),
];
}