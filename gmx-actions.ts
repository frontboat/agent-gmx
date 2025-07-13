// ═══════════════════════════════════════════════════════════════════════════════
// 📦 GMX ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

import { action } from "@daydreamsai/core";
import { z } from "zod/v4";
import type { GmxSdk } from "@gmx-io/sdk";
import type { GmxMemory } from './gmx-types';
import { 
    USD_DECIMALS, 
    bigIntToDecimal, 
    formatTokenAmount, 
    formatUsdAmount,
    convertToUsd,
    sleep
} from './gmx-utils';
import { get_portfolio_balance_str, get_positions_str, get_btc_eth_markets_str, get_tokens_data_str, get_daily_volumes_str, get_orders_str, get_synth_predictions_consolidated_str, get_technical_analysis_str, get_trading_history_str } from './gmx-queries';
import { EnhancedDataCache } from './gmx-cache';

export function createGmxActions(sdk: GmxSdk, gmxDataCache?: EnhancedDataCache) {
    return [
    // ═══════════════════════════════════════════════════════════════════════════════
    // 📈 READ METHODS - MARKET DATA
    // ═══════════════════════════════════════════════════════════════════════════════
    
    // BTC/ETH Markets Info - Focused on trading markets
    action({
        name: "get_btc_eth_markets",
        description: "Get detailed information about BTC and ETH markets optimized for trading - includes prices, liquidity, funding rates, and market addresses for trading",
        async handler(data, ctx, agent) {
            console.log('[Action] Starting get_btc_eth_markets action');
            try {
                let memory = ctx.memory as GmxMemory;
                
                console.log('[Action] Fetching BTC/ETH markets data');
                // Use the formatted string function from queries
                const marketsString = await get_btc_eth_markets_str(sdk, gmxDataCache);
                console.log(`[Action] Successfully fetched markets data (${marketsString.length} chars)`);
                
                // Update memory
                memory = {
                    ...memory,
                    markets: marketsString,
                    currentTask: "📊 Fetching BTC/ETH market data for trading",
                    lastResult: "Retrieved focused BTC/ETH market information"
                };

                return {
                    success: true,
                    message: "Successfully retrieved BTC/ETH markets data",
                    formattedData: marketsString
                };
            } catch (error) {
                console.error('[Action] get_btc_eth_markets error:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to fetch BTC/ETH markets data"
                };
            }
        }
    }),

    // Daily Volumes - BTC/ETH focused
    action({
        name: "get_daily_volumes",
        description: "Get daily volume data for BTC and ETH markets - filtered for trading focus",
        async handler(data, ctx, agent) {
            console.log('[action] Starting get_daily_volumes action');
            try {
                let memory = ctx.memory as GmxMemory;
                
                console.log('[action] Fetching daily volumes data');
                // Use the formatted string function from queries
                const volumesString = await get_daily_volumes_str(sdk, gmxDataCache);
                console.log(`[action] Successfully fetched volumes data (dataLength: volumesString.length)`);
                
                // Update memory
                memory = {
                    ...memory,
                    volumes: volumesString,
                    currentTask: "📊 Analyzing BTC/ETH volume for liquidity conditions",
                    lastResult: "Retrieved daily volumes for BTC/ETH markets"
                };
                
                return {
                    success: true,
                    message: "Successfully retrieved BTC/ETH daily volumes",
                    formattedData: volumesString
                };
            } catch (error) {
                console.error('[action] error:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to fetch daily volumes"
                };
            }
        }
    }),

    // Tokens Data - BTC/ETH/USD focused
    action({
        name: "get_tokens_data",
        description: "Get token data filtered for BTC/ETH/USD tokens - includes balances, prices, and addresses",
        async handler(data, ctx, agent) {
            console.log('[action] Starting get_tokens_data action');
            try {
                let memory = ctx.memory as GmxMemory;
                
                console.log('[action] Fetching tokens data');
                // Use the formatted string function from queries
                const tokensString = await get_tokens_data_str(sdk, gmxDataCache);
                console.log(`[action] Successfully fetched tokens data (dataLength: tokensString.length)`);
                
                // Update memory
                memory = {
                    ...memory,
                    tokens: tokensString,
                    currentTask: "🪙 Fetching BTC/ETH/USD token data",
                    lastResult: "Retrieved filtered token information"
                };
                
                return {
                    success: true,
                    message: "Successfully retrieved BTC/ETH/USD tokens data",
                    formattedData: tokensString
                };
            } catch (error) {
                console.error('[action] error:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to fetch tokens data"
                };
            }
        }
    }),

    // Portfolio Balance Query
    action({
        name: "get_portfolio_balance",
        description: "Get comprehensive portfolio balance including token balances, position values, and total portfolio worth. No parameters required - uses SDK account context automatically.",
        async handler(data, ctx, agent) {
            console.log('[action] Starting get_portfolio_balance action');
            try {
                let memory = ctx.memory as GmxMemory;
                
                console.log('[action] Fetching portfolio balance');
                // Use the formatted string function from queries
                const portfolioString = await get_portfolio_balance_str(sdk, gmxDataCache);
                console.log(`[action] Successfully fetched portfolio balance (dataLength: portfolioString.length)`);
                
                // Extract portfolio information from formatted string for memory
                const totalValueMatch = portfolioString.match(/Total Value: \$([0-9.,]+)/);
                const totalValue = totalValueMatch ? parseFloat(totalValueMatch[1].replace(/,/g, '')) : 0;
                
                memory = {
                    ...memory,
                    portfolioBalance: portfolioString,
                    currentTask: "💰 Portfolio balance retrieved successfully",
                    lastResult: `Total portfolio value: $${totalValue.toFixed(2)}`
                };
                
                return {
                    success: true,
                    message: "Portfolio balance retrieved successfully",
                    formattedData: portfolioString
                };
            } catch (error) {
                console.error('[action] error:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to get portfolio balance"
                };
            }
        }
    }),

    // Enhanced Positions with Complete Calculations
    action({
        name: "get_positions",
        description: "Get all current trading positions with comprehensive PnL, liquidation price, and risk metrics calculations",
        async handler(data, ctx, agent) {
            console.log('[action] Starting get_positions action');
            try {                
                console.log('[action] Waiting 3 seconds before fetching positions');
                await sleep(3000);

                console.log('[action] Fetching positions data');
                // Use the formatted string function from queries
                const positionsString = await get_positions_str(sdk, gmxDataCache);
                console.log(`[action] Successfully fetched positions (dataLength: positionsString.length)`);

                let memory = ctx.memory as GmxMemory;
                
                // Update memory
                memory = {
                    ...memory,
                    positions: positionsString,
                    currentTask: "📈 Positions retrieved successfully",
                    lastResult: "Current positions analyzed"
                };
                
                return {
                    success: true,
                    message: "Positions retrieved successfully",
                    formattedData: positionsString
                };
            } catch (error) {
                console.error('[action] error:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to get positions"
                };
            }
        }
    }),

    // ═══════════════════════════════════════════════════════════════════════════════
    // 💹 POSITIONS & TRADES
    // ═══════════════════════════════════════════════════════════════════════════════

    // Orders (Official SDK Method) - Enhanced with Comprehensive Calculations
    action({
        name: "get_orders",
        description: "Get all pending orders with comprehensive analysis including PnL calculations, risk metrics, and market context",
        async handler(data, ctx, agent) {
            console.log('[action] Starting get_orders action');
            try {
                console.log('[action] Waiting 3 seconds before fetching orders');
                await sleep(3000);

                console.log('[action] Fetching orders data');
                // Get formatted orders string using the query function
                const ordersString = await get_orders_str(sdk, gmxDataCache);
                console.log(`[action] Successfully fetched orders (dataLength: ordersString.length)`);
                
                let memory = ctx.memory as GmxMemory;
                
                // Update memory with the result
                memory = {
                    ...memory,
                    orders: ordersString,
                    currentTask: "📋 Reviewing pending orders",
                    lastResult: ordersString
                };
                
                return {
                    success: true,
                    message: ordersString,
                    ordersString: ordersString
                };
            } catch (error) {
                console.error('[action] error:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to fetch orders"
                };
            }
        }
    }),

    // Trading History - Comprehensive performance analysis
    action({
        name: "get_trading_history",
        description: "Get comprehensive trading history analysis including performance metrics, win rates, profit factors, and recent trades. Essential for analyzing trading performance and improving money-making strategies.",
        async handler(data, ctx, agent) {
            console.log('[action] Starting get_trading_history action');
            try {
                let memory = ctx.memory as GmxMemory;
                
                console.log('[action] Fetching trading history data');
                // Use the formatted string function from queries
                const historyString = await get_trading_history_str(sdk, gmxDataCache);
                console.log(`[action] Successfully fetched trading history data (dataLength: historyString.length)`);
                
                // Update memory with trading history insights
                memory = {
                    ...memory,
                    tradingHistory: historyString,
                    currentTask: "📊 Analyzing trading history for performance insights",
                    lastResult: "Retrieved comprehensive trading history and performance metrics"
                };

                return {
                    success: true,
                    message: "Successfully retrieved trading history analysis",
                    formattedData: historyString
                };
            } catch (error) {
                console.error('[action] error:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to fetch trading history"
                };
            }
        }
    }),


    // ═══════════════════════════════════════════════════════════════════════════════
    // 🧠 SYNTH MARKET INTELLIGENCE & PREDICTIONS
    // ═══════════════════════════════════════════════════════════════════════════════

    // Get BTC Predictions - Consolidated from top miners
    action({
        name: "get_synth_btc_predictions",
        description: "Get consolidated BTC price predictions from top-performing Synth miners",
        async handler(data, ctx, agent) {
            console.log('[action] Starting get_synth_btc_predictions action');
            try {
                console.log('[action] Fetching BTC predictions from Synth');
                const result = await get_synth_predictions_consolidated_str('BTC', gmxDataCache);
                console.log(`[action] Successfully fetched BTC predictions (dataLength: result.length)`);
                
                let memory = ctx.memory as GmxMemory;
                
                // Update memory with prediction data
                memory = {
                    ...memory,
                    synthBtcPredictions: result,
                    currentTask: "🤖 Analyzing BTC predictions from top AI miners",
                    lastResult: "Retrieved consolidated BTC predictions from top Synth miners"
                };

                return {
                    success: true,
                    message: "Retrieved consolidated BTC predictions from top Synth miners",
                    synthBtcPredictions: result
                };
            } catch (error) {
                console.error('[action] error:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to fetch BTC predictions from Synth"
                };
            }
        }
    }),

    // Get ETH Predictions - Consolidated from top miners
    action({
        name: "get_synth_eth_predictions",
        description: "Get consolidated ETH price predictions from top-performing Synth miners (rank > 0.08 and top CRPS scorer)",
        async handler(data, ctx, agent) {
            console.log('[action] Starting get_synth_eth_predictions action');
            try {
                console.log('[action] Fetching ETH predictions from Synth');
                const result = await get_synth_predictions_consolidated_str('ETH', gmxDataCache);
                console.log(`[action] Successfully fetched ETH predictions (dataLength: result.length)`);
                
                let memory = ctx.memory as GmxMemory;
                
                // Update memory with prediction data
                memory = {
                    ...memory,
                    synthEthPredictions: result,
                    currentTask: "🤖 Analyzing ETH predictions from top AI miners",
                    lastResult: "Retrieved consolidated ETH predictions from top Synth miners"
                };

                return {
                    success: true,
                    message: "Retrieved consolidated ETH predictions from top Synth miners",
                    synthEthPredictions: result
                };
            } catch (error) {
                console.error('[action] error:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to fetch ETH predictions from Synth"
                };
            }
        }
    }),

    // Get BTC Technical Analysis - Multi-timeframe indicators
    action({
        name: "get_btc_technical_analysis",
        description: "Get comprehensive BTC technical indicators across multiple timeframes (15m, 1h, 4h). Returns raw indicator data including moving averages, RSI, MACD, Bollinger Bands, ATR, Stochastic, and support/resistance levels for BTC analysis.",
        async handler(data, ctx, agent) {
            console.log('[action] Starting get_btc_technical_analysis action');
            try {
                let memory = ctx.memory as GmxMemory;
                              
                console.log('[action] Fetching BTC technical analysis');
                // Get BTC technical analysis data
                const technicalData = await get_technical_analysis_str(sdk, 'BTC', gmxDataCache);
                console.log(`[action] Successfully fetched BTC technical analysis (dataLength: technicalData.length)`);
                
                // Update memory with technical analysis
                memory = {
                    ...memory,
                    btcTechnicalAnalysis: technicalData,
                    currentTask: "📊 Analyzing BTC technical indicators",
                    lastResult: "Retrieved BTC technical indicators across 4 timeframes"
                };
                
                return {
                    success: true,
                    message: "Successfully retrieved BTC technical indicators",
                    btcTechnicalAnalysis: technicalData,
                };
            } catch (error) {
                console.error('[action] error:', error);
                const errorResult = {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to fetch BTC technical analysis"
                };
                
                return errorResult;
            }
        }
    }),

    // Get ETH Technical Analysis - Multi-timeframe indicators
    action({
        name: "get_eth_technical_analysis",
        description: "Get comprehensive ETH technical indicators across multiple timeframes (15m, 1h, 4h). Returns raw indicator data including moving averages, RSI, MACD, Bollinger Bands, ATR, Stochastic, and support/resistance levels for ETH analysis.",
        async handler(data, ctx, agent) {
            console.log('[action] Starting get_eth_technical_analysis action');
            try {
                let memory = ctx.memory as GmxMemory;
                
                console.log('[action] Fetching ETH technical analysis');
                // Get ETH technical analysis data
                const technicalData = await get_technical_analysis_str(sdk, 'ETH', gmxDataCache);
                console.log(`[action] Successfully fetched ETH technical analysis (dataLength: technicalData.length)`);
                
                // Update memory with technical analysis
                memory = {
                    ...memory,
                    ethTechnicalAnalysis: technicalData,
                    currentTask: "📊 Analyzing ETH technical indicators",
                    lastResult: "Retrieved ETH technical indicators across 4 timeframes"
                };
                                
                return {
                    success: true,
                    message: "Successfully retrieved ETH technical indicators",
                    ethTechnicalAnalysis: technicalData
                };
            } catch (error) {
                console.error('[action] error:', error);
                const errorResult = {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to fetch ETH technical analysis"
                };

                return errorResult;
            }
        }
    }),

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
                console.log(`[CANCEL_ORDERS] Starting order cancellation (input: data)`);
                
                sleep(3000);
                // Wait 3 seconds before write operation to prevent nonce errors
                console.log('[CANCEL_ORDERS] Waiting 3 seconds before transaction');
                console.log(`[CANCEL_ORDERS] Executing cancel orders transaction (orderKeys: data.orderKeys)`);
                
                // Use SDK's internal cancelOrders method (no manual wallet client needed)
                const result = await sdk.orders.cancelOrders(data.orderKeys);

                console.log('CANCEL_ORDERS', 'Transaction successful', { 
                    transactionHash: result?.transactionHash || result?.hash,
                    orderCount: data.orderKeys.length 
                });
                
                // Invalidate position and order caches after successful trade
                if (gmxDataCache) {
                    gmxDataCache.invalidatePositions();
                }

                let memory = ctx.memory as GmxMemory;
                
                // Update memory with cancellation info
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
                
                console.log('CANCEL_ORDERS', 'Order cancellation completed successfully', successResult);
                
                return successResult;
            } catch (error) {
                const errorResult = {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
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
                allowedSlippageBps: z.number().optional().default(125).describe("Allowed slippage in basis points (100 = 1%, range: 50-500, default: 125)"),
                leverage: z.string().optional().describe("Leverage in basis points as BigInt string (e.g. '50000' = 5x, '10000' = 1x, '200000' = 20x). Optional for helper function."),
            }),
            async handler(data, ctx, agent) {
                try {
                    console.log(`[OPEN_LONG_MARKET] Starting long market order (input: data)`);
                    
                    // Get market and token data for proper fee calculation
                    const marketsResult = gmxDataCache ? await gmxDataCache.getMarketsInfo() : await sdk.markets.getMarketsInfo().catch(error => {
                        const errorMsg = `Failed to get market data: ${error.message || error}`;
                        console.error('OPEN_LONG_MARKET', error, { stage: 'getMarketsInfo' });
                        throw new Error(errorMsg);
                    });
                    const { marketsInfoData, tokensData } = marketsResult;
                    
                    if (!marketsInfoData || !tokensData) {
                        console.error('OPEN_LONG_MARKET', 'Invalid market data received', { marketsInfoData: !!marketsInfoData, tokensData: !!tokensData });
                        throw new Error("Invalid market data received");
                    }
                    
                    // Validate market exists
                    const marketInfo = marketsInfoData[data.marketAddress];
                    if (!marketInfo) {
                        console.error('OPEN_LONG_MARKET', `Market not found: ${data.marketAddress}`, { availableMarkets: Object.keys(marketsInfoData) });
                        throw new Error(`Market not found: ${data.marketAddress}`);
                    }
                    
                    console.log(`[OPEN_LONG_MARKET] Market validated (marketName: marketInfo.name, marketAddress: data.marketAddress)`);
                    
                    // Validate tokens exist
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
                    
                    console.log('OPEN_LONG_MARKET', 'Tokens validated', { 
                        payToken: payToken.symbol, 
                        collateralToken: collateralToken.symbol 
                    });
                    
                    // Prepare parameters for helper function
                    const helperParams: any = {
                        payAmount: BigInt(data.payAmount),
                        marketAddress: data.marketAddress,
                        payTokenAddress: data.payTokenAddress,
                        collateralTokenAddress: data.collateralTokenAddress,
                        allowedSlippageBps: data.allowedSlippageBps || 125,
                    };
    
                    // Add optional parameters (SDK expects BigInt objects)
                    if (data.leverage) {
                        helperParams.leverage = BigInt(data.leverage);
                    }
                    
                    console.log('OPEN_LONG_MARKET', 'Helper params prepared', helperParams);
    
                    // Wait 3 seconds before write operation to prevent nonce errors
                    console.log('[OPEN_LONG_MARKET] Waiting 2 seconds before transaction');
                    await sleep(2000);
                    
                    console.log('OPEN_LONG_MARKET', 'Executing long market order transaction', { 
                        marketAddress: data.marketAddress,
                        payAmount: data.payAmount,
                        leverage: data.leverage ? `${parseFloat(data.leverage) / 10000}x` : 'Auto'
                    });
    
                    // Use the simplified helper function with enhanced error handling
                    const result = await sdk.orders.long(helperParams).catch(error => {
                        console.error('OPEN_LONG_MARKET', error, { 
                            helperParams, 
                            stage: 'sdk.orders.long',
                            errorInfo: error.info,
                            errorData: error.data,
                            fullError: error
                        });
                        throw new Error(`Failed to open long position: ${error.message || error}`);
                    });
    
                    let memory = ctx.memory as GmxMemory;
                    
                    // Update memory with order info
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
                            slippage: `${(data.allowedSlippageBps || 125) / 100}%`
                        },
                        transactionHash: result?.transactionHash || null
                    };
                    
                    console.log('OPEN_LONG_MARKET', 'Long market order opened successfully', successResult);
                    
                    // Invalidate position and order caches after successful trade
                    if (gmxDataCache) {
                        gmxDataCache.invalidatePositions();
                    }
                    
                    return successResult;
                } catch (error) {
                    const errorResult = {
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
                        message: "Failed to open long position"
                    };
                    
                    console.error('OPEN_LONG_MARKET', 'Failed to open long market order', errorResult);
                    
                    return errorResult;
                }
            }
        }),

        // Open Long Limit Order (Execute at Specific Price)
        action({
            name: "open_long_limit",
            description: "Open a long position with a limit order (executes when price reaches or goes below your specified limit price).",
            schema: z.object({
                marketAddress: z.string().describe("Market token address from getMarketsInfo response (e.g. '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336' for ETH/USD market)"),
                payAmount: z.string().describe("Amount to pay in BigInt string format using token's native decimals (e.g. '1000000' for 1 USDC with 6 decimals). Use this for collateral-based position sizing."),
                payTokenAddress: z.string().describe("ERC20 token contract address you're paying with (e.g. '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' for USDC)"),
                collateralTokenAddress: z.string().describe("ERC20 token contract address for collateral (e.g. '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' for WETH)"),
                limitPrice: z.string().describe("Limit price for the order in BigInt string with 30-decimal precision (e.g. '65000000000000000000000000000000000' for $65,000). Order executes when market price reaches this level or better."),
                allowedSlippageBps: z.number().optional().default(125).describe("Allowed slippage in basis points (100 = 1%, range: 50-500, default: 125)"),
                leverage: z.string().optional().describe("Leverage in basis points as BigInt string (e.g. '50000' = 5x, '10000' = 1x, '200000' = 20x). Optional for helper function."),
            }),
            async handler(data, ctx, agent) {
                try {
                    console.log(`[OPEN_LONG_LIMIT] Starting long limit order (input: data)`);
                    
                    // Get market and token data for proper fee calculation
                    const marketsResult = gmxDataCache ? await gmxDataCache.getMarketsInfo() : await sdk.markets.getMarketsInfo().catch(error => {
                        const errorMsg = `Failed to get market data: ${error.message || error}`;
                        console.error('OPEN_LONG_LIMIT', error, { stage: 'getMarketsInfo' });
                        throw new Error(errorMsg);
                    });
                    const { marketsInfoData, tokensData } = marketsResult;
                    
                    if (!marketsInfoData || !tokensData) {
                        console.error('OPEN_LONG_LIMIT', 'Invalid market data received', { marketsInfoData: !!marketsInfoData, tokensData: !!tokensData });
                        throw new Error("Invalid market data received");
                    }
                    
                    // Validate market exists
                    const marketInfo = marketsInfoData[data.marketAddress];
                    if (!marketInfo) {
                        console.error('OPEN_LONG_LIMIT', `Market not found: ${data.marketAddress}`, { availableMarkets: Object.keys(marketsInfoData) });
                        throw new Error(`Market not found: ${data.marketAddress}`);
                    }
                    
                    console.log(`[OPEN_LONG_LIMIT] Market validated (marketName: marketInfo.name, marketAddress: data.marketAddress)`);
                    
                    // Validate tokens exist
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
                    
                    console.log('OPEN_LONG_LIMIT', 'Tokens validated', { 
                        payToken: payToken.symbol, 
                        collateralToken: collateralToken.symbol 
                    });
                    
                    // Prepare parameters for helper function
                    const helperParams: any = {
                        payAmount: BigInt(data.payAmount),
                        marketAddress: data.marketAddress,
                        payTokenAddress: data.payTokenAddress,
                        collateralTokenAddress: data.collateralTokenAddress,
                        allowedSlippageBps: data.allowedSlippageBps || 125,
                        limitPrice: BigInt(data.limitPrice) // Always include limit price for limit orders
                    };
    
                    // Add optional parameters (SDK expects BigInt objects)
                    if (data.leverage) {
                        helperParams.leverage = BigInt(data.leverage);
                    }
    
                    console.log('OPEN_LONG_LIMIT', 'Helper params prepared', helperParams);
    
                    // Wait 2 seconds before write operation to prevent nonce errors
                    console.log('[OPEN_LONG_LIMIT] Waiting 2 seconds before transaction');
                    await sleep(2000);
                    
                    console.log('OPEN_LONG_LIMIT', 'Executing long limit order transaction', { 
                        marketAddress: data.marketAddress,
                        payAmount: data.payAmount,
                        leverage: data.leverage ? `${parseFloat(data.leverage) / 10000}x` : 'Auto',
                        limitPrice: `$${(Number(data.limitPrice) / 1e30).toFixed(2)}`
                    });
    
                    // Use the simplified helper function with enhanced error handling
                    const result = await sdk.orders.long(helperParams).catch(error => {
                        console.error('OPEN_LONG_LIMIT', error, { 
                            helperParams, 
                            stage: 'sdk.orders.long',
                            errorInfo: error.info,
                            errorData: error.data,
                            fullError: error
                        });
                        throw new Error(`Failed to open long limit order: ${error.message || error}`);
                    });
    
                    let memory = ctx.memory as GmxMemory;
                    
                    // Update memory with order info
                    const leverageX = data.leverage ? parseFloat(data.leverage) / 10000 : 'Auto';
                    memory = {
                        ...memory,
                        currentTask: "🎯 Placing LONG limit order",
                        lastResult: `Placed long limit order${typeof leverageX === 'number' ? ` with ${leverageX}x leverage` : ''} at $${(Number(data.limitPrice) / 1e30).toFixed(2)}`
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
                            limitPrice: `$${(Number(data.limitPrice) / 1e30).toFixed(2)}`,
                            leverage: typeof leverageX === 'number' ? `${leverageX}x` : leverageX,
                            slippage: `${(data.allowedSlippageBps || 125) / 100}%`
                        },
                        transactionHash: result?.transactionHash || null
                    };
                    
                    console.log('OPEN_LONG_LIMIT', 'Long limit order placed successfully', successResult);
                    
                    return successResult;
                } catch (error) {
                    const errorResult = {
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
                        message: "Failed to place long limit order"
                    };
                    
                    console.error('OPEN_LONG_LIMIT', 'Failed to place long limit order', errorResult);
                    
                    return errorResult;
                }
            }
        }),
    
        // Open Short Market Order (Immediate Execution)
        action({
            name: "open_short_market", 
            description: "Open a short position with a market order (immediate execution at current market price).",
            schema: z.object({
                marketAddress: z.string().describe("Market token address from getMarketsInfo response (e.g. '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336' for ETH/USD market)"),
                payAmount: z.string().describe("Amount to pay in BigInt string format using token's native decimals (e.g. '1000000' for 1 USDC with 6 decimals). Use this for collateral-based position sizing."),
                payTokenAddress: z.string().describe("ERC20 token contract address you're paying with (e.g. '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' for USDC)"),
                collateralTokenAddress: z.string().describe("ERC20 token contract address for collateral (e.g. '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' for WETH)"),
                allowedSlippageBps: z.number().optional().default(125).describe("Allowed slippage in basis points (100 = 1%, range: 50-500, default: 125)"),
                leverage: z.string().optional().describe("Leverage in basis points as BigInt string (e.g. '50000' = 5x, '10000' = 1x, '200000' = 20x). Optional for helper function."),
            }),
            async handler(data, ctx, agent) {
                try {
                    console.log(`[OPEN_SHORT] Starting short position open (input: data)`);
                    
                    // Get market and token data for validation and proper error handling
                    const marketsResult = gmxDataCache ? await gmxDataCache.getMarketsInfo() : await sdk.markets.getMarketsInfo().catch(error => {
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
                    
                    console.log(`[OPEN_SHORT] Market validated (marketName: marketInfo.name, marketAddress: data.marketAddress)`);
                    
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
                    
                    console.log('OPEN_SHORT', 'Tokens validated', { 
                        payToken: payToken.symbol, 
                        collateralToken: collateralToken.symbol 
                    });
                    
                    // Helper function to safely convert string to BigInt (removes 'n' suffix if present)
                    const safeBigInt = (value: string): bigint => {
                        const cleanValue = value.endsWith('n') ? value.slice(0, -1) : value;
                        return BigInt(cleanValue);
                    };
    
                    // Prepare parameters for helper function
                    const helperParams: any = {
                        marketAddress: data.marketAddress,
                        payTokenAddress: data.payTokenAddress,
                        collateralTokenAddress: data.collateralTokenAddress,
                        allowedSlippageBps: data.allowedSlippageBps || 125,
                        payAmount: safeBigInt(data.payAmount),
                    };
    
                    // Add optional parameters (SDK expects BigInt objects)
                    if (data.leverage) {
                        helperParams.leverage = safeBigInt(data.leverage);
                    }
                    
                    if (data.limitPrice) {
                        helperParams.limitPrice = safeBigInt(data.limitPrice);
                    }
    
                    console.log('OPEN_SHORT', 'Helper params prepared', helperParams);
    
                    // Wait 3 seconds before write operation to prevent nonce errors
                    console.log('[OPEN_SHORT] Waiting 3 seconds before transaction');
                    await sleep(2000);
                    
                    console.log('OPEN_SHORT', 'Executing short position transaction', { 
                        marketAddress: data.marketAddress,
                        payAmount: data.payAmount,
                        leverage: data.leverage ? `${parseFloat(data.leverage) / 10000}x` : 'Auto',
                        isLimitOrder: !!data.limitPrice,
                        limitPrice: data.limitPrice ? `$${(Number(data.limitPrice) / 1e30).toFixed(2)}` : undefined
                    });
    
                    // Use the simplified helper function with enhanced error handling
                    const result = await sdk.orders.short(helperParams).catch(error => {
                        console.error('OPEN_SHORT_MARKET', error, { helperParams, stage: 'sdk.orders.short' });
                        throw new Error(`Failed to open short position: ${error.message || error}`);
                    });
    
                    let memory = ctx.memory as GmxMemory;
                    
                    // Update memory with order info
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
                            slippage: `${(data.allowedSlippageBps || 125) / 100}%`
                        },
                        transactionHash: result?.transactionHash || null
                    };
                    
                    console.log('OPEN_SHORT_MARKET', 'Short market order opened successfully', successResult);
                    
                    return successResult;
                } catch (error) {
                    const errorResult = {
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
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
                allowedSlippageBps: z.number().optional().default(125).describe("Allowed slippage in basis points (100 = 1%, range: 50-500, default: 125)"),
                leverage: z.string().optional().describe("Leverage in basis points as BigInt string (e.g. '50000' = 5x, '10000' = 1x, '200000' = 20x). Optional for helper function."),
            }),
            async handler(data, ctx, agent) {
                try {
                    console.log(`[OPEN_SHORT_LIMIT] Starting short limit order (input: data)`);
                    
                    // Get market and token data for validation and proper error handling
                    const marketsResult = gmxDataCache ? await gmxDataCache.getMarketsInfo() : await sdk.markets.getMarketsInfo().catch(error => {
                        const errorMsg = `Failed to get market data: ${error.message || error}`;
                        console.error('OPEN_SHORT_LIMIT', error, { stage: 'getMarketsInfo' });
                        throw new Error(errorMsg);
                    });
                    const { marketsInfoData, tokensData } = marketsResult;
                    
                    if (!marketsInfoData || !tokensData) {
                        console.error('OPEN_SHORT_LIMIT', 'Invalid market data received', { marketsInfoData: !!marketsInfoData, tokensData: !!tokensData });
                        throw new Error("Invalid market data received");
                    }
                    
                    // Validate market and tokens exist
                    const marketInfo = marketsInfoData[data.marketAddress];
                    if (!marketInfo) {
                        console.error('OPEN_SHORT_LIMIT', `Market not found: ${data.marketAddress}`, { availableMarkets: Object.keys(marketsInfoData) });
                        throw new Error(`Market not found: ${data.marketAddress}`);
                    }
                    
                    console.log(`[OPEN_SHORT_LIMIT] Market validated (marketName: marketInfo.name, marketAddress: data.marketAddress)`);
                    
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
                    
                    console.log('OPEN_SHORT_LIMIT', 'Tokens validated', { 
                        payToken: payToken.symbol, 
                        collateralToken: collateralToken.symbol 
                    });
                    
                    // Helper function to safely convert string to BigInt (removes 'n' suffix if present)
                    const safeBigInt = (value: string): bigint => {
                        const cleanValue = value.endsWith('n') ? value.slice(0, -1) : value;
                        return BigInt(cleanValue);
                    };
    
                    // Prepare parameters for helper function
                    const helperParams: any = {
                        marketAddress: data.marketAddress,
                        payTokenAddress: data.payTokenAddress,
                        collateralTokenAddress: data.collateralTokenAddress,
                        allowedSlippageBps: data.allowedSlippageBps || 125,
                        payAmount: safeBigInt(data.payAmount),
                        limitPrice: safeBigInt(data.limitPrice) // Always include limit price for limit orders
                    };
    
                    // Add optional parameters (SDK expects BigInt objects)
                    if (data.leverage) {
                        helperParams.leverage = safeBigInt(data.leverage);
                    }
    
                    console.log('OPEN_SHORT_LIMIT', 'Helper params prepared', helperParams);
    
                    // Wait 2 seconds before write operation to prevent nonce errors
                    console.log('[OPEN_SHORT_LIMIT] Waiting 2 seconds before transaction');
                    await sleep(2000);
                    
                    console.log('OPEN_SHORT_LIMIT', 'Executing short limit order transaction', { 
                        marketAddress: data.marketAddress,
                        payAmount: data.payAmount,
                        leverage: data.leverage ? `${parseFloat(data.leverage) / 10000}x` : 'Auto',
                        limitPrice: `$${(Number(data.limitPrice) / 1e30).toFixed(2)}`
                    });
    
                    // Use the simplified helper function with enhanced error handling
                    const result = await sdk.orders.short(helperParams).catch(error => {
                        console.error('OPEN_SHORT_LIMIT', error, { helperParams, stage: 'sdk.orders.short' });
                        throw new Error(`Failed to open short limit order: ${error.message || error}`);
                    });
    
                    let memory = ctx.memory as GmxMemory;
                    
                    // Update memory with order info
                    const leverageX = data.leverage ? parseFloat(data.leverage) / 10000 : 'Auto';
                    memory = {
                        ...memory,
                        currentTask: "🎯 Placing SHORT limit order",
                        lastResult: `Placed short limit order${typeof leverageX === 'number' ? ` with ${leverageX}x leverage` : ''} at $${(Number(data.limitPrice) / 1e30).toFixed(2)}`
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
                            limitPrice: `$${(Number(data.limitPrice) / 1e30).toFixed(2)}`,
                            leverage: typeof leverageX === 'number' ? `${leverageX}x` : leverageX,
                            slippage: `${(data.allowedSlippageBps || 125) / 100}%`
                        },
                        transactionHash: result?.transactionHash || null
                    };
                    
                    console.log('OPEN_SHORT_LIMIT', 'Short limit order placed successfully', successResult);
                    
                    return successResult;
                } catch (error) {
                    const errorResult = {
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
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
            allowedSlippageBps: z.number().optional().default(125).describe("Allowed slippage in basis points (default: 100 = 1%)")
        }),
        async handler(data, ctx, agent) {
            try {
                let memory = ctx.memory as GmxMemory;
                
                console.log(`[CLOSE_POSITION] Starting position close (input: data)`);

                // Get required market and token data
                const marketsResult = gmxDataCache ? await gmxDataCache.getMarketsInfo() : await sdk.markets.getMarketsInfo().catch(error => {
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
                const positionsResult = await sdk.positions.getPositions({
                    marketsData: marketsInfoData,
                    tokensData: tokensData,
                    start: 0,
                    end: 1000,
                });
                
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
                console.log(`[CLOSE_POSITION] Found ${direction} position to close`);
                console.log(`[CLOSE_POSITION] Position size: ${position.sizeInUsd.toString()} USD`);
                console.log(`[CLOSE_POSITION] Position tokens: ${position.sizeInTokens.toString()}`);
                console.log(`[CLOSE_POSITION] Collateral amount: ${position.collateralAmount.toString()}`);
                
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
                               
                // Use GMX SDK's low-level transaction method with proper DecreasePositionAmounts
                const slippageBps = data.allowedSlippageBps || 125;
                
                // Calculate acceptable price with slippage based on position direction
                const markPrice = isLong ? 
                    (indexToken.prices?.maxPrice || 0n) : 
                    (indexToken.prices?.minPrice || 0n);
                    
                // For longs: subtract slippage (willing to accept lower price)
                // For shorts: add slippage (willing to accept higher price)
                const acceptablePrice = isLong ? 
                    markPrice - (markPrice * BigInt(slippageBps) / 10000n) :
                    markPrice + (markPrice * BigInt(slippageBps) / 10000n);
                
                // Calculate collateral USD value
                const collateralPrice = collateralToken.prices?.minPrice || 0n;
                const collateralDeltaUsd = convertToUsd(
                    position.collateralAmount,
                    collateralToken.decimals,
                    collateralPrice
                ) || 0n;
                                                
                // Create complete DecreasePositionAmounts object with ALL required fields
                const decreaseAmounts = {
                    // Core position data
                    isFullClose: true,
                    sizeDeltaUsd: position.sizeInUsd,
                    sizeDeltaInTokens: position.sizeInTokens,
                    collateralDeltaUsd: collateralDeltaUsd,
                    collateralDeltaAmount: position.collateralAmount,
                    
                    // Price fields
                    indexPrice: markPrice,
                    collateralPrice: collateralPrice,
                    acceptablePrice: acceptablePrice,
                    acceptablePriceDeltaBps: BigInt(slippageBps),
                    recommendedAcceptablePriceDeltaBps: BigInt(slippageBps),
                    
                    // PnL fields (estimated - SDK will calculate final values)
                    estimatedPnl: 0n,
                    estimatedPnlPercentage: 0n,
                    realizedPnl: 0n,
                    realizedPnlPercentage: 0n,
                    
                    // Fee fields (estimated - SDK will calculate)
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
                    
                    // Output fields (estimated)
                    payedOutputUsd: 0n,
                    payedRemainingCollateralUsd: 0n,
                    receiveTokenAmount: 0n,
                    receiveUsd: 0n,
                    
                    // Swap configuration
                    decreaseSwapType: 0, // No swap by default
                };
                
                console.log('CLOSE_POSITION', 'DecreaseAmounts prepared', { 
                    fieldCount: Object.keys(decreaseAmounts).length,
                    decreaseAmounts 
                });
                                
                console.log('CLOSE_POSITION', 'Executing close position transaction', { 
                    market: marketInfo.name,
                    direction,
                    sizeUsd: formatUsdAmount(position.sizeInUsd, 2),
                    receiveToken: receiveToken.symbol,
                    slippage: `${slippageBps / 100}%`
                });
                                
                // Use the SDK's createDecreaseOrder method
                const result = await sdk.orders.createDecreaseOrder({
                    marketsInfoData,
                    tokensData,
                    marketInfo,
                    decreaseAmounts,
                    collateralToken,
                    allowedSlippage: slippageBps,
                    isLong: isLong,
                    referralCode: undefined,
                    isTrigger: false // Market order
                }).catch(error => {
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
                
                console.log(`[CLOSE_POSITION] Transaction successful (transactionHash: result?.transactionHash || 'No hash returned')`);
                
                // Invalidate position and order caches after successful trade
                if (gmxDataCache) {
                    gmxDataCache.invalidatePositions();
                }
                               
                // Update memory
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
                        slippage: `${slippageBps / 100}%`
                    },
                    transactionHash: result?.transactionHash || null
                };
                
                console.log('CLOSE_POSITION', 'Position closed successfully', successResult);
                
                return successResult;
            } catch (error) {
                const errorResult = {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
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
            allowedSlippageBps: z.number().optional().default(125).describe("Allowed slippage in basis points (100 = 1%, range: 50-500, default: 100)"),
            triggerPrice: z.string().optional().describe("For limit swaps: price at which to execute swap in BigInt string with 30-decimal precision. Omit for market swaps.")
        }).refine(data => data.fromAmount || data.toAmount, {
            message: "Either fromAmount or toAmount must be specified"
        }),
        async handler(data, ctx, agent) {
            try {
                let memory = ctx.memory as GmxMemory;
                
                console.log(`[SWAP_TOKENS] Starting token swap (input: data)`);

                // Get token data for validation (no need for markets info for swaps)
                const { tokensData } = await sdk.tokens.getTokensData().catch(error => {
                    console.error('SWAP_TOKENS', error, { stage: 'getTokensData' });
                    throw new Error(`Failed to get token data: ${error.message || error}`);
                });
                
                if (!tokensData) {
                    console.error('SWAP_TOKENS', 'Invalid token data received');
                    throw new Error("Failed to get token data");
                }

                // Validate tokens exist
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

                // Check for synthetic tokens (not supported)
                if (fromToken.isSynthetic) {
                    throw new Error(`Synthetic tokens are not supported: ${fromToken.symbol}`);
                }
                if (toToken.isSynthetic) {
                    throw new Error(`Synthetic tokens are not supported: ${toToken.symbol}`);
                }

                console.log('SWAP_TOKENS', 'Tokens validated', { 
                    fromToken: fromToken.symbol, 
                    toToken: toToken.symbol 
                });

                // Prepare swap parameters
                const swapParams: any = {
                    fromTokenAddress: data.fromTokenAddress,
                    toTokenAddress: data.toTokenAddress,
                    allowedSlippageBps: data.allowedSlippageBps || 125,
                };

                // Add amount parameter (either fromAmount or toAmount)
                if (data.fromAmount) {
                    swapParams.fromAmount = BigInt(data.fromAmount);
                } else if (data.toAmount) {
                    swapParams.toAmount = BigInt(data.toAmount);
                } else {
                    throw new Error("Either fromAmount or toAmount must be specified");
                }

                // Add triggerPrice for limit swaps if provided
                if (data.triggerPrice) {
                    swapParams.triggerPrice = BigInt(data.triggerPrice);
                }

                const isLimitOrder = !!data.triggerPrice;
                const orderType = isLimitOrder ? 'Limit' : 'Market';

                console.log('SWAP_TOKENS', 'Swap params prepared', {
                    ...swapParams,
                    orderType,
                    fromAmount: swapParams.fromAmount?.toString(),
                    toAmount: swapParams.toAmount?.toString(),
                    triggerPrice: swapParams.triggerPrice?.toString()
                });

                // Wait 3 seconds before write operation to prevent nonce errors
                console.log('[SWAP_TOKENS] Waiting 3 seconds before transaction');
                await sleep(3000);

                console.log('SWAP_TOKENS', 'Executing swap transaction', { 
                    fromToken: fromToken.symbol,
                    toToken: toToken.symbol,
                    orderType,
                    fromAmount: data.fromAmount,
                    toAmount: data.toAmount,
                    slippage: `${(data.allowedSlippageBps || 125) / 100}%`,
                    triggerPrice: data.triggerPrice ? `$${(Number(data.triggerPrice) / 1e30).toFixed(6)}` : undefined
                });

                // Execute the swap using the SDK helper
                const result = await sdk.orders.swap(swapParams).catch(error => {
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

                // Calculate swap amounts for display
                let swapAmountDisplay = '';
                let receiveAmountDisplay = '';
                
                if (data.fromAmount) {
                    swapAmountDisplay = formatTokenAmount(BigInt(data.fromAmount), fromToken.decimals, 6);
                    // For market swaps, we can't know exact output until execution
                    receiveAmountDisplay = isLimitOrder && data.triggerPrice ? 
                        `~${(Number(data.fromAmount) / Math.pow(10, fromToken.decimals) * Number(data.triggerPrice) / 1e30).toFixed(6)}` :
                        'Market rate';
                } else if (data.toAmount) {
                    receiveAmountDisplay = formatTokenAmount(BigInt(data.toAmount), toToken.decimals, 6);
                    swapAmountDisplay = 'Market rate';
                }

                // Update memory
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

                console.log('SWAP_TOKENS', 'Swap initiated successfully', successResult);

                return successResult;
            } catch (error) {
                const errorResult = {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
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
        description: "Set a take profit order for an existing position. Creates a LimitDecrease order that executes when price reaches profit target.",
        schema: z.object({
            marketAddress: z.string().describe("Market address of the position (from get_positions response)"),
            triggerPrice: z.string().describe("Price at which to take profit in BigInt string with 30-decimal precision (e.g. '67000000000000000000000000000000000' for $67,000)"),
            sizeDeltaUsd: z.string().optional().describe("Position size to close in USD with 30-decimal precision. If not provided, closes entire position."),
            allowedSlippageBps: z.number().optional().default(125).describe("Allowed slippage in basis points (50 = 0.5%, default)")
        }),
        async handler(data, ctx, agent) {
            try {
                let memory = ctx.memory as GmxMemory;
                
                console.log(`[SET_TAKE_PROFIT] Starting take profit order creation (input: data)`);

                // Wait 3 seconds at the beginning to allow previous transactions to be processed
                console.log('[SET_TAKE_PROFIT] Waiting 3 seconds for previous transactions to process');
                await sleep(3000);

                // Use existing get_positions_str function to get position data properly
                const positionsData = await get_positions_str(sdk, gmxDataCache);
                console.log(`[SET_TAKE_PROFIT] Retrieved positions data (positionsCount: positionsData.length)`);
                
                // Parse the positions to find our specific position
                // The get_positions_str returns formatted string, so we need to get the raw data
                const marketsResult = cachedMarkets || await sdk.markets.getMarketsInfo().catch(error => {
                    console.error('SET_TAKE_PROFIT', error, { stage: 'getMarketsInfo' });
                    throw new Error(`Failed to get market data: ${error.message || error}`);
                });
                const { marketsInfoData, tokensData } = marketsResult;
                
                if (!marketsInfoData || !tokensData) {
                    console.error('SET_TAKE_PROFIT', 'Invalid market data received');
                    throw new Error("Failed to get market and token data");
                }
                
                // Get positions using the same method as get_positions_str
                const positionsResult = await sdk.positions.getPositions({
                    marketsData: marketsInfoData,
                    tokensData: tokensData,
                    start: 0,
                    end: 1000,
                });
                
                const positionsInfoResult = await sdk.positions.getPositionsInfo({
                    marketsInfoData,
                    tokensData,
                    showPnlInLeverage: false
                });
                
                // Find the position using enhanced positions data (same as get_positions_str)
                const position = Object.values(positionsInfoResult).find((pos: any) => 
                    pos.marketAddress === data.marketAddress
                );
                
                if (!position) {
                    throw new Error(`No position found for market address ${data.marketAddress}. Use get_positions to see current positions.`);
                }
                
                const isLong = position.isLong;
                const direction = isLong ? 'LONG' : 'SHORT';
                const marketInfo = marketsInfoData[data.marketAddress];
                
                // Use the position's mark price (this is the current market price for the position)
                const markPrice = position.markPrice;
                const currentPrice = bigIntToDecimal(markPrice, USD_DECIMALS);
                const triggerPriceDecimal = bigIntToDecimal(BigInt(data.triggerPrice), USD_DECIMALS);
                
                console.log('SET_TAKE_PROFIT', 'Position and price data retrieved', {
                    market: marketInfo.name,
                    direction,
                    currentPrice: `$${currentPrice.toFixed(2)}`,
                    triggerPrice: `$${triggerPriceDecimal.toFixed(2)}`,
                    positionSize: formatUsdAmount(position.sizeInUsd, 2)
                });
                
                // Determine position size to close
                const positionSizeUsd = data.sizeDeltaUsd ? BigInt(data.sizeDeltaUsd) : position.sizeInUsd;
                
                // Get collateral token
                const collateralToken = tokensData[position.collateralTokenAddress];
                if (!collateralToken) {
                    throw new Error("Failed to get collateral token data");
                }
                
                // Create comprehensive DecreaseAmounts object for take profit
                const decreaseAmounts = {
                    // Core position data
                    isFullClose: !data.sizeDeltaUsd, // Full close if no specific size provided
                    sizeDeltaUsd: positionSizeUsd,
                    sizeDeltaInTokens: data.sizeDeltaUsd ? 
                        (position.sizeInTokens * BigInt(data.sizeDeltaUsd)) / position.sizeInUsd :
                        position.sizeInTokens,
                    collateralDeltaUsd: 0n, // Let SDK calculate
                    collateralDeltaAmount: 0n, // Let SDK calculate
                    
                    // Price fields
                    indexPrice: position.markPrice || 0n,
                    collateralPrice: collateralToken.prices?.minPrice || 0n,
                    triggerPrice: BigInt(data.triggerPrice),
                    acceptablePrice: BigInt(data.triggerPrice),
                    acceptablePriceDeltaBps: BigInt(data.allowedSlippageBps || 125),
                    recommendedAcceptablePriceDeltaBps: BigInt(data.allowedSlippageBps || 125),
                    
                    // PnL fields (SDK will calculate)
                    estimatedPnl: 0n,
                    estimatedPnlPercentage: 0n,
                    realizedPnl: 0n,
                    realizedPnlPercentage: 0n,
                    
                    // Fee fields (SDK will calculate)
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
                    
                    // Output fields
                    payedOutputUsd: 0n,
                    payedRemainingCollateralUsd: 0n,
                    receiveTokenAmount: 0n,
                    receiveUsd: 0n,
                    
                    // Order specific
                    triggerOrderType: 5, // LimitDecrease
                    decreaseSwapType: 0, // NoSwap
                };
                
                console.log('SET_TAKE_PROFIT', 'Creating take profit order', { 
                    direction,
                    triggerPrice: triggerPriceDecimal,
                    currentPrice,
                    positionSize: formatUsdAmount(positionSizeUsd, 2)
                });
                
                console.log('SET_TAKE_PROFIT', 'Executing take profit order transaction', { 
                    market: marketInfo.name,
                    direction,
                    triggerPrice: `$${triggerPriceDecimal.toFixed(2)}`,
                    currentPrice: `$${currentPrice.toFixed(2)}`,
                    positionSize: formatUsdAmount(positionSizeUsd, 2),
                    profitTarget: isLong ? 
                        `+${((triggerPriceDecimal - currentPrice) / currentPrice * 100).toFixed(2)}%` :
                        `+${((currentPrice - triggerPriceDecimal) / currentPrice * 100).toFixed(2)}%`
                });
                
                // Create the take profit order
                const result = await sdk.orders.createDecreaseOrder({
                    marketsInfoData,
                    tokensData,
                    marketInfo,
                    decreaseAmounts,
                    collateralToken,
                    allowedSlippage: data.allowedSlippageBps || 125,
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
                
                // Update memory
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
                        sizeDeltaUsd: formatUsdAmount(positionSizeUsd, 2),
                        profitTarget: isLong ? 
                            `+${((triggerPriceDecimal - currentPrice) / currentPrice * 100).toFixed(2)}%` :
                            `+${((currentPrice - triggerPriceDecimal) / currentPrice * 100).toFixed(2)}%`,
                        slippage: `${(data.allowedSlippageBps || 125) / 100}%`
                    },
                    transactionHash: result?.transactionHash || null
                };
                
                console.log('SET_TAKE_PROFIT', 'Take profit order created successfully', successResult);
                
                return successResult;
            } catch (error) {
                const errorResult = {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
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
        description: "Set a stop loss order for an existing position. Creates a StopLossDecrease order that executes when price reaches stop loss level.",
        schema: z.object({
            marketAddress: z.string().describe("Market address of the position (from get_positions response)"),
            triggerPrice: z.string().describe("Price at which to stop loss in BigInt string with 30-decimal precision (e.g. '63000000000000000000000000000000000' for $63,000)"),
            sizeDeltaUsd: z.string().optional().describe("Position size to close in USD with 30-decimal precision. If not provided, closes entire position."),
            allowedSlippageBps: z.number().optional().default(125).describe("Allowed slippage in basis points (50 = 0.5%, default)")
        }),
        async handler(data, ctx, agent) {
            try {
                let memory = ctx.memory as GmxMemory;
                
                console.log(`[SET_STOP_LOSS] Starting stop loss order creation (input: data)`);

                // Wait 3 seconds at the beginning to allow previous transactions to be processed
                console.log('[SET_STOP_LOSS] Waiting 6 seconds for previous transactions to process');
                await sleep(6000);

                // Use existing get_positions_str function to get position data properly
                const positionsData = await get_positions_str(sdk, gmxDataCache);
                console.log(`[SET_STOP_LOSS] Retrieved positions data (positionsCount: positionsData.length)`);
                
                // Parse the positions to find our specific position
                // The get_positions_str returns formatted string, so we need to get the raw data
                const marketsResult = cachedMarkets || await sdk.markets.getMarketsInfo().catch(error => {
                    console.error('SET_STOP_LOSS', error, { stage: 'getMarketsInfo' });
                    throw new Error(`Failed to get market data: ${error.message || error}`);
                });
                const { marketsInfoData, tokensData } = marketsResult;
                
                if (!marketsInfoData || !tokensData) {
                    console.error('SET_STOP_LOSS', 'Invalid market data received');
                    throw new Error("Failed to get market and token data");
                }
                
                // Get positions using the same method as get_positions_str
                const positionsResult = await sdk.positions.getPositions({
                    marketsData: marketsInfoData,
                    tokensData: tokensData,
                    start: 0,
                    end: 1000,
                });
                
                const positionsInfoResult = await sdk.positions.getPositionsInfo({
                    marketsInfoData,
                    tokensData,
                    showPnlInLeverage: false
                });
                
                // Find the position using enhanced positions data (same as get_positions_str)
                const position = Object.values(positionsInfoResult).find((pos: any) => 
                    pos.marketAddress === data.marketAddress
                );
                
                if (!position) {
                    throw new Error(`No position found for market address ${data.marketAddress}. Use get_positions to see current positions.`);
                }
                
                const isLong = position.isLong;
                const direction = isLong ? 'LONG' : 'SHORT';
                const marketInfo = marketsInfoData[data.marketAddress];
                
                // Use the position's mark price (this is the current market price for the position)
                const markPrice = position.markPrice;
                const currentPrice = bigIntToDecimal(markPrice, USD_DECIMALS);
                const triggerPriceDecimal = bigIntToDecimal(BigInt(data.triggerPrice), USD_DECIMALS);
                
                console.log('SET_STOP_LOSS', 'Position and price data retrieved', {
                    market: marketInfo.name,
                    direction,
                    currentPrice: `$${currentPrice.toFixed(2)}`,
                    triggerPrice: `$${triggerPriceDecimal.toFixed(2)}`,
                    positionSize: formatUsdAmount(position.sizeInUsd, 2)
                });
                
                // Determine position size to close
                const positionSizeUsd = data.sizeDeltaUsd ? BigInt(data.sizeDeltaUsd) : position.sizeInUsd;
                
                // Get collateral token
                const collateralToken = tokensData[position.collateralTokenAddress];
                if (!collateralToken) {
                    throw new Error("Failed to get collateral token data");
                }
                
                // Create comprehensive DecreaseAmounts object for stop loss
                const decreaseAmounts = {
                    // Core position data
                    isFullClose: !data.sizeDeltaUsd, // Full close if no specific size provided
                    sizeDeltaUsd: positionSizeUsd,
                    sizeDeltaInTokens: data.sizeDeltaUsd ? 
                        (position.sizeInTokens * BigInt(data.sizeDeltaUsd)) / position.sizeInUsd :
                        position.sizeInTokens,
                    collateralDeltaUsd: 0n, // Let SDK calculate
                    collateralDeltaAmount: 0n, // Let SDK calculate
                    
                    // Price fields
                    indexPrice: position.markPrice || 0n,
                    collateralPrice: collateralToken.prices?.minPrice || 0n,
                    triggerPrice: BigInt(data.triggerPrice),
                    acceptablePrice: BigInt(data.triggerPrice),
                    acceptablePriceDeltaBps: BigInt(data.allowedSlippageBps || 125),
                    recommendedAcceptablePriceDeltaBps: BigInt(data.allowedSlippageBps || 125),
                    
                    // PnL fields (SDK will calculate)
                    estimatedPnl: 0n,
                    estimatedPnlPercentage: 0n,
                    realizedPnl: 0n,
                    realizedPnlPercentage: 0n,
                    
                    // Fee fields (SDK will calculate)
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
                    
                    // Output fields
                    payedOutputUsd: 0n,
                    payedRemainingCollateralUsd: 0n,
                    receiveTokenAmount: 0n,
                    receiveUsd: 0n,
                    
                    // Order specific
                    triggerOrderType: 6, // StopLossDecrease
                    decreaseSwapType: 0, // NoSwap
                };
                
                console.log('SET_STOP_LOSS', 'Creating stop loss order', { 
                    direction,
                    triggerPrice: triggerPriceDecimal,
                    currentPrice,
                    positionSize: formatUsdAmount(positionSizeUsd, 2)
                });
                
                console.log('SET_STOP_LOSS', 'Executing stop loss order transaction', { 
                    market: marketInfo.name,
                    direction,
                    triggerPrice: `$${triggerPriceDecimal.toFixed(2)}`,
                    currentPrice: `$${currentPrice.toFixed(2)}`,
                    positionSize: formatUsdAmount(positionSizeUsd, 2),
                    maxLoss: isLong ? 
                        `-${((currentPrice - triggerPriceDecimal) / currentPrice * 100).toFixed(2)}%` :
                        `-${((triggerPriceDecimal - currentPrice) / currentPrice * 100).toFixed(2)}%`
                });
                
                // Create the stop loss order
                const result = await sdk.orders.createDecreaseOrder({
                    marketsInfoData,
                    tokensData,
                    marketInfo,
                    decreaseAmounts,
                    collateralToken,
                    allowedSlippage: data.allowedSlippageBps || 125,
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
                
                // Update memory
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
                        sizeDeltaUsd: formatUsdAmount(positionSizeUsd, 2),
                        maxLoss: isLong ? 
                            `-${((currentPrice - triggerPriceDecimal) / currentPrice * 100).toFixed(2)}%` :
                            `-${((triggerPriceDecimal - currentPrice) / currentPrice * 100).toFixed(2)}%`,
                        slippage: `${(data.allowedSlippageBps || 125) / 100}%`
                    },
                    transactionHash: result?.transactionHash || null
                };
                
                console.log('SET_STOP_LOSS', 'Stop loss order created successfully', successResult);
                
                return successResult;
            } catch (error) {
                const errorResult = {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to set stop loss order"
                };
                
                console.error('SET_STOP_LOSS', 'Failed to set stop loss', errorResult);
                return errorResult;
            }
        }
    }),
];
}