// ═══════════════════════════════════════════════════════════════════════════════
// 📦 GMX ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

import { action } from "@daydreamsai/core";
import { z } from "zod/v4";
import type { GmxSdk } from "@gmx-io/sdk";
import type { GmxMemory } from './types';
import { 
    USD_DECIMALS, 
    bigIntToDecimal, 
    formatTokenAmount, 
    formatUsdAmount,
    convertToUsd,
    convertToTokenAmount,
    calculateLiquidationPrice,
    getTradeActionDescription
} from './utils';
import { get_portfolio_balance_str, get_positions_str, get_btc_eth_markets_str, get_tokens_data_str, get_daily_volumes_str } from './queries';


export function createGmxActions(sdk: GmxSdk, env?: any) {
    return [
    // ═══════════════════════════════════════════════════════════════════════════════
    // 📈 READ METHODS - MARKET DATA
    // ═══════════════════════════════════════════════════════════════════════════════
    
    // BTC/ETH Markets Info - Focused on scalping markets
    action({
        name: "get_btc_eth_markets",
        description: "Get detailed information about BTC and ETH markets optimized for scalping - includes prices, liquidity, funding rates, and market addresses for trading",
        async handler(data, ctx, agent) {
            try {
                let memory = ctx.memory as GmxMemory;
                
                // Use the formatted string function from queries
                const marketsString = await get_btc_eth_markets_str(sdk);
                
                // Update memory
                memory = {
                    ...memory,
                    markets: marketsString,
                    currentTask: "📊 Fetching BTC/ETH market data for scalping",
                    lastResult: "Retrieved focused BTC/ETH market information"
                };

                return {
                    success: true,
                    message: "Successfully retrieved BTC/ETH markets data",
                    formattedData: marketsString
                };
            } catch (error) {
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
        description: "Get daily volume data for BTC and ETH markets - filtered for scalping focus",
        async handler(data, ctx, agent) {
            try {
                let memory = ctx.memory as GmxMemory;
                
                // Use the formatted string function from queries
                const volumesString = await get_daily_volumes_str(sdk);
                
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
            try {
                let memory = ctx.memory as GmxMemory;
                
                // Use the formatted string function from queries
                const tokensString = await get_tokens_data_str(sdk);
                
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
            try {
                let memory = ctx.memory as GmxMemory;
                
                // Use the formatted string function from queries
                const portfolioString = await get_portfolio_balance_str(sdk);
                
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
            try {
                let memory = ctx.memory as GmxMemory;
                
                // Use the formatted string function from queries
                const positionsString = await get_positions_str(sdk);
                
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
            try {
                // Get required market and token data first
                const { marketsInfoData, tokensData } = await sdk.markets.getMarketsInfo();
                
                if (!marketsInfoData || !tokensData) {
                    throw new Error("Failed to get market and token data");
                }

                // Use official SDK method with required parameters
                const ordersResult = await sdk.orders.getOrders({
                    marketsInfoData,
                    tokensData
                });
                
                let memory = ctx.memory as GmxMemory;
                
                // Extract orders data from structured result
                const rawOrders = ordersResult.ordersInfoData ? Object.values(ordersResult.ordersInfoData) : [];
                
                // Enhanced orders with comprehensive calculations
                const enhancedOrders = rawOrders.map(order => {
                    try {
                        const marketInfo = marketsInfoData[order.marketAddress];
                        const indexToken = tokensData[marketInfo?.indexTokenAddress];
                        const collateralToken = tokensData[order.collateralTokenAddress];
                        
                        if (!marketInfo || !indexToken || !collateralToken) {
                            return order; // Return original if data missing
                        }
                        
                        // Get current mark price
                        const markPrice = indexToken.prices?.maxPrice || 0n;
                        
                        // Calculate order value in USD
                        const orderValueUsd = bigIntToDecimal(order.sizeInUsd || 0n, USD_DECIMALS);
                        
                        // Calculate trigger price difference from mark price
                        const triggerPrice = order.triggerPrice || 0n;
                        const triggerPriceUsd = bigIntToDecimal(triggerPrice, USD_DECIMALS);
                        const markPriceUsd = bigIntToDecimal(markPrice, USD_DECIMALS);
                        
                        const priceDifference = markPriceUsd - triggerPriceUsd;
                        const priceDifferencePercent = triggerPriceUsd > 0 ? (priceDifference / triggerPriceUsd) * 100 : 0;
                        
                        // Calculate collateral value
                        const collateralValue = bigIntToDecimal(
                            order.initialCollateralDeltaAmount || 0n, 
                            collateralToken.decimals
                        );
                        
                        // Calculate potential leverage (size / collateral)
                        const potentialLeverage = collateralValue > 0 ? orderValueUsd / collateralValue : 0;
                        
                        // Calculate order age
                        const createdAt = order.createdAtTime ? Number(order.createdAtTime) : 0;
                        const orderAge = createdAt > 0 ? Date.now() / 1000 - createdAt : 0;
                        const orderAgeHours = orderAge / 3600;
                        
                        // Determine order status and execution probability
                        let executionStatus = "Pending";
                        let executionProbability = 0;
                        
                        if (order.isLong !== undefined) {
                            if (order.isLong) {
                                // Long order - executes when price goes up to trigger
                                if (markPriceUsd >= triggerPriceUsd) {
                                    executionStatus = "Ready to Execute";
                                    executionProbability = 100;
                                } else {
                                    const distanceToTrigger = (triggerPriceUsd - markPriceUsd) / markPriceUsd * 100;
                                    executionProbability = Math.max(0, 100 - distanceToTrigger * 10);
                                }
                            } else {
                                // Short order - executes when price goes down to trigger
                                if (markPriceUsd <= triggerPriceUsd) {
                                    executionStatus = "Ready to Execute";
                                    executionProbability = 100;
                                } else {
                                    const distanceToTrigger = (markPriceUsd - triggerPriceUsd) / markPriceUsd * 100;
                                    executionProbability = Math.max(0, 100 - distanceToTrigger * 10);
                                }
                            }
                        }
                        
                        // Calculate potential liquidation price if order executes
                        let potentialLiquidationPrice = null;
                        if (order.sizeInUsd && order.initialCollateralDeltaAmount && marketInfo.minCollateralFactor) {
                            try {
                                const sizeInTokens = convertToTokenAmount(
                                    order.sizeInUsd,
                                    indexToken.decimals,
                                    markPrice
                                );
                                
                                const liquidationPriceRaw = calculateLiquidationPrice({
                                    sizeInUsd: order.sizeInUsd,
                                    sizeInTokens: sizeInTokens || 0n,
                                    collateralAmount: order.initialCollateralDeltaAmount,
                                    collateralUsd: convertToUsd(
                                        order.initialCollateralDeltaAmount,
                                        collateralToken.decimals,
                                        collateralToken.prices?.maxPrice || 0n
                                    ) || 0n,
                                    markPrice,
                                    indexTokenDecimals: indexToken.decimals,
                                    collateralTokenDecimals: collateralToken.decimals,
                                    isLong: order.isLong || false,
                                    minCollateralFactor: marketInfo.minCollateralFactor,
                                    pendingBorrowingFeesUsd: 0n,
                                    pendingFundingFeesUsd: 0n,
                                    isSameCollateralAsIndex: order.collateralTokenAddress === marketInfo.indexTokenAddress
                                });
                                
                                if (liquidationPriceRaw) {
                                    potentialLiquidationPrice = bigIntToDecimal(liquidationPriceRaw, USD_DECIMALS);
                                }
                            } catch (error) {
                                console.warn("Failed to calculate liquidation price for order:", error);
                            }
                        }
                        
                        // Calculate risk metrics
                        const riskLevel = potentialLeverage > 10 ? "High" : 
                                        potentialLeverage > 5 ? "Medium" : "Low";
                        
                        // Enhanced order data
                        return {
                            ...order,
                            // Market context
                            marketName: marketInfo.name,
                            indexTokenSymbol: indexToken.symbol,
                            collateralTokenSymbol: collateralToken.symbol,
                            
                            // Price analysis
                            currentPrice: markPriceUsd.toFixed(6),
                            triggerPrice: triggerPriceUsd.toFixed(6),
                            priceDifference: priceDifference.toFixed(6),
                            priceDifferencePercent: priceDifferencePercent.toFixed(2) + '%',
                            
                            // Order metrics
                            orderValueUsd: orderValueUsd.toFixed(2),
                            collateralValueUsd: collateralValue.toFixed(6),
                            potentialLeverage: potentialLeverage.toFixed(2) + 'x',
                            
                            // Execution analysis
                            executionStatus,
                            executionProbability: executionProbability.toFixed(1) + '%',
                            orderAge: orderAgeHours.toFixed(1) + ' hours',
                            
                            // Risk analysis
                            riskLevel,
                            potentialLiquidationPrice: potentialLiquidationPrice ? 
                                potentialLiquidationPrice.toFixed(6) : 'N/A',
                            
                            // Order type description
                            orderTypeDescription: getTradeActionDescription('OrderCreated', order.orderType, order.isLong || false),
                            
                            // Calculate distance to liquidation if executed
                            liquidationDistance: potentialLiquidationPrice && markPriceUsd > 0 ? 
                                (Math.abs(markPriceUsd - potentialLiquidationPrice) / markPriceUsd * 100).toFixed(2) + '%' : 'N/A'
                        };
                    } catch (error) {
                        console.warn("Error enhancing order data:", error);
                        return order; // Return original order if enhancement fails
                    }
                });
                
                // Calculate portfolio summary for orders
                const totalOrderValue = enhancedOrders.reduce((sum, order) => 
                    sum + parseFloat(order.orderValueUsd || '0'), 0);
                
                const averageLeverage = enhancedOrders.length > 0 ? 
                    enhancedOrders.reduce((sum, order) => 
                        sum + parseFloat(order.potentialLeverage?.replace('x', '') || '0'), 0) / enhancedOrders.length : 0;
                
                const highRiskOrders = enhancedOrders.filter(order => order.riskLevel === 'High').length;
                const readyToExecute = enhancedOrders.filter(order => order.executionStatus === 'Ready to Execute').length;
                
                // Update memory with enhanced orders
                memory = {
                    ...memory,
                    orders: enhancedOrders,
                    currentTask: "📋 Reviewing pending scalp orders",
                    lastResult: `Retrieved ${enhancedOrders.length} orders with comprehensive analysis`
                };

                return {
                    success: true,
                    message: `Retrieved ${enhancedOrders.length} orders with comprehensive analysis`,
                    orders: enhancedOrders,
                    summary: {
                        totalOrders: enhancedOrders.length,
                        totalOrderValue: '$' + totalOrderValue.toFixed(2),
                        averageLeverage: averageLeverage.toFixed(2) + 'x',
                        highRiskOrders,
                        readyToExecute,
                        orderTypes: enhancedOrders.reduce((acc, order) => {
                            const type = order.orderTypeDescription || 'Unknown';
                            acc[type] = (acc[type] || 0) + 1;
                            return acc;
                        }, {} as Record<string, number>)
                    }
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to fetch orders"
                };
            }
        }
    }),


    // Trade History (Official SDK Method) - Enhanced with Comprehensive Analytics
    action({
        name: "get_trade_history",
        description: "Get trading history with comprehensive analytics including advanced PnL calculations, liquidation prices, and portfolio-level metrics",
        schema: z.object({
            pageSize: z.number().optional().default(100).describe("Number of trades per page (1-1000, default: 100)"),
            pageIndex: z.number().optional().default(0).describe("Page index for pagination (0-based, default: 0)"),
            fromTxTimestamp: z.number().optional().describe("Start timestamp as Unix timestamp in seconds (e.g. 1672531200 for Jan 1, 2023)"),
            toTxTimestamp: z.number().optional().describe("End timestamp as Unix timestamp in seconds (e.g. 1704067200 for Jan 1, 2024)"),
        }),
        async handler(data, ctx, agent) {
            try {
                // Set default time range if not provided (last 365 days)
                const now = Math.floor(Date.now() / 1000);
                const lastYear = now - (365 * 24 * 60 * 60);
                
                // Get market and token data first (required for trade history)
                const { marketsInfoData, tokensData } = await sdk.markets.getMarketsInfo();
                
                if (!marketsInfoData || !tokensData) {
                    throw new Error("Failed to get market and token data");
                }

                // Create params for trade history request with required dependencies
                const params = {
                    pageSize: data.pageSize || 100,
                    pageIndex: data.pageIndex || 0,
                    fromTxTimestamp: data.fromTxTimestamp || lastYear,
                    toTxTimestamp: data.toTxTimestamp || now,
                    marketsInfoData,
                    tokensData
                };
                
                // Fetch trade history using the SDK
                const tradeActions = await sdk.trades.getTradeHistory(params);
                
                // Process trades for comprehensive analysis
                const simplifiedTrades: any[] = [];
                const tradeMetrics = {
                    totalPnl: 0,
                    totalVolume: 0,
                    totalFees: 0,
                    winCount: 0,
                    totalWins: 0,
                    lossCount: 0,
                    totalLosses: 0,
                    maxWin: 0,
                    maxLoss: 0,
                    totalTradeDuration: 0,
                    slippageAnalysis: { total: 0, count: 0 },
                    marketsTraded: new Set<string>(),
                    profitByMarket: {} as Record<string, number>,
                    volumeByMarket: {} as Record<string, number>,
                    tradesByDay: {} as Record<string, number>
                };
                
                tradeActions.forEach(trade => {
                    try {
                        if (!trade) return;
                        
                        const tradeDate = new Date(trade.transaction.timestamp * 1000);
                        const tradeDateStr = tradeDate.toISOString().split('T')[0];
                        tradeMetrics.tradesByDay[tradeDateStr] = (tradeMetrics.tradesByDay[tradeDateStr] || 0) + 1;
                        
                        // Common properties for all trade types
                        const baseTradeInfo = {
                            id: trade.id,
                            timestamp: tradeDate.toLocaleString(),
                            txHash: trade.transaction.hash,
                            eventName: trade.eventName,
                            orderType: trade.orderType,
                            orderKey: trade.orderKey,
                            blockNumber: trade.transaction.blockNumber
                        };
                        
                        // Process position trades (non-swap trades)
                        if ('marketInfo' in trade) {
                            const positionTrade = trade;
                            
                            // Extract market and token info
                            const marketInfo = positionTrade.marketInfo;
                            const indexToken = positionTrade.indexToken.symbol;
                            const isLong = positionTrade.isLong;
                            const side = isLong ? 'LONG' : 'SHORT';
                            
                            // Track markets traded
                            tradeMetrics.marketsTraded.add(marketInfo.name);
                            
                            // Convert BigInt values to human-readable numbers
                            const sizeUsd = bigIntToDecimal(positionTrade.sizeDeltaUsd, USD_DECIMALS);
                            tradeMetrics.totalVolume += sizeUsd;
                            
                            // Update volume by market
                            tradeMetrics.volumeByMarket[marketInfo.name] = 
                                (tradeMetrics.volumeByMarket[marketInfo.name] || 0) + sizeUsd;
                            
                            // Get prices with proper decimal handling
                            const executionPrice = positionTrade.executionPrice 
                                ? bigIntToDecimal(positionTrade.executionPrice, USD_DECIMALS)
                                : 0;
                            
                            const triggerPrice = positionTrade.triggerPrice
                                ? bigIntToDecimal(positionTrade.triggerPrice, USD_DECIMALS)
                                : 0;
                            
                            const price = executionPrice || triggerPrice;
                            
                            // Calculate slippage if both prices available
                            let slippage = 0;
                            if (triggerPrice > 0 && executionPrice > 0) {
                                slippage = Math.abs(executionPrice - triggerPrice) / triggerPrice * 100;
                                tradeMetrics.slippageAnalysis.total += slippage;
                                tradeMetrics.slippageAnalysis.count++;
                            }
                            
                            // Calculate comprehensive PnL metrics
                            let pnlUsd = 0;
                            let pnlPercentage = 0;
                            let realizedPnl = 0;
                            let unrealizedPnl = 0;
                            
                            if (positionTrade.pnlUsd) {
                                pnlUsd = bigIntToDecimal(positionTrade.pnlUsd, USD_DECIMALS);
                                realizedPnl = pnlUsd; // For closed positions, this is realized
                                
                                // Calculate PnL percentage based on collateral
                                const collateralUsd = bigIntToDecimal(
                                    positionTrade.initialCollateralDeltaAmount || 0n,
                                    positionTrade.initialCollateralToken.decimals
                                ) * (positionTrade.initialCollateralToken.prices?.maxPrice ?
                                    bigIntToDecimal(positionTrade.initialCollateralToken.prices.maxPrice, USD_DECIMALS) : 1);
                                
                                if (collateralUsd > 0) {
                                    pnlPercentage = (pnlUsd / collateralUsd) * 100;
                                }
                                
                                // Update comprehensive statistics
                                tradeMetrics.totalPnl += pnlUsd;
                                tradeMetrics.profitByMarket[marketInfo.name] = 
                                    (tradeMetrics.profitByMarket[marketInfo.name] || 0) + pnlUsd;
                                
                                if (pnlUsd > 0) {
                                    tradeMetrics.winCount++;
                                    tradeMetrics.totalWins += pnlUsd;
                                    tradeMetrics.maxWin = Math.max(tradeMetrics.maxWin, pnlUsd);
                                } else if (pnlUsd < 0) {
                                    tradeMetrics.lossCount++;
                                    tradeMetrics.totalLosses += Math.abs(pnlUsd);
                                    tradeMetrics.maxLoss = Math.min(tradeMetrics.maxLoss, pnlUsd);
                                }
                            }
                            
                            // Calculate comprehensive fees
                            const fees = {
                                positionFee: positionTrade.positionFeeAmount 
                                    ? bigIntToDecimal(positionTrade.positionFeeAmount, USD_DECIMALS) 
                                    : 0,
                                borrowingFee: positionTrade.borrowingFeeAmount 
                                    ? bigIntToDecimal(positionTrade.borrowingFeeAmount, USD_DECIMALS) 
                                    : 0,
                                fundingFee: positionTrade.fundingFeeAmount 
                                    ? bigIntToDecimal(positionTrade.fundingFeeAmount, USD_DECIMALS) 
                                    : 0,
                                uiFee: positionTrade.uiFeeAmount 
                                    ? bigIntToDecimal(positionTrade.uiFeeAmount, USD_DECIMALS) 
                                    : 0
                            };
                            
                            const totalFees = fees.positionFee + fees.borrowingFee + fees.fundingFee + fees.uiFee;
                            tradeMetrics.totalFees += totalFees;
                            
                            // Calculate theoretical liquidation price for this trade
                            let liquidationPrice = null;
                            let distanceToLiquidation = null;
                            
                            if (positionTrade.sizeDeltaUsd && positionTrade.initialCollateralDeltaAmount) {
                                try {
                                    const sizeInTokens = convertToTokenAmount(
                                        positionTrade.sizeDeltaUsd,
                                        positionTrade.indexToken.decimals,
                                        positionTrade.indexToken.prices?.maxPrice || 0n
                                    );
                                    
                                    const collateralUsd = convertToUsd(
                                        positionTrade.initialCollateralDeltaAmount,
                                        positionTrade.initialCollateralToken.decimals,
                                        positionTrade.initialCollateralToken.prices?.maxPrice || 0n
                                    );
                                    
                                    if (!sizeInTokens || !collateralUsd) {
                                        throw new Error("Failed to convert values");
                                    }
                                    
                                    const collateralAmount = positionTrade.initialCollateralDeltaAmount;
                                    const isSameCollateralAsIndex = positionTrade.initialCollateralToken.address === positionTrade.indexToken.address;
                                    
                                    const liquidationPriceRaw = calculateLiquidationPrice({
                                        sizeInUsd: positionTrade.sizeDeltaUsd,
                                        sizeInTokens,
                                        collateralAmount,
                                        collateralUsd,
                                        markPrice: positionTrade.indexToken.prices?.maxPrice || 0n,
                                        indexTokenDecimals: positionTrade.indexToken.decimals,
                                        collateralTokenDecimals: positionTrade.initialCollateralToken.decimals,
                                        isLong,
                                        minCollateralFactor: marketInfo.minCollateralFactor || 1000n,
                                        pendingBorrowingFeesUsd: 0n, // Not available in historical trade data
                                        pendingFundingFeesUsd: 0n,   // Not available in historical trade data
                                        isSameCollateralAsIndex
                                    });
                                    
                                    if (liquidationPriceRaw) {
                                        liquidationPrice = bigIntToDecimal(liquidationPriceRaw, USD_DECIMALS);
                                        if (price > 0) {
                                            distanceToLiquidation = Math.abs(price - liquidationPrice) / price * 100;
                                        }
                                    }
                                } catch (error) {
                                    console.warn("Failed to calculate liquidation price for trade:", error);
                                }
                            }
                            
                            // Calculate leverage used
                            const collateralAmount = bigIntToDecimal(
                                positionTrade.initialCollateralDeltaAmount || 0n,
                                positionTrade.initialCollateralToken.decimals
                            );
                            
                            const collateralUsdValue = collateralAmount * 
                                (positionTrade.initialCollateralToken.prices?.maxPrice ? 
                                    bigIntToDecimal(positionTrade.initialCollateralToken.prices.maxPrice, USD_DECIMALS) : 1);
                            
                            const leverage = collateralUsdValue > 0 ? sizeUsd / collateralUsdValue : 0;
                            
                            // Calculate ROI (Return on Investment)
                            const roi = collateralUsdValue > 0 ? (pnlUsd / collateralUsdValue) * 100 : 0;
                            
                            // Add enhanced trade to simplified trades array
                            simplifiedTrades.push({
                                ...baseTradeInfo,
                                type: 'Position',
                                market: marketInfo.name,
                                marketAddress: positionTrade.marketAddress,
                                indexToken,
                                side,
                                size: '$' + sizeUsd.toFixed(2),
                                executionPrice: '$' + executionPrice.toFixed(6),
                                triggerPrice: triggerPrice > 0 ? '$' + triggerPrice.toFixed(6) : 'N/A',
                                slippage: slippage > 0 ? slippage.toFixed(4) + '%' : 'N/A',
                                collateral: {
                                    token: positionTrade.initialCollateralToken.symbol,
                                    amount: collateralAmount.toFixed(6),
                                    usdValue: '$' + collateralUsdValue.toFixed(2)
                                },
                                leverage: leverage.toFixed(2) + 'x',
                                pnl: {
                                    usd: '$' + pnlUsd.toFixed(2),
                                    percentage: pnlPercentage.toFixed(2) + '%',
                                    realized: '$' + realizedPnl.toFixed(2),
                                    unrealized: '$' + unrealizedPnl.toFixed(2)
                                },
                                roi: roi.toFixed(2) + '%',
                                fees: {
                                    ...fees,
                                    total: '$' + totalFees.toFixed(4)
                                },
                                liquidationPrice: liquidationPrice ? '$' + liquidationPrice.toFixed(6) : 'N/A',
                                distanceToLiquidation: distanceToLiquidation ? distanceToLiquidation.toFixed(2) + '%' : 'N/A',
                                action: getTradeActionDescription(trade.eventName, trade.orderType, isLong),
                                riskLevel: leverage > 10 ? 'High' : leverage > 5 ? 'Medium' : 'Low'
                            });
                        } 
                        // Process swap trades with enhanced analysis
                        else if ('targetCollateralToken' in trade) {
                            const swapTrade = trade;
                            
                            const fromToken = swapTrade.initialCollateralToken;
                            const toToken = swapTrade.targetCollateralToken;
                            
                            const amountIn = bigIntToDecimal(
                                swapTrade.initialCollateralDeltaAmount, 
                                fromToken.decimals
                            );
                            
                            const amountOut = swapTrade.executionAmountOut 
                                ? bigIntToDecimal(swapTrade.executionAmountOut, toToken.decimals)
                                : 0;
                            
                            // Calculate swap efficiency
                            const fromPriceUsd = fromToken.prices?.maxPrice ? 
                                bigIntToDecimal(fromToken.prices.maxPrice, USD_DECIMALS) : 0;
                            const toPriceUsd = toToken.prices?.maxPrice ? 
                                bigIntToDecimal(toToken.prices.maxPrice, USD_DECIMALS) : 0;
                            
                            const expectedAmountOut = fromPriceUsd > 0 && toPriceUsd > 0 ? 
                                (amountIn * fromPriceUsd) / toPriceUsd : 0;
                            
                            const swapEfficiency = expectedAmountOut > 0 ? 
                                (amountOut / expectedAmountOut) * 100 : 0;
                            
                            const swapVolumeUsd = amountIn * fromPriceUsd;
                            tradeMetrics.totalVolume += swapVolumeUsd;
                            
                            // Add enhanced swap to simplified trades array
                            simplifiedTrades.push({
                                ...baseTradeInfo,
                                type: 'Swap',
                                fromToken: fromToken.symbol,
                                toToken: toToken.symbol,
                                amountIn: amountIn.toFixed(6),
                                amountOut: amountOut.toFixed(6),
                                volumeUsd: '$' + swapVolumeUsd.toFixed(2),
                                expectedAmountOut: expectedAmountOut.toFixed(6),
                                swapEfficiency: swapEfficiency.toFixed(2) + '%',
                                priceImpact: (100 - swapEfficiency).toFixed(2) + '%',
                                action: getTradeActionDescription(trade.eventName, trade.orderType, false)
                            });
                        }
                    } catch (err) {
                        console.error("Error processing trade:", err);
                        // Continue to next trade
                    }
                });
                
                // Calculate comprehensive performance metrics
                const tradeCount = simplifiedTrades.length;
                const winRate = tradeCount > 0 ? (tradeMetrics.winCount / tradeCount) * 100 : 0;
                const averageProfit = tradeMetrics.winCount > 0 ? tradeMetrics.totalWins / tradeMetrics.winCount : 0;
                const averageLoss = tradeMetrics.lossCount > 0 ? tradeMetrics.totalLosses / tradeMetrics.lossCount : 0;
                const profitFactor = tradeMetrics.totalLosses > 0 ? tradeMetrics.totalWins / tradeMetrics.totalLosses : 
                    tradeMetrics.totalWins > 0 ? Infinity : 0;
                
                const averageSlippage = tradeMetrics.slippageAnalysis.count > 0 ? 
                    tradeMetrics.slippageAnalysis.total / tradeMetrics.slippageAnalysis.count : 0;
                
                const netPnl = tradeMetrics.totalPnl - tradeMetrics.totalFees;
                const feeRatio = tradeMetrics.totalVolume > 0 ? (tradeMetrics.totalFees / tradeMetrics.totalVolume) * 100 : 0;
                
                // Calculate Sharpe-like ratio (simplified)
                const returns = simplifiedTrades
                    .filter(t => t.type === 'Position' && t.pnl?.usd)
                    .map(t => parseFloat(t.pnl.usd.replace('$', '')));
                
                const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
                const returnStdDev = returns.length > 1 ? 
                    Math.sqrt(returns.reduce((acc, ret) => acc + Math.pow(ret - avgReturn, 2), 0) / (returns.length - 1)) : 0;
                
                const riskAdjustedReturn = returnStdDev > 0 ? avgReturn / returnStdDev : 0;
                
                // Update memory with comprehensive data
                let memory = ctx.memory as GmxMemory;
                memory = {
                    ...memory,
                    trades: simplifiedTrades,
                    totalPnl: tradeMetrics.totalPnl,
                    winRate: winRate,
                    averageProfit: averageProfit,
                    averageLoss: averageLoss,
                    currentTask: "🏆 Analyzing competition performance metrics",
                    lastResult: `Retrieved trading history with ${simplifiedTrades.length} trades, total PnL: ${tradeMetrics.totalPnl.toFixed(2)}, win rate: ${winRate}%`
                }
                return {
                    success: true,
                    message: `Retrieved ${simplifiedTrades.length} trades with comprehensive analytics from ${new Date((data.fromTxTimestamp || lastYear) * 1000).toLocaleDateString()} to ${new Date((data.toTxTimestamp || now) * 1000).toLocaleDateString()}`,
                    trades: simplifiedTrades,
                    analytics: {
                        basicMetrics: {
                            totalPnl: '$' + tradeMetrics.totalPnl.toFixed(2),
                            netPnl: '$' + netPnl.toFixed(2),
                            totalVolume: '$' + tradeMetrics.totalVolume.toFixed(2),
                            totalFees: '$' + tradeMetrics.totalFees.toFixed(2),
                            feeRatio: feeRatio.toFixed(3) + '%',
                            winRate: winRate.toFixed(2) + '%',
                            profitFactor: profitFactor === Infinity ? '∞' : profitFactor.toFixed(2),
                            tradeCount,
                            winCount: tradeMetrics.winCount,
                            lossCount: tradeMetrics.lossCount
                        },
                        advancedMetrics: {
                            averageProfit: '$' + averageProfit.toFixed(2),
                            averageLoss: '$' + averageLoss.toFixed(2),
                            maxWin: '$' + tradeMetrics.maxWin.toFixed(2),
                            maxLoss: '$' + tradeMetrics.maxLoss.toFixed(2),
                            averageSlippage: averageSlippage.toFixed(4) + '%',
                            riskAdjustedReturn: riskAdjustedReturn.toFixed(2),
                            returnVolatility: returnStdDev.toFixed(2)
                        },
                        portfolioAnalysis: {
                            marketsTraded: Array.from(tradeMetrics.marketsTraded),
                            profitByMarket: Object.entries(tradeMetrics.profitByMarket)
                                .map(([market, profit]) => ({ market, profit: '$' + profit.toFixed(2) }))
                                .sort((a, b) => parseFloat(b.profit.replace('$', '')) - parseFloat(a.profit.replace('$', ''))),
                            volumeByMarket: Object.entries(tradeMetrics.volumeByMarket)
                                .map(([market, volume]) => ({ market, volume: '$' + volume.toFixed(2) }))
                                .sort((a, b) => parseFloat(b.volume.replace('$', '')) - parseFloat(a.volume.replace('$', ''))),
                            dailyActivity: Object.entries(tradeMetrics.tradesByDay)
                                .map(([date, count]) => ({ date, trades: count }))
                                .sort((a, b) => a.date.localeCompare(b.date))
                        },
                        tradingPeriod: {
                            from: new Date((data.fromTxTimestamp || lastYear) * 1000).toLocaleDateString(),
                            to: new Date((data.toTxTimestamp || now) * 1000).toLocaleDateString(),
                            durationDays: Math.ceil(((data.toTxTimestamp || now) - (data.fromTxTimestamp || lastYear)) / (24 * 60 * 60))
                        }
                    }
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to fetch trade history"
                };
            }
        }
    }),

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🧠 SYNTH MARKET INTELLIGENCE & PREDICTIONS
    // ═══════════════════════════════════════════════════════════════════════════════

    // Current Leaderboard - Top Performing Miners
    action({
        name: "get_synth_leaderboard",
        description: "Get current leaderboard of top-performing Synth miners with performance metrics",
        async handler(data, ctx, agent) {
            try {
                const response = await fetch('https://dashboard.synthdata.co/api/leaderboard/');

                if (!response.ok) {
                    throw new Error(`Synth API error: ${response.status} ${response.statusText}`);
                }

                const leaderboard = await response.json();
                
                let memory = ctx.memory as GmxMemory;
                
                // Slice to get only the top 5 miners
                const limitedLeaderboard = Array.isArray(leaderboard) ? leaderboard.slice(0, 5) : leaderboard;
                
                // Update memory with leaderboard data
                memory = {
                    ...memory,
                    synthLeaderboard: {
                        miners: limitedLeaderboard,
                        lastUpdated: new Date().toISOString(),
                        topMinerIds: limitedLeaderboard.map((miner: any) => miner.uid || miner.id).filter(Boolean)
                    },
                    currentTask: "🤖 Fetching top AI miners for predictions",
                    lastResult: `Retrieved Synth leaderboard with ${limitedLeaderboard.length || 0} miners`
                };

                return {
                    success: true,
                    message: `Retrieved Synth miner leaderboard`,
                    data: {
                        leaderboard: limitedLeaderboard,
                        timestamp: new Date().toISOString(),
                        metrics_included: ["rank", "stake", "incentive", "performance"],
                        source: "synth_network"
                    }
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to fetch Synth leaderboard"
                };
            }
        }
    }),

    // Latest Prediction Rates - Real-time Market Intelligence
    action({
        name: "get_latest_predictions",
        description: "Get real-time prediction data from specific Synth miners for current market intelligence",
        schema: z.object({
            asset: z.enum(["BTC", "ETH"]).default("BTC").describe("Asset symbol - must be exactly 'BTC' or 'ETH' (case sensitive)"),
            miner: z.number().describe("Miner ID as integer (required - get active miner IDs from get_synth_leaderboard first, e.g. 123)")
        }),
        async handler(data, ctx, agent) {
            try {
                // Miner ID is required for this endpoint
                if (!data.miner || data.miner <= 0) {
                    throw new Error('Valid Miner ID is required. Please call get_synth_leaderboard first to get active miner IDs.');
                }
                let url = `https://dashboard.synthdata.co/api/predictionLatest/?asset=${data.asset}&miner=${data.miner}`;

                const response = await fetch(url, {
                    headers: {
                        'Authorization': `Apikey ${env.SYNTH_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Synth API error: ${response.status} ${response.statusText} - ${errorText}`);
                }

                const predictions = await response.json();
                // Extract the next 144 predictions from prediction array
                // Based on API structure: predictions[0].prediction contains array of prediction values
                const predictionData = predictions[0].prediction[0];

                let memory = ctx.memory as GmxMemory;

                // Update memory with latest prediction data - ensure synthPredictions exists
                if (!memory.synthPredictions) {
                    memory.synthPredictions = {};
                }
                if (!memory.synthPredictions[data.asset]) {
                    memory.synthPredictions[data.asset] = {};
                }
                memory.synthPredictions[data.asset][data.miner] = {
                    predictions: predictionData,
                    lastUpdated: new Date().toISOString(),
                    asset: data.asset,
                    minerId: data.miner
                };
                
                memory = {
                    ...memory,
                    currentTask: "🎯 Processing AI signals for entry opportunities",
                    lastResult: `Retrieved ${predictionData.length} ${data.asset} predictions from miner ${data.miner}`
                };

                return {
                    success: true,
                    message: `Retrieved ${predictionData.length} latest ${data.asset} predictions from miner ${data.miner}`,
                    data: {
                        asset: data.asset,
                        miner: data.miner,
                        predictions: predictionData,
                        totalPredictions: predictionData.length,
                        quality: "real_time",
                        source: "synth_selected_miners"
                    }
                };
            } catch (error) {
                // Enhanced error handling for API issues
                const errorMessage = error instanceof Error ? error.message : String(error);
                
                // Handle specific API errors
                if (errorMessage.includes('500') && errorMessage.includes('Failed to fetch liquidation data')) {
                    return {
                        success: false,
                        error: errorMessage,
                        message: "Synth API is experiencing server issues (500 error). This may be temporary - try again later.",
                        suggestion: "Check if the miner ID is valid by calling get_synth_leaderboard first"
                    };
                }
                
                return {
                    success: false,
                    error: errorMessage,
                    message: "Failed to fetch latest predictions from Synth",
                    suggestion: "Verify the asset (BTC/ETH) and miner ID are correct"
                };
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
                // Use SDK's internal cancelOrders method (no manual wallet client needed)
                const result = await sdk.orders.cancelOrders(data.orderKeys);

                let memory = ctx.memory as GmxMemory;
                
                // Update memory with cancellation info
                memory = {
                    ...memory,
                    currentTask: "❌ Cancelling stale scalp orders",
                    lastResult: `Cancelled ${data.orderKeys.length} order(s)`
                };

                return {
                    success: true,
                    message: `Successfully cancelled ${data.orderKeys.length} order(s)`,
                    orderKeys: data.orderKeys,
                    transactionHash: result?.transactionHash || result?.hash || null,
                    details: {
                        cancelledOrderCount: data.orderKeys.length,
                        orderKeys: data.orderKeys
                    }
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to cancel orders"
                };
            }
        }
    }),

    // Helper: Open Long Position (Simplified)
    action({
        name: "open_long_position",
        description: "Open a long position using GMX SDK helper function with simplified parameters",
        schema: z.object({
            marketAddress: z.string().describe("Market token address from getMarketsInfo response (e.g. '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336' for ETH/USD market)"),
            payAmount: z.string().optional().describe("Amount to pay in BigInt string format using token's native decimals (e.g. '1000000' for 1 USDC with 6 decimals). Use this for collateral-based position sizing."),
            payTokenAddress: z.string().describe("ERC20 token contract address you're paying with (e.g. '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' for USDC)"),
            collateralTokenAddress: z.string().describe("ERC20 token contract address for collateral (e.g. '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' for WETH)"),
            allowedSlippageBps: z.number().optional().default(100).describe("Allowed slippage in basis points (100 = 1%, range: 50-500, default: 100)"),
            leverage: z.string().optional().describe("Leverage in basis points as BigInt string (e.g. '50000' = 5x, '10000' = 1x, '200000' = 20x). Optional for helper function."),
        }),
        async handler(data, ctx, agent) {
            try {
                // Get market and token data for proper fee calculation
                const { marketsInfoData, tokensData } = await sdk.markets.getMarketsInfo().catch(error => {
                    throw new Error(`Failed to get market data: ${error.message || error}`);
                });
                
                if (!marketsInfoData || !tokensData) {
                    throw new Error("Invalid market data received");
                }
                
                // Validate market exists
                const marketInfo = marketsInfoData[data.marketAddress];
                if (!marketInfo) {
                    throw new Error(`Market not found: ${data.marketAddress}`);
                }
                
                // Validate tokens exist
                const payToken = tokensData[data.payTokenAddress];
                const collateralToken = tokensData[data.collateralTokenAddress];
                
                if (!payToken) {
                    throw new Error(`Pay token not found: ${data.payTokenAddress}`);
                }
                
                if (!collateralToken) {
                    throw new Error(`Collateral token not found: ${data.collateralTokenAddress}`);
                }
                
                // Prepare parameters for helper function
                const helperParams: any = {
                    marketAddress: data.marketAddress,
                    payTokenAddress: data.payTokenAddress,
                    collateralTokenAddress: data.collateralTokenAddress,
                    allowedSlippageBps: data.allowedSlippageBps || 100,
                };

                // Add either payAmount or sizeAmount (SDK expects BigInt objects)
                if (data.payAmount) {
                    helperParams.payAmount = BigInt(data.payAmount);
                } else if (data.sizeAmount) {
                    helperParams.sizeAmount = BigInt(data.sizeAmount);
                }

                // Add optional parameters (SDK expects BigInt objects)
                if (data.leverage) {
                    helperParams.leverage = BigInt(data.leverage);
                }


                // Use the simplified helper function with enhanced error handling
                const result = await sdk.orders.long(helperParams).catch(error => {
                    // Enhanced error parsing for trading operations
                    let errorMessage = "Failed to open long position";
                    
                    if (error?.message?.includes("insufficient")) {
                        errorMessage = "Insufficient balance or allowance";
                    } else if (error?.message?.includes("slippage")) {
                        errorMessage = "Slippage tolerance exceeded";
                    } else if (error?.message?.includes("leverage")) {
                        errorMessage = "Invalid leverage amount";
                    } else if (error?.message?.includes("market")) {
                        errorMessage = "Market temporarily unavailable";
                    } else if (error?.message) {
                        errorMessage = error.message;
                    }
                    
                    throw new Error(errorMessage);
                });

                let memory = ctx.memory as GmxMemory;
                
                // Update memory with order info
                const leverageX = data.leverage ? parseFloat(data.leverage) / 10000 : 'Auto';
                const isLimitOrder = !!data.limitPrice;
                memory = {
                    ...memory,
                    currentTask: "🚀 Executing LONG scalp entry",
                    lastResult: `Opened long ${isLimitOrder ? 'limit' : 'market'} position${typeof leverageX === 'number' ? ` with ${leverageX}x leverage` : ''}`
                }

                return {
                    success: true,
                    message: `Successfully opened long ${isLimitOrder ? 'limit' : 'market'} position`,
                    orderDetails: {
                        marketAddress: data.marketAddress,
                        direction: 'LONG',
                        orderType: isLimitOrder ? 'Limit' : 'Market',
                        payAmount: data.payAmount || null,
                        payToken: data.payTokenAddress,
                        collateralToken: data.collateralTokenAddress,
                        leverage: typeof leverageX === 'number' ? `${leverageX}x` : leverageX,
                        slippage: `${(data.allowedSlippageBps || 100) / 100}%`
                    },
                    transactionHash: result?.transactionHash || null
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to open long position"
                };
            }
        }
    }),

    // Helper: Open Short Position (Simplified)
    action({
        name: "open_short_position", 
        description: "Open a short position using GMX SDK helper function with simplified parameters",
        schema: z.object({
            marketAddress: z.string().describe("Market token address from getMarketsInfo response (e.g. '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336' for ETH/USD market)"),
            payAmount: z.string().optional().describe("Amount to pay in BigInt string format using token's native decimals (e.g. '1000000' for 1 USDC with 6 decimals). Use this for collateral-based position sizing."),
            payTokenAddress: z.string().describe("ERC20 token contract address you're paying with (e.g. '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' for USDC)"),
            collateralTokenAddress: z.string().describe("ERC20 token contract address for collateral (e.g. '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' for WETH)"),
            allowedSlippageBps: z.number().optional().default(100).describe("Allowed slippage in basis points (100 = 1%, range: 50-500, default: 100)"),
            leverage: z.string().optional().describe("Leverage in basis points as BigInt string (e.g. '50000' = 5x, '10000' = 1x, '200000' = 20x). Optional for helper function."),
        }),
        async handler(data, ctx, agent) {
            try {
                // Get market and token data for validation and proper error handling
                const { marketsInfoData, tokensData } = await sdk.markets.getMarketsInfo().catch(error => {
                    throw new Error(`Failed to get market data: ${error.message || error}`);
                });
                
                if (!marketsInfoData || !tokensData) {
                    throw new Error("Invalid market data received");
                }
                
                // Validate market and tokens exist
                const marketInfo = marketsInfoData[data.marketAddress];
                if (!marketInfo) {
                    throw new Error(`Market not found: ${data.marketAddress}`);
                }
                
                const payToken = tokensData[data.payTokenAddress];
                const collateralToken = tokensData[data.collateralTokenAddress];
                
                if (!payToken || !collateralToken) {
                    throw new Error("Invalid token addresses provided");
                }
                
                // Prepare parameters for helper function
                const helperParams: any = {
                    marketAddress: data.marketAddress,
                    payTokenAddress: data.payTokenAddress,
                    collateralTokenAddress: data.collateralTokenAddress,
                    allowedSlippageBps: data.allowedSlippageBps || 100,
                };

                // Add either payAmount or sizeAmount (SDK expects BigInt objects)
                if (data.payAmount) {
                    helperParams.payAmount = BigInt(data.payAmount);
                } else if (data.sizeAmount) {
                    helperParams.sizeAmount = BigInt(data.sizeAmount);
                }

                // Add optional parameters (SDK expects BigInt objects)
                if (data.leverage) {
                    helperParams.leverage = BigInt(data.leverage);
                }
                if (data.limitPrice) {
                    helperParams.limitPrice = BigInt(data.limitPrice);
                }
                if (data.referralCodeForTxn) {
                    helperParams.referralCodeForTxn = data.referralCodeForTxn;
                }


                // Use the simplified helper function with enhanced error handling
                const result = await sdk.orders.short(helperParams).catch(error => {
                    // Enhanced error parsing for short positions
                    let errorMessage = "Failed to open short position";
                    
                    if (error?.message?.includes("insufficient")) {
                        errorMessage = "Insufficient balance or allowance";
                    } else if (error?.message?.includes("slippage")) {
                        errorMessage = "Slippage tolerance exceeded";
                    } else if (error?.message?.includes("leverage")) {
                        errorMessage = "Invalid leverage amount";
                    } else if (error?.message?.includes("borrowing")) {
                        errorMessage = "Borrowing capacity exceeded";
                    } else if (error?.message?.includes("Execute order simulation failed")) {
                        errorMessage = "Market conditions unfavorable - try reducing position size or different market";
                    } else if (error?.message?.includes("liquidity")) {
                        errorMessage = "Insufficient market liquidity for order size";
                    } else if (error?.message?.includes("price impact")) {
                        errorMessage = "Price impact too high - reduce position size or increase slippage";
                    } else if (error?.message?.includes("market")) {
                        errorMessage = "Market temporarily unavailable or paused";
                    } else if (error?.message) {
                        errorMessage = error.message;
                    }
                    
                    throw new Error(errorMessage);
                });

                let memory = ctx.memory as GmxMemory;
                
                // Update memory with order info
                const leverageX = data.leverage ? parseFloat(data.leverage) / 10000 : 'Auto';
                const isLimitOrder = !!data.limitPrice;
                memory = {
                    ...memory,
                    currentTask: "📉 Executing SHORT scalp entry",
                    lastResult: `Opened short ${isLimitOrder ? 'limit' : 'market'} position${typeof leverageX === 'number' ? ` with ${leverageX}x leverage` : ''}`
                }

                return {
                    success: true,
                    message: `Successfully opened short ${isLimitOrder ? 'limit' : 'market'} position`,
                    orderDetails: {
                        marketAddress: data.marketAddress,
                        direction: 'SHORT',
                        orderType: isLimitOrder ? 'Limit' : 'Market',
                        payAmount: data.payAmount || null,
                        sizeAmount: data.sizeAmount || null,
                        payToken: data.payTokenAddress,
                        collateralToken: data.collateralTokenAddress,
                        leverage: typeof leverageX === 'number' ? `${leverageX}x` : leverageX,
                        limitPrice: data.limitPrice || null,
                        slippage: `${(data.allowedSlippageBps || 100) / 100}%`
                    },
                    transactionHash: result?.transactionHash || null
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to open short position"
                };
            }
        }
    }),

    // Close Long Position
    action({
        name: "close_long_position",
        description: "Close an existing long position fully or partially. Use get_positions first to find the position details.",
        schema: z.object({
            marketAddress: z.string().describe("Market token address from get_positions response - must be the exact marketAddress field"),
            sizeAmount: z.string().describe("Position size to close in USD as BigInt string (30 decimals). For full close, use the total position size value (30 decimals). For partial close, use a smaller amount (30 decimals)."),
            receiveTokenAddress: z.string().describe("Token address to receive proceeds in (typically USDC: 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 or the collateral token)"),
            allowedSlippageBps: z.number().optional().describe("Allowed slippage in basis points (default: 100 = 1%)")
        }),
        async handler(data, ctx, agent) {
            try {
                let memory = ctx.memory as GmxMemory;
                
                // Get required market and token data
                const { marketsInfoData, tokensData } = await sdk.markets.getMarketsInfo();
                
                if (!marketsInfoData || !tokensData) {
                    throw new Error("Failed to get market and token data");
                }
                
                // Validate market exists
                const marketInfo = marketsInfoData[data.marketAddress];
                if (!marketInfo) {
                    throw new Error(`Market not found: ${data.marketAddress}. Please use get_positions to find valid market addresses.`);
                }
                
                // Get current positions to validate the close request
                const positionsResult = await sdk.positions.getPositions({
                    marketsData: marketsInfoData,
                    tokensData: tokensData,
                    start: 0,
                    end: 1000,
                });
                
                // Find the specific long position for this market
                const positions = positionsResult.positionsData ? Object.values(positionsResult.positionsData) : [];
                const longPosition = positions.find((pos: any) => 
                    pos.marketAddress === data.marketAddress && pos.isLong === true
                );
                
                if (!longPosition) {
                    throw new Error(`No long position found for market ${marketInfo.name}. Use get_positions to see current positions.`);
                }
                
                // Validate size amount
                const sizeToClose = BigInt(data.sizeAmount);
                if (sizeToClose > longPosition.sizeInUsd) {
                    throw new Error(`Size to close (${data.sizeAmount}) exceeds position size (${longPosition.sizeInUsd.toString()})`);
                }
                
                // Validate receive token
                const receiveToken = tokensData[data.receiveTokenAddress];
                if (!receiveToken) {
                    throw new Error(`Invalid receive token address: ${data.receiveTokenAddress}`);
                }
                
                // Get index token data
                const indexToken = tokensData[marketInfo.indexTokenAddress];
                const collateralToken = tokensData[longPosition.collateralTokenAddress];
                
                if (!indexToken || !collateralToken) {
                    throw new Error("Failed to get token data for position");
                }
                
                // Calculate size in tokens
                const markPrice = indexToken.prices?.maxPrice || 0n;
                const sizeInTokens = (sizeToClose * (10n ** BigInt(indexToken.decimals))) / markPrice;
                
                // Calculate acceptable price with slippage
                const slippageBps = BigInt(data.allowedSlippageBps || 100);
                const acceptablePrice = markPrice - (markPrice * slippageBps / 10000n);
                
                // Calculate collateral to remove proportionally
                const closeRatio = (sizeToClose * 10000n) / longPosition.sizeInUsd;
                const collateralDeltaAmount = (longPosition.collateralAmount * closeRatio) / 10000n;
                
                // Prepare decrease amounts for execution fee calculation
                const decreaseAmounts = {
                    sizeDeltaUsd: sizeToClose,
                    sizeDeltaInTokens: sizeInTokens,
                    collateralDeltaAmount: collateralDeltaAmount,
                    acceptablePrice,
                    triggerPrice: undefined, // Market order
                    decreaseSwapType: 0, // No swap
                    triggerOrderType: undefined // Market order
                };

                // Use the SDK's createDecreaseOrder method (like the SDK's own implementation)
                const result = await sdk.orders.createDecreaseOrder({
                    marketsInfoData,
                    tokensData,
                    marketInfo,
                    decreaseAmounts,
                    collateralToken,
                    allowedSlippage: Number(slippageBps),
                    isLong: true,
                    referralCode: undefined,
                    isTrigger: false // Market order
                }).catch(error => {
                    let errorMessage = "Failed to close long position";
                    
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
                
                // Calculate close percentage
                const closePercentage = Number(closeRatio) / 100;
                const isFullClose = closePercentage >= 99.9;
                
                // Update memory
                memory = {
                    ...memory,
                    currentTask: "📉 Closing LONG position",
                    lastResult: `${isFullClose ? 'Fully' : 'Partially'} closed long position in ${marketInfo.name} (${closePercentage.toFixed(1)}%)`
                };
                
                return {
                    success: true,
                    message: `Successfully ${isFullClose ? 'fully' : 'partially'} closed long position`,
                    closeDetails: {
                        market: marketInfo.name,
                        direction: 'LONG',
                        closeType: isFullClose ? 'Full' : 'Partial',
                        sizeClosedUsd: formatUsdAmount(sizeToClose, 2),
                        sizeClosedTokens: formatTokenAmount(sizeInTokens, indexToken.decimals, 6),
                        collateralReturned: formatTokenAmount(collateralDeltaAmount, collateralToken.decimals, 6),
                        receiveToken: receiveToken.symbol,
                        closePercentage: `${closePercentage.toFixed(1)}%`,
                        slippage: `${(data.allowedSlippageBps || 100) / 100}%`
                    },
                    positionRemaining: !isFullClose ? {
                        sizeUsd: formatUsdAmount(longPosition.sizeInUsd - sizeToClose, 2),
                        collateral: formatTokenAmount(longPosition.collateralAmount - collateralDeltaAmount, collateralToken.decimals, 6)
                    } : null,
                    transactionHash: result?.transactionHash || null
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to close long position"
                };
            }
        }
    }),

    // Close Short Position
    action({
        name: "close_short_position", 
        description: "Close an existing short position fully or partially. Use get_positions first to find the position details.",
        schema: z.object({
            marketAddress: z.string().describe("Market token address from get_positions response - must be the exact marketAddress field"),
            sizeAmount: z.string().describe("Position size to close in USD as BigInt string (30 decimals). For full close, use the sizeInUsd from get_positions raw data. For partial close, use a smaller amount."),
            receiveTokenAddress: z.string().describe("Token address to receive proceeds in (typically USDC: 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 or the collateral token)"),
            allowedSlippageBps: z.number().optional().describe("Allowed slippage in basis points (default: 100 = 1%)")
        }),
        async handler(data, ctx, agent) {
            try {
                let memory = ctx.memory as GmxMemory;
                
                // Get required market and token data
                const { marketsInfoData, tokensData } = await sdk.markets.getMarketsInfo();
                
                if (!marketsInfoData || !tokensData) {
                    throw new Error("Failed to get market and token data");
                }
                
                // Validate market exists
                const marketInfo = marketsInfoData[data.marketAddress];
                if (!marketInfo) {
                    throw new Error(`Market not found: ${data.marketAddress}. Please use get_positions to find valid market addresses.`);
                }
                
                // Get current positions to validate the close request
                const positionsResult = await sdk.positions.getPositions({
                    marketsData: marketsInfoData,
                    tokensData: tokensData,
                    start: 0,
                    end: 1000,
                });
                
                // Find the specific short position for this market
                const positions = positionsResult.positionsData ? Object.values(positionsResult.positionsData) : [];
                const shortPosition = positions.find((pos: any) => 
                    pos.marketAddress === data.marketAddress && pos.isLong === false
                );
                
                if (!shortPosition) {
                    throw new Error(`No short position found for market ${marketInfo.name}. Use get_positions to see current positions.`);
                }
                
                // Validate size amount
                const sizeToClose = BigInt(data.sizeAmount);
                if (sizeToClose > shortPosition.sizeInUsd) {
                    throw new Error(`Size to close (${data.sizeAmount}) exceeds position size (${shortPosition.sizeInUsd.toString()})`);
                }
                
                // Validate receive token
                const receiveToken = tokensData[data.receiveTokenAddress];
                if (!receiveToken) {
                    throw new Error(`Invalid receive token address: ${data.receiveTokenAddress}`);
                }
                
                // Get index token data
                const indexToken = tokensData[marketInfo.indexTokenAddress];
                const collateralToken = tokensData[shortPosition.collateralTokenAddress];
                
                if (!indexToken || !collateralToken) {
                    throw new Error("Failed to get token data for position");
                }
                
                // Calculate size in tokens
                const markPrice = indexToken.prices?.minPrice || 0n;
                const sizeInTokens = (sizeToClose * (10n ** BigInt(indexToken.decimals))) / markPrice;
                
                // Calculate acceptable price with slippage (inverse for shorts)
                const slippageBps = BigInt(data.allowedSlippageBps || 100);
                const acceptablePrice = markPrice + (markPrice * slippageBps / 10000n);
                
                // Calculate collateral to remove proportionally
                const closeRatio = (sizeToClose * 10000n) / shortPosition.sizeInUsd;
                const collateralDeltaAmount = (shortPosition.collateralAmount * closeRatio) / 10000n;
                
                // Prepare decrease amounts for execution fee calculation
                const decreaseAmounts = {
                    sizeDeltaUsd: sizeToClose,
                    sizeDeltaInTokens: sizeInTokens,
                    collateralDeltaAmount: collateralDeltaAmount,
                    acceptablePrice,
                    triggerPrice: undefined, // Market order
                    decreaseSwapType: 0, // No swap
                    triggerOrderType: undefined // Market order
                };

                // Use the SDK's createDecreaseOrder method (like the SDK's own implementation)
                const result = await sdk.orders.createDecreaseOrder({
                    marketsInfoData,
                    tokensData,
                    marketInfo,
                    decreaseAmounts,
                    collateralToken,
                    allowedSlippage: Number(slippageBps),
                    isLong: false,
                    referralCode: undefined,
                    isTrigger: false // Market order
                }).catch(error => {
                    let errorMessage = "Failed to close short position";
                    
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
                
                // Calculate close percentage
                const closePercentage = Number(closeRatio) / 100;
                const isFullClose = closePercentage >= 99.9;
                
                // Update memory
                memory = {
                    ...memory,
                    currentTask: "📈 Closing SHORT position",
                    lastResult: `${isFullClose ? 'Fully' : 'Partially'} closed short position in ${marketInfo.name} (${closePercentage.toFixed(1)}%)`
                };
                
                return {
                    success: true,
                    message: `Successfully ${isFullClose ? 'fully' : 'partially'} closed short position`,
                    closeDetails: {
                        market: marketInfo.name,
                        direction: 'SHORT',
                        closeType: isFullClose ? 'Full' : 'Partial',
                        sizeClosedUsd: formatUsdAmount(sizeToClose, 2),
                        sizeClosedTokens: formatTokenAmount(sizeInTokens, indexToken.decimals, 6),
                        collateralReturned: formatTokenAmount(collateralDeltaAmount, collateralToken.decimals, 6),
                        receiveToken: receiveToken.symbol,
                        closePercentage: `${closePercentage.toFixed(1)}%`,
                        slippage: `${(data.allowedSlippageBps || 100) / 100}%`
                    },
                    positionRemaining: !isFullClose ? {
                        sizeUsd: formatUsdAmount(shortPosition.sizeInUsd - sizeToClose, 2),
                        collateral: formatTokenAmount(shortPosition.collateralAmount - collateralDeltaAmount, collateralToken.decimals, 6)
                    } : null,
                    transactionHash: result?.transactionHash || null
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "Failed to close short position"
                };
            }
        }
    }),

    ];
}
