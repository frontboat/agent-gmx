import { bigIntToDecimal, formatTokenAmount, formatUsdAmount, convertToUsd, USD_DECIMALS, getTradeActionDescriptionEnhanced, calculatePerformanceMetrics } from "./gmx-utils";
import { calculatePositionPnl, calculateLeverage, calculateLiquidationPrice, calculatePositionNetValue } from "./gmx-utils";
import { GmxSdk } from "@gmx-io/sdk";
import { SMA, EMA, RSI, MACD, BollingerBands, ATR, Stochastic, WilliamsR, CCI, ADX } from 'technicalindicators';
import type { EnhancedDataCache } from './gmx-cache';

export const get_portfolio_balance_str = async (sdk: GmxSdk, gmxDataCache?: EnhancedDataCache) => {
    // Get tokens data with balances and prices - use cache if available
    const tokensResult = gmxDataCache ? await gmxDataCache.getTokensData() : await sdk.tokens.getTokensData().catch(error => {
        throw new Error(`Failed to get tokens data: ${error.message || error}`);
    });
    const { tokensData } = tokensResult;
    
    // Get markets and positions data
    const marketsResult = gmxDataCache ? await gmxDataCache.getMarketsInfo() : await sdk.markets.getMarketsInfo().catch(error => {
        throw new Error(`Failed to get markets data: ${error.message || error}`);
    });
    const { marketsInfoData } = marketsResult;
    
    if (!tokensData || !marketsInfoData) {
        throw new Error("Failed to get required market and token data");
    }

    // Get positions data - use cache if available
    const positionsResult = gmxDataCache ? await gmxDataCache.getPositions(marketsInfoData, tokensData) : await sdk.positions.getPositions({
        marketsData: marketsInfoData,
        tokensData: tokensData,
        start: 0,
        end: 1000,
    }).catch(error => {
        throw new Error(`Failed to get positions: ${error.message || error}`);
    });

    // Get enhanced positions info for value calculations - use cache if available
    const positionsInfoResult = gmxDataCache ? await gmxDataCache.getPositionsInfo(marketsInfoData, tokensData) : await sdk.positions.getPositionsInfo({
        marketsInfoData,
        tokensData,
        showPnlInLeverage: false
    }).catch(error => {
        throw new Error(`Failed to get positions info: ${error.message || error}`);
    });
    
    // Calculate token balances in USD
    const tokenBalances: Array<{
        symbol: string;
        address: string;
        balance: string;
        usdValue: string;
        price: string;
    }> = [];
    
    let totalTokenValueUsd = 0;
    
    Object.values(tokensData).forEach((token: any) => {
        if (token.balance && token.balance > 0n) {
            const balanceDecimal = bigIntToDecimal(token.balance, token.decimals);
            const price = token.prices?.minPrice ? 
                bigIntToDecimal(token.prices.minPrice, USD_DECIMALS) : 0;
            const usdValue = balanceDecimal * price;
            
            totalTokenValueUsd += usdValue;
            
            tokenBalances.push({
                symbol: token.symbol,
                address: token.address,
                balance: formatTokenAmount(token.balance, token.decimals, 6),
                usdValue: formatUsdAmount(convertToUsd(token.balance, token.decimals, token.prices?.minPrice || 0n) || 0n, 2),
                price: formatUsdAmount(token.prices?.minPrice || 0n, 6)
            });
        }
    });

    // Calculate position values
    const positionValues: Array<{
        marketName: string;
        side: string;
        sizeUsd: string;
        collateralUsd: string;
        pnl: string;
        netValue: string;
        leverage: string;
    }> = [];
    
    let totalPositionValueUsd = 0;
    let totalPositionPnl = 0;
    
    // First try using enhanced positions info data
    let positionsProcessed = false;
    
    if (positionsInfoResult && Object.keys(positionsInfoResult).length > 0) {
        Object.values(positionsInfoResult).forEach((position: any) => {
            const marketInfo = marketsInfoData[position.marketAddress];
            if (!marketInfo) return;
            
            const netValueDecimal = bigIntToDecimal(position.netValue || 0n, USD_DECIMALS);
            const pnlDecimal = bigIntToDecimal(position.pnl || 0n, USD_DECIMALS);
            
            totalPositionValueUsd += netValueDecimal;
            totalPositionPnl += pnlDecimal;
            
            positionValues.push({
                marketName: marketInfo.name,
                side: position.isLong ? 'LONG' : 'SHORT',
                sizeUsd: formatUsdAmount(position.sizeInUsd || 0n, 2),
                collateralUsd: formatUsdAmount(position.collateralUsd || 0n, 2),
                pnl: formatUsdAmount(position.pnl || 0n, 2),
                netValue: formatUsdAmount(position.netValue || 0n, 2),
                leverage: position.leverage ? 
                    `${(Number(position.leverage) / 10000).toFixed(2)}x` : '0x'
            });
        });
        positionsProcessed = true;
    }
    
    // Fallback to raw positions data if enhanced info is empty (same logic as get_positions_str)
    if (!positionsProcessed && positionsResult.positionsData) {
        Object.values(positionsResult.positionsData).forEach((position: any) => {
            const marketInfo = marketsInfoData[position.marketAddress];
            if (!marketInfo) return;
            
            const indexToken = tokensData[marketInfo.indexTokenAddress];
            const collateralToken = tokensData[position.collateralTokenAddress];
            
            if (!indexToken || !collateralToken) return;
            
            // Calculate collateral USD value
            const collateralPrice = position.isLong ?
                collateralToken.prices?.minPrice || 0n :
                collateralToken.prices?.maxPrice || 0n;
            
            const collateralUsd = convertToUsd(
                position.collateralAmount, 
                collateralToken.decimals, 
                collateralPrice
            );
            
            // Calculate PnL using position data and current prices
            const markPrice = position.isLong ? 
                indexToken.prices?.maxPrice || 0n : 
                indexToken.prices?.minPrice || 0n;
            
            const calculatedPnl = calculatePositionPnl({
                sizeInUsd: position.sizeInUsd,
                sizeInTokens: position.sizeInTokens,
                markPrice,
                isLong: position.isLong,
                indexTokenDecimals: indexToken.decimals || 18
            });
            
            const netValue = calculatePositionNetValue({
                collateralUsd,
                pnl: calculatedPnl,
                pendingFundingFeesUsd: position.pendingFundingFeesUsd || 0n,
                pendingBorrowingFeesUsd: position.pendingBorrowingFeesUsd || 0n
            });
            
            const leverage = calculateLeverage({
                sizeInUsd: position.sizeInUsd,
                collateralUsd,
                pnl: calculatedPnl,
                pendingFundingFeesUsd: position.pendingFundingFeesUsd || 0n,
                pendingBorrowingFeesUsd: position.pendingBorrowingFeesUsd || 0n
            });
            
            const netValueDecimal = bigIntToDecimal(netValue || 0n, USD_DECIMALS);
            const pnlDecimal = bigIntToDecimal(calculatedPnl || 0n, USD_DECIMALS);
            
            totalPositionValueUsd += netValueDecimal;
            totalPositionPnl += pnlDecimal;
            
            positionValues.push({
                marketName: marketInfo.name,
                side: position.isLong ? 'LONG' : 'SHORT',
                sizeUsd: formatUsdAmount(position.sizeInUsd || 0n, 2),
                collateralUsd: formatUsdAmount(collateralUsd || 0n, 2),
                pnl: formatUsdAmount(calculatedPnl || 0n, 2),
                netValue: formatUsdAmount(netValue || 0n, 2),
                leverage: leverage ? 
                    `${(Number(leverage) / 10000).toFixed(2)}x` : '0x'
            });
        });
    }

    // Calculate total portfolio value
    const totalPortfolioValue = totalTokenValueUsd + totalPositionValueUsd;
    
    // Sort token balances by USD value (highest first)
    tokenBalances.sort((a, b) => 
        parseFloat(b.usdValue.replace(/[$,]/g, '')) - parseFloat(a.usdValue.replace(/[$,]/g, ''))
    );

    // Calculate portfolio allocation
    const tokenAllocation = totalPortfolioValue > 0 ? 
        (totalTokenValueUsd / totalPortfolioValue) * 100 : 0;
    const positionAllocation = totalPortfolioValue > 0 ? 
        (totalPositionValueUsd / totalPortfolioValue) * 100 : 0;

    let output = `💰 PORTFOLIO OVERVIEW\n`;
    output += `├─ Total Value: $${totalPortfolioValue.toFixed(2)}\n`;
    output += `├─ Token Holdings: $${totalTokenValueUsd.toFixed(2)} (${tokenAllocation.toFixed(1)}%)\n`;
    output += `├─ Position Value: $${totalPositionValueUsd.toFixed(2)} (${positionAllocation.toFixed(1)}%)\n`;
    output += `├─ Unrealized PnL: $${totalPositionPnl.toFixed(2)}\n`;
    output += `└─ Active Positions: ${positionValues.length}\n\n`;
    
    // Position breakdown for trading decisions
    if (positionValues.length > 0) {
        output += `📈 POSITION BREAKDOWN\n`;
        positionValues.forEach((pos, index) => {
            const isLast = index === positionValues.length - 1;
            const prefix = isLast ? '└─' : '├─';
            output += `${prefix} ${pos.marketName} ${pos.side}: ${pos.netValue} | PnL: ${pos.pnl} | Leverage: ${pos.leverage}\n`;
        });
        output += `\n`;
    }
    
    // Token holdings for capital allocation decisions
    if (tokenBalances.length > 0) {
        output += `🪙 AVAILABLE CAPITAL\n`;
        tokenBalances.forEach((token, index) => {
            const isLast = index === tokenBalances.length - 1;
            const prefix = isLast ? '└─' : '├─';
            output += `${prefix} ${token.symbol}: ${token.balance} (~${token.usdValue})\n`;
        });
    } else {
        output += `🪙 AVAILABLE CAPITAL: No liquid tokens\n`;
    }
    
    return output;
};

export const get_positions_str = async (sdk: GmxSdk, gmxDataCache?: EnhancedDataCache) => {
    // Get required market and token data first
    const marketsResult = gmxDataCache ? await gmxDataCache.getMarketsInfo() : await sdk.markets.getMarketsInfo().catch(error => {
        throw new Error(`Failed to get market data: ${error.message || error}`);
    });
    
    const { marketsInfoData, tokensData } = marketsResult;
    
    // Use cached positions if available
    const positionsResult = gmxDataCache ? await gmxDataCache.getPositions(marketsInfoData, tokensData) : await sdk.positions.getPositions({
        marketsData: marketsInfoData,
        tokensData: tokensData,
        start: 0,
        end: 1000,
    }).catch(error => {
        throw new Error(`Failed to get positions: ${error.message || error}`);
    });
    
    if (!marketsInfoData || !tokensData) {
        throw new Error("Failed to get market and token data");
    }
    
    // Extract and enhance positions data with complete calculations
    const rawPositions = positionsResult.positionsData ? Object.values(positionsResult.positionsData) : [];
    
    const enhancedPositions = rawPositions.map((position: any) => {
        try {
            // Get market and token information
            const marketInfo = marketsInfoData[position.marketAddress];
            if (!marketInfo) {
                console.warn(`Market not found for position: ${position.marketAddress}`);
                return null;
            }
            
            const indexToken = tokensData[marketInfo.indexTokenAddress];
            const collateralToken = tokensData[position.collateralTokenAddress];
            
            if (!indexToken || !collateralToken) {
                console.warn(`Tokens not found for position: ${position.key}`);
                return null;
            }
            
            // Get token decimals
            const indexTokenDecimals = indexToken.decimals || 18;
            const collateralTokenDecimals = collateralToken.decimals || 6;
            
            // Determine mark price (use max for longs when increasing, min for shorts)
            const markPrice = position.isLong ? 
                indexToken.prices?.maxPrice || 0n : 
                indexToken.prices?.minPrice || 0n;
            
            const collateralPrice = position.isLong ?
                collateralToken.prices?.minPrice || 0n :
                collateralToken.prices?.maxPrice || 0n;
            
            // Calculate enhanced metrics using our utility functions
            const calculatedPnl = calculatePositionPnl({
                sizeInUsd: position.sizeInUsd,
                sizeInTokens: position.sizeInTokens,
                markPrice,
                isLong: position.isLong,
                indexTokenDecimals
            });
            
            const collateralUsd = convertToUsd(
                position.collateralAmount, 
                collateralTokenDecimals, 
                collateralPrice
            );
            
            const leverage = calculateLeverage({
                sizeInUsd: position.sizeInUsd,
                collateralUsd,
                pnl: calculatedPnl,
                pendingFundingFeesUsd: position.pendingFundingFeesUsd || 0n,
                pendingBorrowingFeesUsd: position.pendingBorrowingFeesUsd || 0n
            });
            
            // Check if collateral token is same as index token
            const isSameCollateralAsIndex = position.collateralTokenAddress.toLowerCase() === 
                marketInfo.indexTokenAddress.toLowerCase();
            
            const liquidationPrice = calculateLiquidationPrice({
                sizeInUsd: position.sizeInUsd,
                sizeInTokens: position.sizeInTokens,
                collateralAmount: position.collateralAmount,
                collateralUsd,
                markPrice,
                indexTokenDecimals,
                collateralTokenDecimals,
                isLong: position.isLong,
                minCollateralFactor: marketInfo.minCollateralFactor || (5n * 10n ** 27n), // 0.5% default
                pendingBorrowingFeesUsd: position.pendingBorrowingFeesUsd || 0n,
                pendingFundingFeesUsd: position.pendingFundingFeesUsd || 0n,
                isSameCollateralAsIndex
            });
            
            const netValue = calculatePositionNetValue({
                collateralUsd,
                pnl: calculatedPnl,
                pendingFundingFeesUsd: position.pendingFundingFeesUsd || 0n,
                pendingBorrowingFeesUsd: position.pendingBorrowingFeesUsd || 0n
            });
            
            // Calculate percentage metrics
            const pnlPercentage = collateralUsd > 0n ? 
                Number((calculatedPnl * 10000n) / collateralUsd) / 100 : 0;
            
            const leverageNumber = leverage ? Number(leverage) / 10000 : 0;
            
            // Calculate distance to liquidation
            const currentPrice = bigIntToDecimal(markPrice, USD_DECIMALS);
            const liqPrice = liquidationPrice ? bigIntToDecimal(liquidationPrice, USD_DECIMALS) : 0;
            const distanceToLiquidation = currentPrice > 0 && liqPrice > 0 ? 
                Math.abs((currentPrice - liqPrice) / currentPrice) * 100 : 0;
            
            return {
                // Basic position info
                key: position.key,
                marketAddress: position.marketAddress,
                marketName: marketInfo.name,
                indexToken: indexToken.symbol,
                collateralToken: collateralToken.symbol,
                direction: position.isLong ? 'LONG' : 'SHORT',
                
                // Size and collateral
                sizeUsd: formatUsdAmount(position.sizeInUsd, 2),
                sizeInTokens: formatTokenAmount(position.sizeInTokens, indexTokenDecimals, 6),
                collateralUsd: formatUsdAmount(collateralUsd, 2),
                collateralAmount: formatTokenAmount(position.collateralAmount, collateralTokenDecimals, 6),
                
                // Calculated metrics
                pnl: formatUsdAmount(calculatedPnl, 2),
                pnlPercentage: `${pnlPercentage.toFixed(2)}%`,
                netValue: formatUsdAmount(netValue, 2),
                leverage: `${leverageNumber.toFixed(2)}x`,
                
                // Prices
                markPrice: formatUsdAmount(markPrice, 2),
                entryPrice: position.sizeInTokens > 0n ? 
                    formatUsdAmount((position.sizeInUsd * (10n ** BigInt(indexTokenDecimals))) / position.sizeInTokens, 2) : 
                    "$0.00",
                liquidationPrice: liquidationPrice ? formatUsdAmount(liquidationPrice, 2) : "N/A",
                
                // Risk metrics
                distanceToLiquidation: `${distanceToLiquidation.toFixed(2)}%`,
                
                // Fees
                pendingBorrowingFees: formatUsdAmount(position.pendingBorrowingFeesUsd || 0n, 4),
                pendingFundingFees: formatUsdAmount(position.pendingFundingFeesUsd || 0n, 4),
                
                // Timestamps
                createdAt: position.increasedAtTime ? 
                    new Date(Number(position.increasedAtTime) * 1000).toISOString() : null,
                
                // Raw data for advanced usage
                raw: {
                    sizeInUsd: position.sizeInUsd.toString(),
                    sizeInTokens: position.sizeInTokens.toString(),
                    collateralAmount: position.collateralAmount.toString(),
                    calculatedPnl: calculatedPnl.toString(),
                    markPrice: markPrice.toString(),
                    liquidationPrice: liquidationPrice?.toString() || null
                }
            };
        } catch (error) {
            console.error(`Error processing position ${position.key}:`, error);
            return null;
        }
    }).filter(Boolean);
    
    // Calculate portfolio summary
    const totalSizeUsd = enhancedPositions.reduce((sum, pos) => {
        const sizeNum = parseFloat(pos.sizeUsd.replace(/[$,]/g, ''));
        return sum + sizeNum;
    }, 0);
    
    const totalPnl = enhancedPositions.reduce((sum, pos) => {
        const pnlNum = parseFloat(pos.pnl.replace(/[$,]/g, ''));
        return sum + pnlNum;
    }, 0);
    
    const totalCollateral = enhancedPositions.reduce((sum, pos) => {
        const collateralNum = parseFloat(pos.collateralUsd.replace(/[$,]/g, ''));
        return sum + collateralNum;
    }, 0);

    if (enhancedPositions.length === 0) {
        return `📈 POSITION STATUS: No active positions`;
    }
    
    const avgLeverage = enhancedPositions.length > 0 ? 
        `${(enhancedPositions.reduce((sum, pos) => 
            sum + parseFloat(pos.leverage.replace('x', '')), 0) / enhancedPositions.length).toFixed(2)}x` : 
        "0x";
    
    let output = `📈 POSITION ANALYSIS\n`;
    output += `├─ Total Exposure: $${totalSizeUsd.toFixed(2)}\n`;
    output += `├─ Unrealized PnL: $${totalPnl.toFixed(2)}\n`;
    output += `├─ Total Collateral: $${totalCollateral.toFixed(2)}\n`;
    output += `├─ Average Leverage: ${avgLeverage}\n`;
    output += `└─ Active Positions: ${enhancedPositions.length}\n\n`;
    
    enhancedPositions.forEach((pos, index) => {
        const pnlStatus = pos.pnl.includes('-') ? '🔴 LOSS' : '🟢 PROFIT';
        const riskLevel = parseFloat(pos.distanceToLiquidation.replace('%', '')) < 10 ? '⚠️ HIGH RISK' : 
                         parseFloat(pos.distanceToLiquidation.replace('%', '')) < 25 ? '🟡 MEDIUM RISK' : '🟢 SAFE';
        
        output += `${index + 1}. ${pos.marketName} ${pos.direction} | ${pnlStatus}\n`;
        output += `├─ Size: ${pos.sizeUsd} | Leverage: ${pos.leverage}\n`;
        output += `├─ PnL: ${pos.pnl} (${pos.pnlPercentage}) | Net Value: ${pos.netValue}\n`;
        output += `├─ Entry: ${pos.entryPrice} | Current: ${pos.markPrice}\n`;
        output += `├─ Liquidation: ${pos.liquidationPrice} | Distance: ${pos.distanceToLiquidation} ${riskLevel}\n`;
        output += `└─ Market Address: ${pos.marketAddress}\n`;
        if (index < enhancedPositions.length - 1) output += `\n`;
    });
    
    return output;
};

// Get market data for specific BTC and ETH markets - returns formatted string
export const get_btc_eth_markets_str = async (sdk: GmxSdk, gmxDataCache?: EnhancedDataCache) => {
    try {
        // Get all markets data
        const marketsResult = gmxDataCache ? await gmxDataCache.getMarketsInfo() : await sdk.markets.getMarketsInfo().catch(error => {
            throw new Error(`Failed to get markets data: ${error.message || error}`);
        });
        const { marketsInfoData, tokensData } = marketsResult;
        
        if (!marketsInfoData || !tokensData) {
            throw new Error("Failed to get market and token data");
        }
        
        // Define the specific markets we want - look for BTC and ETH USD pairs
        const filteredMarkets: any[] = [];
        
        Object.entries(marketsInfoData).forEach(([marketTokenAddress, marketInfo]: [string, any]) => {
            // Only get the main BTC/USD [BTC-USDC] and ETH/USD [WETH-USDC] markets
            const isBtcUsdcMarket = marketInfo.name === 'BTC/USD [BTC-USDC]';
            const isEthWethUsdcMarket = marketInfo.name === 'ETH/USD [WETH-USDC]';
            
            if ((isBtcUsdcMarket || isEthWethUsdcMarket) && !marketInfo.isSpotOnly) {
                const indexToken = tokensData[marketInfo.indexTokenAddress];
                const longToken = tokensData[marketInfo.longTokenAddress];
                const shortToken = tokensData[marketInfo.shortTokenAddress];
                
                if (!indexToken || !longToken || !shortToken) return;
                
                // Calculate market metrics
                const indexPrice = indexToken.prices?.maxPrice || 0n;
                const indexPriceMin = indexToken.prices?.minPrice || 0n;
                const midPrice = (indexPrice + indexPriceMin) / 2n;
                
                // Calculate pool value
                const longPoolAmount = marketInfo.longPoolAmount || 0n;
                const shortPoolAmount = marketInfo.shortPoolAmount || 0n;
                
                const longPoolValue = convertToUsd(
                    longPoolAmount,
                    longToken.decimals,
                    longToken.prices?.minPrice || 0n
                );
                
                const shortPoolValue = convertToUsd(
                    shortPoolAmount,
                    shortToken.decimals,
                    shortToken.prices?.minPrice || 0n
                );
                
                const totalPoolValue = (longPoolValue || 0n) + (shortPoolValue || 0n);
                
                // Calculate utilization
                const longInterestUsd = marketInfo.longInterestUsd || 0n;
                const shortInterestUsd = marketInfo.shortInterestUsd || 0n;
                
                const utilizationLong = totalPoolValue > 0n ? 
                    Number((longInterestUsd * 10000n) / totalPoolValue) / 100 : 0;
                const utilizationShort = totalPoolValue > 0n ? 
                    Number((shortInterestUsd * 10000n) / totalPoolValue) / 100 : 0;
                
                // Format the enhanced market data
                filteredMarkets.push({
                    marketTokenAddress,  // Use correct field name from SDK
                    name: marketInfo.name,
                    indexToken: indexToken.symbol,
                    isDisabled: marketInfo.isDisabled || false,
                    
                    // Prices
                    indexPrice: formatUsdAmount(midPrice, 2),
                    spread: formatUsdAmount(indexPrice - indexPriceMin, 4),
                    
                    // Pool info
                    totalPoolValue: formatUsdAmount(totalPoolValue, 0),
                    
                    // Interest and utilization
                    longInterestUsd: formatUsdAmount(longInterestUsd, 0),
                    shortInterestUsd: formatUsdAmount(shortInterestUsd, 0),
                    utilizationLong: utilizationLong.toFixed(2) + '%',
                    utilizationShort: utilizationShort.toFixed(2) + '%',
                    
                    // Funding rates (convert from per second to per hour)
                    fundingRateLong: marketInfo.fundingFactorPerSecond ? 
                        (Number(marketInfo.fundingFactorPerSecond) * 3600 * 1e-30).toFixed(6) + '%/hr' : '0%/hr',
                    borrowingRateLong: marketInfo.borrowingFactorPerSecond ? 
                        (Number(marketInfo.borrowingFactorPerSecond) * 3600 * 1e-30).toFixed(6) + '%/hr' : '0%/hr',
                    
                    // Raw data for agent usage
                    raw: {
                        marketTokenAddress,
                        indexPrice: midPrice.toString(),
                        totalPoolValue: totalPoolValue.toString()
                    }
                });
            }
        });
        
        // Sort by BTC first, then ETH
        filteredMarkets.sort((a, b) => {
            if (a.indexToken.includes('BTC') && !b.indexToken.includes('BTC')) return -1;
            if (!a.indexToken.includes('BTC') && b.indexToken.includes('BTC')) return 1;
            return 0;
        });
        
        // Format as AI-optimized output
        let output = '📊 TRADING MARKETS\n';
        
        if (filteredMarkets.length === 0) {
            return '📊 TRADING MARKETS: No available markets';
        }
        
        // Summary for quick assessment
        const btcMarkets = filteredMarkets.filter(m => m.indexToken.includes('BTC'));
        const ethMarkets = filteredMarkets.filter(m => m.indexToken.includes('ETH'));
        
        output += `├─ Available Markets: ${filteredMarkets.length}\n`;
        output += `├─ BTC Markets: ${btcMarkets.length}\n`;
        output += `└─ ETH Markets: ${ethMarkets.length}\n\n`;
        
        // Market details optimized for trading decisions
        filteredMarkets.forEach((market, index) => {
            const status = market.isDisabled ? '🔴 DISABLED' : '🟢 ACTIVE';
            const isLast = index === filteredMarkets.length - 1;
            
            output += `${market.indexToken} MARKET | ${status}\n`;
            output += `├─ Address: ${market.marketTokenAddress}\n`;
            output += `├─ Price: ${market.indexPrice} | Spread: ${market.spread}\n`;
            output += `├─ Pool Liquidity: ${market.totalPoolValue}\n`;
            output += `├─ Long Interest: ${market.longInterestUsd} (${market.utilizationLong} utilized)\n`;
            output += `├─ Short Interest: ${market.shortInterestUsd} (${market.utilizationShort} utilized)\n`;
            output += `├─ Funding Rate: ${market.fundingRateLong}\n`;
            output += `└─ Borrowing Rate: ${market.borrowingRateLong}\n`;
            
            if (!isLast) output += '\n';
        });
        
        return output;
    } catch (error) {
        throw new Error(`Failed to get BTC/ETH markets data: ${error instanceof Error ? error.message : String(error)}`);
    }
};

// Get tokens data filtered for BTC/ETH/USD/USDC - returns formatted string
export const get_tokens_data_str = async (sdk: GmxSdk, gmxDataCache?: EnhancedDataCache) => {
    try {
        // Get all tokens data - use cache if available
        const tokensResult = gmxDataCache ? await gmxDataCache.getTokensData() : await sdk.tokens.getTokensData().catch(error => {
            throw new Error(`Failed to get tokens data: ${error.message || error}`);
        });
        const { tokensData } = tokensResult;
        
        if (!tokensData || typeof tokensData !== 'object') {
            throw new Error("Failed to get tokens data");
        }
        
        // Define target tokens for scalping
        const targetTokens = ['BTC', 'ETH', 'WBTC', 'WETH', 'USDC', 'USDT', 'USD'];
        
        // Filter and enhance token data
        const filteredTokens: any[] = [];
        
        Object.entries(tokensData).forEach(([tokenAddress, tokenInfo]: [string, any]) => {
            if (tokenInfo && tokenInfo.symbol) {
                // Check if this token matches our target symbols
                const isTargetToken = targetTokens.some(target => 
                    tokenInfo.symbol.includes(target) || tokenInfo.symbol === target
                );
                
                if (isTargetToken) {
                    // Calculate balance in USD
                    const balance = tokenInfo.balance ? bigIntToDecimal(tokenInfo.balance, tokenInfo.decimals) : 0;
                    const price = tokenInfo.prices?.minPrice ? 
                        bigIntToDecimal(tokenInfo.prices.minPrice, USD_DECIMALS) : 0;
                    const balanceUsd = balance * price;
                    
                    filteredTokens.push({
                        symbol: tokenInfo.symbol,
                        name: tokenInfo.name || tokenInfo.symbol,
                        address: tokenAddress,
                        decimals: tokenInfo.decimals,
                        
                        // Balance info
                        balance: balance.toFixed(6),
                        balanceUsd: balanceUsd.toFixed(2),
                        
                        // Price info
                        priceUsd: price.toFixed(6),
                        
                        // Raw data
                        raw: {
                            address: tokenAddress,
                            balance: tokenInfo.balance?.toString() || '0',
                            minPrice: tokenInfo.prices?.minPrice?.toString() || '0',
                            maxPrice: tokenInfo.prices?.maxPrice?.toString() || '0'
                        }
                    });
                }
            }
        });
        
        // Sort by balance USD value (highest first)
        filteredTokens.sort((a, b) => parseFloat(b.balanceUsd) - parseFloat(a.balanceUsd));
        
        // Format for AI trading analysis
        let output = '🪙 TOKEN INVENTORY\n';
        
        if (filteredTokens.length === 0) {
            return '🪙 TOKEN INVENTORY: No tokens available';
        }
        
        // Summary for capital planning
        const totalBalanceUsd = filteredTokens.reduce((sum, token) => sum + parseFloat(token.balanceUsd), 0);
        const tokensWithBalance = filteredTokens.filter(token => parseFloat(token.balance) > 0);
        
        output += `├─ Total Tokens: ${filteredTokens.length}\n`;
        output += `├─ Tokens with Balance: ${tokensWithBalance.length}\n`;
        output += `└─ Total Value: $${totalBalanceUsd.toFixed(2)}\n\n`;
        
        // Token details for trading decisions
        filteredTokens.forEach((token, index) => {
            const hasBalance = parseFloat(token.balance) > 0;
            const status = hasBalance ? '💰 AVAILABLE' : '🔘 EMPTY';
            const isLast = index === filteredTokens.length - 1;
            
            output += `${token.symbol} | ${status}\n`;
            output += `├─ Address: ${token.address}\n`;
            output += `├─ Balance: ${token.balance} tokens\n`;
            output += `├─ USD Value: $${token.balanceUsd}\n`;
            output += `├─ Price: $${token.priceUsd}\n`;
            output += `└─ Decimals: ${token.decimals}\n`;
            
            if (!isLast) output += '\n';
        });
        
        return output;
    } catch (error) {
        throw new Error(`Failed to get tokens data: ${error instanceof Error ? error.message : String(error)}`);
    }
};

// Get daily volumes filtered for BTC/ETH markets - returns formatted string
export const get_daily_volumes_str = async (sdk: GmxSdk, gmxDataCache?: EnhancedDataCache) => {
    try {
        // Get daily volumes data
        let volumes;
        try {
            volumes = await sdk.markets.getDailyVolumes();
        } catch (error) {
            // Handle GraphQL errors gracefully
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('GraphQL') || errorMsg.includes('502') || errorMsg.includes('getMarketsValues')) {
                console.warn('Daily volumes unavailable due to GraphQL error:', errorMsg);
                return '📈 MARKET LIQUIDITY: Volume data temporarily unavailable\n';
            }
            throw error;
        }
        
        if (!volumes || typeof volumes !== 'object') {
            throw new Error("No volume data available");
        }
        
        // Get markets info to map addresses to names
        const marketsResult = gmxDataCache ? await gmxDataCache.getMarketsInfo() : await sdk.markets.getMarketsInfo().catch(error => {
            throw new Error(`Failed to get markets data: ${error.message || error}`);
        });
        const { marketsInfoData } = marketsResult;
        
        if (!marketsInfoData) {
            throw new Error("Failed to get markets info for volume mapping");
        }
        
        // Filter and enhance volume data for BTC/ETH markets
        const filteredVolumes: any[] = [];
        
        Object.entries(volumes).forEach(([marketAddress, volumeBigInt]) => {
            const marketInfo = marketsInfoData[marketAddress];
            
            if (marketInfo && marketInfo.name) {
                // Only get the main BTC/USD [BTC-USDC] and ETH/USD [WETH-USDC] markets
                const isBtcUsdcMarket = marketInfo.name === 'BTC/USD [BTC-USDC]';
                const isEthWethUsdcMarket = marketInfo.name === 'ETH/USD [WETH-USDC]';
                
                if ((isBtcUsdcMarket || isEthWethUsdcMarket) && !marketInfo.isSpotOnly) {
                    const volumeUsd = bigIntToDecimal(volumeBigInt, USD_DECIMALS);
                    
                    filteredVolumes.push({
                        marketAddress,
                        name: marketInfo.name,
                        indexToken: marketInfo.indexToken?.symbol || 'Unknown',
                        volumeUsd: volumeUsd.toFixed(0),
                        volumeFormatted: formatUsdAmount(volumeBigInt, 0),
                        
                        // Raw data
                        raw: {
                            marketAddress,
                            volumeUsd: volumeBigInt.toString()
                        }
                    });
                }
            }
        });
        
        // Sort by volume (highest first)
        filteredVolumes.sort((a, b) => parseFloat(b.volumeUsd) - parseFloat(a.volumeUsd));
        
        // Format for liquidity analysis
        let output = '📈 MARKET LIQUIDITY\n';
        
        if (filteredVolumes.length === 0) {
            return '📈 MARKET LIQUIDITY: No volume data available';
        }
        
        // Summary for liquidity assessment
        const totalVolume = filteredVolumes.reduce((sum, vol) => sum + parseFloat(vol.volumeUsd), 0);
        const btcVolumes = filteredVolumes.filter(v => v.indexToken.includes('BTC'));
        const ethVolumes = filteredVolumes.filter(v => v.indexToken.includes('ETH'));
        
        const btcTotalVolume = btcVolumes.reduce((sum, vol) => sum + parseFloat(vol.volumeUsd), 0);
        const ethTotalVolume = ethVolumes.reduce((sum, vol) => sum + parseFloat(vol.volumeUsd), 0);
        
        output += `├─ Total 24h Volume: $${totalVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`;
        output += `├─ BTC Volume: $${btcTotalVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${btcVolumes.length} markets)\n`;
        output += `└─ ETH Volume: $${ethTotalVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${ethVolumes.length} markets)\n\n`;
        
        // Volume details for trading decisions
        filteredVolumes.forEach((volume, index) => {
            const token = volume.indexToken.includes('BTC') ? 'BTC' : 'ETH';
            const volumeNum = parseFloat(volume.volumeUsd);
            const liquidityLevel = volumeNum > 50000000 ? '🟢 HIGH' : volumeNum > 10000000 ? '🟡 MEDIUM' : '🔴 LOW';
            const isLast = index === filteredVolumes.length - 1;
            
            output += `${token} MARKET | ${liquidityLevel} VOLUME\n`;
            output += `├─ Market: ${volume.name}\n`;
            output += `├─ Address: ${volume.marketAddress}\n`;
            output += `└─ 24h Volume: ${volume.volumeFormatted}\n`;
            
            if (!isLast) output += '\n';
        });
        
        return output;
    } catch (error) {
        throw new Error(`Failed to get daily volumes: ${error instanceof Error ? error.message : String(error)}`);
    }
};

export const get_orders_str = async (sdk: GmxSdk, gmxDataCache?: EnhancedDataCache) => {
    try {
        // Get required market and token data first
        const marketsResult = gmxDataCache ? await gmxDataCache.getMarketsInfo() : await sdk.markets.getMarketsInfo();
        const { marketsInfoData, tokensData } = marketsResult;
        
        if (!marketsInfoData || !tokensData) {
            throw new Error("Failed to get market and token data");
        }

        // Use official SDK method with required parameters
        const ordersResult = await sdk.orders.getOrders({
            marketsInfoData,
            tokensData
        });
        
        // Extract orders data from structured result - use the enhanced OrderInfo objects
        const ordersInfoData = ordersResult.ordersInfoData || {};
        const orders = Object.values(ordersInfoData);
        
        if (orders.length === 0) {
            return "📋 ORDER STATUS: No pending orders";
        }
        
        // Build AI-optimized output
        let ordersString = `📋 ORDER MANAGEMENT\n`;
        
        let totalOrderValue = 0;
        let highRiskCount = 0;
        let takeProfitCount = 0;
        let stopLossCount = 0;
        let regularOrderCount = 0;
        
        orders.forEach((order: any, index: number) => {
            try {
                // Use the enhanced order properties that SDK provides
                const marketInfo = order.marketInfo;
                const indexToken = order.indexToken;
                const initialCollateralToken = order.initialCollateralToken;
                
                if (!marketInfo || !indexToken || !initialCollateralToken) {
                    ordersString += `Order #${index + 1}: [Data Missing - SDK Processing Error]\n\n`;
                    return;
                }
                
                // Get current mark price
                const markPrice = indexToken.prices?.maxPrice || 0n;
                const markPriceUsd = bigIntToDecimal(markPrice, USD_DECIMALS);
                
                // Calculate order metrics using correct field names
                const orderValueUsd = bigIntToDecimal(order.sizeDeltaUsd, USD_DECIMALS);
                totalOrderValue += orderValueUsd;
                
                const triggerPriceUsd = bigIntToDecimal(order.triggerPrice, USD_DECIMALS);
                
                const collateralValue = bigIntToDecimal(
                    order.initialCollateralDeltaAmount, 
                    initialCollateralToken.decimals
                );
                
                const leverage = collateralValue > 0 ? orderValueUsd / collateralValue : 0;
                if (leverage > 10) highRiskCount++;
                
                // Count order types
                if (order.orderType === 5) takeProfitCount++;
                else if (order.orderType === 6) stopLossCount++;
                else regularOrderCount++;
                
                // Calculate order age using correct field name
                const updatedAt = Number(order.updatedAtTime) || 0;
                const orderAgeHours = updatedAt > 0 ? (Date.now() / 1000 - updatedAt) / 3600 : 0;
                
                // Determine execution status
                let executionStatus = "⏳ Pending";
                if (order.isLong !== undefined) {
                    if (order.isLong && markPriceUsd >= triggerPriceUsd) {
                        executionStatus = "Not executed yet";
                    } else if (!order.isLong && markPriceUsd <= triggerPriceUsd) {
                        executionStatus = "Not executed yet";
                    }
                }
                
                // Get order type description
                const orderTypeText = getTradeActionDescriptionEnhanced(
                    'OrderCreated', 
                    order.orderType, 
                    order.isLong || false, 
                    triggerPriceUsd, 
                    markPriceUsd
                );
                
                // Determine if this is a TP/SL order
                let orderIcon = "📌";
                if (order.orderType === 5) orderIcon = "🎯"; // Take Profit
                if (order.orderType === 6) orderIcon = "🛡️"; // Stop Loss
                
                // Format order info for AI analysis
                const direction = order.isLong ? "LONG" : "SHORT";
                const orderType = order.orderType === 5 ? "TAKE_PROFIT" : order.orderType === 6 ? "STOP_LOSS" : "REGULAR";
                const riskStatus = leverage > 10 ? "⚠️ HIGH_RISK" : leverage > 5 ? "🟡 MEDIUM_RISK" : "🟢 LOW_RISK";
                
                ordersString += `${orderIcon} ${marketInfo.name} ${direction} ${orderType}\n`;
                ordersString += `├─ Size: $${orderValueUsd.toFixed(2)} | Leverage: ${leverage.toFixed(2)}x | ${riskStatus}\n`;
                ordersString += `├─ Trigger: $${triggerPriceUsd.toFixed(2)} | Current: $${markPriceUsd.toFixed(2)}\n`;
                ordersString += `├─ Collateral: ${collateralValue.toFixed(6)} ${initialCollateralToken.symbol}\n`;
                ordersString += `├─ Status: ${executionStatus} | Age: ${orderAgeHours.toFixed(1)}h\n`;
                ordersString += `└─ Order Key: ${order.key}\n\n`;
                
            } catch (error) {
                ordersString += `Order #${index + 1}: [Processing Error: ${error}]\n\n`;
            }
        });
        
        // Add summary for risk management
        ordersString += "📊 ORDER SUMMARY\n";
        ordersString += `├─ Total Orders: ${orders.length}\n`;
        ordersString += `├─ Regular Orders: ${regularOrderCount}\n`;
        ordersString += `├─ Take Profit Orders: ${takeProfitCount}\n`;
        ordersString += `├─ Stop Loss Orders: ${stopLossCount}\n`;
        ordersString += `├─ Total Value: $${totalOrderValue.toFixed(2)}\n`;
        ordersString += `├─ High Risk Orders: ${highRiskCount}\n`;
        ordersString += `└─ Average Size: $${(totalOrderValue / orders.length).toFixed(2)}\n`;
        
        return ordersString;
        
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return `❌ Error fetching orders: ${errorMsg}`;
    }
};

// Helper function to get current asset price
const getCurrentAssetPrice = async (asset: 'BTC' | 'ETH', gmxDataCache?: EnhancedDataCache): Promise<number> => {
    try {
        const marketsResult = gmxDataCache ?  await gmxDataCache.getMarketsInfo() : null;
        
        if (!marketsResult) {
            throw new Error("Failed to get market data");
        }
        
        const { marketsInfoData, tokensData } = marketsResult;
        
        // Find the correct market for the asset
        const targetMarketName = asset === 'BTC' ? 'BTC/USD [BTC-USDC]' : 'ETH/USD [WETH-USDC]';
        
        for (const [marketAddress, marketInfo] of Object.entries(marketsInfoData)) {
            if ((marketInfo as any).name === targetMarketName) {
                const indexToken = tokensData[(marketInfo as any).indexTokenAddress];
                if (indexToken?.prices?.maxPrice && indexToken?.prices?.minPrice) {
                    const maxPrice = bigIntToDecimal(indexToken.prices.maxPrice, USD_DECIMALS);
                    const minPrice = bigIntToDecimal(indexToken.prices.minPrice, USD_DECIMALS);
                    return (maxPrice + minPrice) / 2;
                }
            }
        }
        throw new Error(`Market not found for ${asset}`);
    } catch (error) {
        throw new Error(`Failed to get current ${asset} price: ${error instanceof Error ? error.message : error}`);
    }
};

// Helper function to analyze synth predictions
const analyzeSynthPredictions = (consolidatedArray: any[], asset: 'BTC' | 'ETH', currentPrice: number) => {
    const timestamp = new Date().toISOString();
    
    // Calculate timeframe predictions with realistic confidence based on miner agreement
    const getClosestPrediction = (targetMinutes: number) => {
        const targetTime = Date.now() + (targetMinutes * 60 * 1000);
        let closest = consolidatedArray[0];
        let minDiff = Math.abs(new Date(closest?.time || 0).getTime() - targetTime);
        
        for (const slot of consolidatedArray) {
            const diff = Math.abs(new Date(slot.time).getTime() - targetTime);
            if (diff < minDiff) {
                minDiff = diff;
                closest = slot;
            }
        }
        
        if (closest?.predictions?.length > 0) {
            const predictions = closest.predictions;
            const avgPrice = predictions.reduce((sum: number, p: any) => sum + (p.price || 0), 0) / predictions.length;
            
            // Calculate realistic confidence based on prediction variance
            const variance = predictions.reduce((sum: number, p: any) => sum + Math.pow((p.price || 0) - avgPrice, 2), 0) / predictions.length;
            const stdDev = Math.sqrt(variance) / avgPrice;
            // Convert std dev to confidence: lower variance = higher confidence
            const confidencePct = Math.max(0, Math.min(100, 100 * (1 - stdDev * 10)));
            
            return { price: avgPrice, confidence: confidencePct, minerCount: predictions.length };
        }
        return { price: currentPrice, confidence: 50, minerCount: 0 };
    };
    
    const timeframes = {
        '15min': getClosestPrediction(15),
        '30min': getClosestPrediction(30),
        '1h': getClosestPrediction(60),
        '2h': getClosestPrediction(120),
        '4h': getClosestPrediction(240),
        '8h': getClosestPrediction(480),
        '24h': getClosestPrediction(1440)
    };
    
    // Enhanced consensus calculation
    const allPredictions = consolidatedArray.flatMap(slot => slot.predictions || []);
    const allPrices = allPredictions.map((p: any) => p.price || 0).filter(p => p > 0);
    const avgPrediction = allPrices.length > 0 ? 
        allPrices.reduce((sum: number, p: number) => sum + p, 0) / allPrices.length : currentPrice;
    
    const bullishCount = allPrices.filter(p => p > currentPrice).length;
    const bearishCount = allPrices.filter(p => p < currentPrice).length;
    const totalPredictions = allPrices.length;
    
    const consensus = bullishCount > bearishCount ? 'BULLISH' : bearishCount > bullishCount ? 'BEARISH' : 'NEUTRAL';
    const agreementRatio = totalPredictions > 0 ? Math.max(bullishCount, bearishCount) / totalPredictions : 0;
    
    // More nuanced confidence based on actual agreement
    const confidence = agreementRatio > 0.85 ? 'HIGH' : agreementRatio > 0.65 ? 'MODERATE' : 'LOW';
    
    // Enhanced volatility analysis
    const priceVariance = allPrices.length > 1 ? 
        allPrices.reduce((sum, p) => sum + Math.pow(p - avgPrediction, 2), 0) / allPrices.length : 0;
    const volatilityPct = Math.sqrt(priceVariance) / currentPrice * 100;
    const volRegime = volatilityPct > 2.5 ? 'high' : volatilityPct > 1.0 ? 'moderate' : 'low';
    
    // Volatility trend analysis
    const recentSlots = consolidatedArray.slice(-20); // Last 20 time slots
    const olderSlots = consolidatedArray.slice(-40, -20);
    
    const getSlotVolatility = (slots: any[]) => {
        const slotPrices = slots.flatMap(slot => (slot.predictions || []).map((p: any) => p.price || 0));
        if (slotPrices.length < 2) return 0;
        const slotAvg = slotPrices.reduce((sum, p) => sum + p, 0) / slotPrices.length;
        const slotVar = slotPrices.reduce((sum, p) => sum + Math.pow(p - slotAvg, 2), 0) / slotPrices.length;
        return Math.sqrt(slotVar) / slotAvg * 100;
    };
    
    const recentVol = getSlotVolatility(recentSlots);
    const olderVol = getSlotVolatility(olderSlots);
    const volTrend = recentVol > olderVol * 1.2 ? 'expanding' : recentVol < olderVol * 0.8 ? 'contracting' : 'stable';
    
    // Fix uncertainty correlation with volatility
    const uncertaintyLevel = volRegime === 'high' ? 'high' : volRegime === 'moderate' ? 'moderate' : 'low';
    
    // Find support/resistance levels with weighted clustering
    const priceCluster = (prices: number[], tolerance = 0.008) => {
        const clusters: { price: number, count: number, weight: number }[] = [];
        
        for (const price of prices) {
            let foundCluster = false;
            for (const cluster of clusters) {
                if (Math.abs(price - cluster.price) / cluster.price <= tolerance) {
                    const newWeight = cluster.weight + 1;
                    cluster.price = (cluster.price * cluster.weight + price) / newWeight;
                    cluster.count++;
                    cluster.weight = newWeight;
                    foundCluster = true;
                    break;
                }
            }
            if (!foundCluster) {
                clusters.push({ price, count: 1, weight: 1 });
            }
        }
        
        return clusters.sort((a, b) => b.weight - a.weight).slice(0, 3);
    };
    
    const resistanceLevels = priceCluster(allPrices.filter(p => p > currentPrice));
    const supportLevels = priceCluster(allPrices.filter(p => p < currentPrice));
    
    // Enhanced momentum analysis with different confidence per timeframe
    const getMomentum = (tf: any[], label: string) => {
        const avgPrice = tf.reduce((sum, t) => sum + t.price, 0) / tf.length;
        const direction = avgPrice > currentPrice ? 'BULLISH' : 'BEARISH';
        const strength = Math.abs(avgPrice - currentPrice) / currentPrice * 100;
        
        // Realistic confidence based on actual timeframe data
        const avgConfidence = tf.reduce((sum, t) => sum + t.confidence, 0) / tf.length;
        const minerCoverage = tf.reduce((sum, t) => sum + t.minerCount, 0) / tf.length / 10; // Normalize to 10 miners
        const finalConfidence = Math.min(100, avgConfidence * minerCoverage);
        
        return { direction, strength, confidence: finalConfidence };
    };
    
    const shortTerm = [timeframes['15min'], timeframes['30min'], timeframes['1h']];
    const mediumTerm = [timeframes['1h'], timeframes['2h'], timeframes['4h']];
    const longTerm = [timeframes['4h'], timeframes['8h'], timeframes['24h']];
    
    const shortMomentum = getMomentum(shortTerm, 'short');
    const mediumMomentum = getMomentum(mediumTerm, 'medium');
    const longMomentum = getMomentum(longTerm, 'long');
    
    // Enhanced stop/take profit calculation with minimum 2:1 R:R
    const baseStopDistance = Math.max(volatilityPct * 0.8, 0.8); // Base stop distance
    
    // Adjust stops and targets to achieve minimum 2:1 R:R
    const minRiskReward = 2.0;
    const aggressiveStopPct = baseStopDistance;
    const conservativeStopPct = baseStopDistance * 1.5;
    
    // Calculate take profits ensuring good R:R
    const longStops = {
        aggressive: currentPrice * (1 - aggressiveStopPct * 0.01),
        conservative: currentPrice * (1 - conservativeStopPct * 0.01)
    };
    
    const shortStops = {
        aggressive: currentPrice * (1 + aggressiveStopPct * 0.01),
        conservative: currentPrice * (1 + conservativeStopPct * 0.01)
    };
    
    // Base stops/targets on actual prediction levels
    const maxPrediction = Math.max(...allPrices);
    const minPrediction = Math.min(...allPrices);
    const predictionSpread = maxPrediction - minPrediction;
    
    // If prediction range is too small, adjust targets to minimum viable levels
    const minViableRange = currentPrice * 0.015; // 1.5% minimum range needed
    const useActualLevels = predictionSpread >= minViableRange;
    
    let longTPs: number[], shortTPs: number[];
    
    if (useActualLevels && resistanceLevels.length >= 2) {
        // Use actual prediction-based resistance levels
        longTPs = [
            resistanceLevels[0]?.price || currentPrice * 1.02,
            resistanceLevels[1]?.price || currentPrice * 1.03,
            resistanceLevels[2]?.price || maxPrediction
        ];
    } else {
        // Fallback to minimum viable targets
        const minTarget = currentPrice * (1 + aggressiveStopPct * minRiskReward * 0.01);
        longTPs = [
            minTarget,
            minTarget * 1.5,
            minTarget * 2
        ];
    }
    
    if (useActualLevels && supportLevels.length >= 2) {
        // Use actual prediction-based support levels
        shortTPs = [
            supportLevels[0]?.price || currentPrice * 0.98,
            supportLevels[1]?.price || currentPrice * 0.97,
            supportLevels[2]?.price || minPrediction
        ];
    } else {
        // Fallback to minimum viable targets
        const minTarget = currentPrice * (1 - aggressiveStopPct * minRiskReward * 0.01);
        shortTPs = [
            minTarget,
            minTarget * 0.985,
            minTarget * 0.97
        ];
    }
    
    // Calculate R:R ratios for each TP level
    const longRRs = longTPs.map(tp => (tp - currentPrice) / (currentPrice - longStops.aggressive));
    const shortRRs = shortTPs.map(tp => (currentPrice - tp) / (shortStops.aggressive - currentPrice));
    
    // Enhanced position sizing with multiple factors
    const baseSize = 20;
    const confidenceMultiplier = agreementRatio; // 0.5 to 1.0
    const rrMultiplier = Math.min(1.5, Math.max(0.5, longRRs[0] / 2)); // Scale based on R:R
    const volAdjustment = volRegime === 'low' ? 1.3 : volRegime === 'moderate' ? 1.0 : 0.6;
    const timeframeAlignment = (shortMomentum.direction === mediumMomentum.direction) ? 1.2 : 0.8;
    
    const optimalSize = Math.round(baseSize * confidenceMultiplier * rrMultiplier * volAdjustment * timeframeAlignment);
    
    // Calculate prediction range for quality assessment
    const predictionRange = Math.max(...allPrices) - Math.min(...allPrices);
    const rangePct = predictionRange / currentPrice * 100;
    
    // Realistic Trade Quality Score (A, B, C, D)
    let qualityFactors = [];
    
    // Factor 1: Prediction Range Quality (40%)
    const rangeScore = rangePct >= 2.0 ? 40 : rangePct >= 1.0 ? 30 : rangePct >= 0.5 ? 20 : 10;
    qualityFactors.push({name: 'Range', score: rangeScore, weight: 0.4});
    
    // Factor 2: Confidence Quality (30%)
    const confidenceScore = confidence === 'HIGH' ? 30 : confidence === 'MODERATE' ? 20 : 10;
    qualityFactors.push({name: 'Confidence', score: confidenceScore, weight: 0.3});
    
    // Factor 3: Timeframe Alignment (20%)
    const hasConflicts = shortMomentum.direction !== mediumMomentum.direction || mediumMomentum.direction !== longMomentum.direction;
    const alignmentScore = hasConflicts ? 5 : timeframeAlignment > 1 ? 20 : 15;
    qualityFactors.push({name: 'Alignment', score: alignmentScore, weight: 0.2});
    
    // Factor 4: Actual vs Artificial Levels (10%)
    const levelsScore = useActualLevels ? 10 : 5;
    qualityFactors.push({name: 'Levels', score: levelsScore, weight: 0.1});
    
    const totalScore = qualityFactors.reduce((sum, factor) => sum + (factor.score * factor.weight), 0);
    
    // More realistic quality grades
    const tradeQuality = totalScore >= 25 ? 'A' : totalScore >= 20 ? 'B+' : totalScore >= 15 ? 'B' : totalScore >= 10 ? 'C' : 'D';
    
    // Use the previously calculated predictionRange and rangePct
    
    // Check for clear directional bias in predictions
    const nearTermDirection = timeframes['15min'].price > currentPrice && timeframes['30min'].price > currentPrice && timeframes['1h'].price > currentPrice;
    const nearTermBearish = timeframes['15min'].price < currentPrice && timeframes['30min'].price < currentPrice && timeframes['1h'].price < currentPrice;
    
    // Logical setup evaluation
    let bestSetup = 'WAIT';
    let setupReason = '';
    
    if (rangePct < 0.5) {
        bestSetup = 'WAIT';
        setupReason = 'insufficient prediction range';
    } else if (shortMomentum.direction !== mediumMomentum.direction || mediumMomentum.direction !== longMomentum.direction) {
        bestSetup = 'WAIT';
        setupReason = 'conflicting timeframe signals';
    } else if (confidence === 'LOW') {
        bestSetup = 'WAIT';
        setupReason = 'low prediction confidence';
    } else if (nearTermDirection && consensus === 'BULLISH' && confidence !== 'LOW') {
        bestSetup = 'LONG';
        setupReason = 'aligned bullish signals';
    } else if (nearTermBearish && consensus === 'BEARISH' && confidence !== 'LOW') {
        bestSetup = 'SHORT';
        setupReason = 'aligned bearish signals';
    } else {
        bestSetup = 'WAIT';
        setupReason = 'mixed signals';
    }
    
    // Conviction should match confidence - no contradictions!
    const convictionLevel = confidence === 'HIGH' ? 'HIGH' : confidence === 'MODERATE' ? 'MODERATE' : 'LOW';
    
    // Format the analysis
    let result = `=== SYNTH INTELLIGENCE RECAP [${timestamp}] ===\n\n`;
    
    result += `CURRENT SITUATION:\n`;
    result += `- ${asset} Price: $${currentPrice.toFixed(2)}\n`;
    result += `- Active Miners: ${new Set(allPredictions.map((p: any) => p.miner_uid)).size}\n`;
    result += `- Top Miners Consensus: ${consensus} (${confidence} confidence)\n\n`;
    
    result += `MULTI-TIMEFRAME PREDICTIONS:\n`;
    Object.entries(timeframes).forEach(([tf, data]) => {
        const change = ((data.price - currentPrice) / currentPrice * 100);
        result += `${tf}: $${data.price.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}% change)\n`;
    });
    result += '\n';
    
    result += `PREDICTION MOMENTUM:\n`;
    result += `Short-term (15m-1h): ${shortMomentum.direction} - Strength: ${shortMomentum.strength.toFixed(1)}% - Confidence: ${shortMomentum.confidence.toFixed(0)}%\n`;
    result += `Medium-term (1h-4h): ${mediumMomentum.direction} - Strength: ${mediumMomentum.strength.toFixed(1)}% - Confidence: ${mediumMomentum.confidence.toFixed(0)}%\n`;
    result += `Long-term (4h+): ${longMomentum.direction} - Strength: ${longMomentum.strength.toFixed(1)}% - Confidence: ${longMomentum.confidence.toFixed(0)}%\n\n`;
    
    result += `CRITICAL LEVELS:\n`;
    result += `Resistance: ${resistanceLevels.map(r => `$${r.price.toFixed(0)}`).join(', ') || 'No clear levels'}\n`;
    result += `Support: ${supportLevels.map(s => `$${s.price.toFixed(0)}`).join(', ') || 'No clear levels'}\n\n`;
    
    // Only show detailed TP/SL levels for actionable setups
    if (bestSetup !== 'WAIT') {
        result += `DYNAMIC STOP/TAKE PROFIT LEVELS:\n`;
        result += `For LONG positions:\n`;
        result += `- Aggressive Stop: $${longStops.aggressive.toFixed(0)} (${((longStops.aggressive - currentPrice) / currentPrice * 100).toFixed(2)}% risk)\n`;
        result += `- Conservative Stop: $${longStops.conservative.toFixed(0)} (${((longStops.conservative - currentPrice) / currentPrice * 100).toFixed(2)}% risk)\n`;
        longTPs.slice(0, 3).forEach((tp, i) => {
            const label = ['First', 'Second', 'Final'][i];
            const rrRatio = longRRs[i];
            result += `- ${label} Take Profit: $${tp.toFixed(0)} (+${((tp - currentPrice) / currentPrice * 100).toFixed(2)}% gain) [${rrRatio.toFixed(1)}:1 R:R]\n`;
        });
        result += '\n';
        
        result += `For SHORT positions:\n`;
        result += `- Aggressive Stop: $${shortStops.aggressive.toFixed(0)} (+${((shortStops.aggressive - currentPrice) / currentPrice * 100).toFixed(2)}% risk)\n`;
        result += `- Conservative Stop: $${shortStops.conservative.toFixed(0)} (+${((shortStops.conservative - currentPrice) / currentPrice * 100).toFixed(2)}% risk)\n`;
        shortTPs.slice(0, 3).forEach((tp, i) => {
            const label = ['First', 'Second', 'Final'][i];
            const rrRatio = shortRRs[i];
            result += `- ${label} Take Profit: $${tp.toFixed(0)} (${((tp - currentPrice) / currentPrice * 100).toFixed(2)}% gain) [${rrRatio.toFixed(1)}:1 R:R]\n`;
        });
        result += '\n';
    }
    
    result += `POSITION MANAGEMENT SIGNALS:\n`;
    // Only show trade metrics for actionable setups
    if (bestSetup !== 'WAIT') {
        result += `- Risk/Reward Ratio: ${longRRs[0].toFixed(1)}:1 (First TP), ${longRRs[2].toFixed(1)}:1 (Final TP)\n`;
        result += `- Trade Quality: ${tradeQuality}\n`;
        result += `- Optimal Position Size: ${optimalSize}% of capital\n`;
    }
    result += `- Best Setup: ${bestSetup}${bestSetup !== 'WAIT' ? ` above $${currentPrice.toFixed(0)}` : ` - ${setupReason}`}\n`;
    result += `- Conviction Level: ${convictionLevel}\n`;
    if (bestSetup !== 'WAIT') {
        result += `- Hold Duration: ${volRegime === 'high' ? 'short' : volRegime === 'moderate' ? 'medium' : 'long'}-term\n`;
    }
    result += '\n';
    
    result += `VOLATILITY SIGNALS:\n`;
    result += `Current Predicted Vol: ${volatilityPct.toFixed(2)}%\n`;
    result += `Vol Regime: ${volRegime} (${volTrend})\n`;
    result += `Uncertainty Level: ${uncertaintyLevel}\n\n`;
    
    // Check for divergences
    const divergences = [];
    if (shortMomentum.direction !== mediumMomentum.direction) {
        divergences.push(`SHORT_VS_MEDIUM: ${shortMomentum.direction} short-term vs ${mediumMomentum.direction} medium-term (${Math.abs(shortMomentum.strength - mediumMomentum.strength) > 1 ? 'strong' : 'weak'} strength)`);
    }
    if (mediumMomentum.direction !== longMomentum.direction) {
        divergences.push(`MEDIUM_VS_LONG: ${mediumMomentum.direction} medium-term vs ${longMomentum.direction} long-term (${Math.abs(mediumMomentum.strength - longMomentum.strength) > 1 ? 'strong' : 'weak'} strength)`);
    }
    
    if (divergences.length > 0) {
        result += `DIVERGENCE SIGNALS:\n`;
        divergences.forEach(div => result += `- ${div}\n`);
        result += '\n';
    }
    
    result += `SUMMARY:\n`;
    // Determine actual momentum bias from timeframe analysis
    const actualBias = shortMomentum.direction === mediumMomentum.direction && mediumMomentum.direction === longMomentum.direction 
        ? shortMomentum.direction 
        : consensus; // fallback to consensus if timeframes conflict
    
    result += `${actualBias} bias with ${confidence} confidence. `;
    result += `Best Setup: ${bestSetup}. `;
    
    // Only show trade quality for actionable setups
    if (bestSetup !== 'WAIT') {
        result += `Trade Quality: ${tradeQuality}. `;
    }
    
    result += `Key level: $${resistanceLevels[0]?.price?.toFixed(0) || supportLevels[0]?.price?.toFixed(0) || currentPrice.toFixed(0)}.\n\n`;
    
    result += `=== END SYNTH RECAP ===`;
    
    return result;
};

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
    
    // Step 2: Fetch predictions for all miners
    const minerIds = topMiners.map((m: any) => m.neuron_uid);
    const minerParams = minerIds.map((id: number) => `miner=${id}`).join('&');
    
    const predictionsUrl = `https://api.synthdata.co/prediction/latest?${minerParams}&asset=${asset}&time_increment=300&time_length=86400`;
    
    const predictionsResponse = await fetch(predictionsUrl, {
        headers: {
            'Authorization': `Apikey ${process.env.SYNTH_API_KEY}`
        }
    });
    
    if (predictionsResponse.status === 429) {
        throw new Error('Rate limited - predictions temporarily unavailable');
    }
    
    if (!predictionsResponse.ok) {
        throw new Error(`Failed to fetch predictions: ${predictionsResponse.statusText}`);
    }
    
    const predictionsData = await predictionsResponse.json();
    
    if (!predictionsData || !Array.isArray(predictionsData)) {
        throw new Error("Invalid predictions data format");
    }
    
    // Step 3: Consolidate predictions by time
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
            
            const time = pred.time;
            const price = pred.price;
            
            if (!consolidatedMap.has(time)) {
                consolidatedMap.set(time, {
                    time,
                    predictions: []
                });
            }
            
            consolidatedMap.get(time)!.predictions.push({
                miner_uid: minerPrediction.miner_uid,
                rank: topMiners.indexOf(minerInfo) + 1,
                price
            });
        });
    });
    
    // Convert to array and sort by time
    const consolidatedArray = Array.from(consolidatedMap.values())
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    
    return consolidatedArray;
};

export const get_synth_analysis_str = async (asset: 'BTC' | 'ETH', gmxDataCache?: EnhancedDataCache) => {
    try {
        // Get consolidated array from cache if available, fallback to direct fetch
        const consolidatedArray = gmxDataCache ? 
            await gmxDataCache.getSynthConsolidatedArray(asset) : 
            await fetchSynthData(asset);
        
        // Get current price from cache
        const currentPrice = await getCurrentAssetPrice(asset, gmxDataCache);
        
        // Analyze and return formatted string
        return analyzeSynthPredictions(consolidatedArray, asset, currentPrice);
        
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[SYNTH_ANALYSIS] Failed to get ${asset} analysis:`, errorMsg);
        return `=== SYNTH INTELLIGENCE RECAP [${new Date().toISOString()}] ===\n\n⚠️ Error: ${errorMsg}\n\n=== END SYNTH RECAP ===`;
    }
};

// Helper function to calculate technical indicators for a single timeframe
const calculateTechnicalIndicators = (candles: number[][], period: string, tokenSymbol: string) => {
    // Parse candlestick data: [timestamp, open, high, low, close]
    const ohlcData = candles.map((candle: number[]) => ({
        timestamp: candle[0],
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        date: new Date(candle[0] * 1000).toISOString().split('T')[0]
    }));
    
    // Sort by timestamp (oldest first) for proper indicator calculation
    ohlcData.sort((a, b) => a.timestamp - b.timestamp);
    
    // Extract price arrays for technical indicators
    const closes = ohlcData.map(d => d.close);
    const highs = ohlcData.map(d => d.high);
    const lows = ohlcData.map(d => d.low);
    
    // Calculate basic price metrics
    const currentPrice = closes[closes.length - 1];
    const previousPrice = closes[closes.length - 2];
    const priceChange = currentPrice - previousPrice;
    const priceChangePercent = (priceChange / previousPrice) * 100;
    
    // Moving Averages
    const sma20 = SMA.calculate({ period: Math.min(20, closes.length), values: closes });
    const sma50 = SMA.calculate({ period: Math.min(50, closes.length), values: closes });
    const ema5 = EMA.calculate({ period: Math.min(5, closes.length), values: closes });
    const ema8 = EMA.calculate({ period: Math.min(8, closes.length), values: closes });
    const ema12 = EMA.calculate({ period: Math.min(12, closes.length), values: closes });
    const ema21 = EMA.calculate({ period: Math.min(21, closes.length), values: closes });
    const ema26 = EMA.calculate({ period: Math.min(26, closes.length), values: closes });
    
    // RSI (14-period)
    const rsi = RSI.calculate({ period: Math.min(14, closes.length), values: closes });
    
    // MACD
    const macd = MACD.calculate({
        fastPeriod: Math.min(12, closes.length),
        slowPeriod: Math.min(26, closes.length),
        signalPeriod: Math.min(9, closes.length),
        values: closes,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });
    
    // Bollinger Bands (20-period, 2 standard deviations)
    const bb = BollingerBands.calculate({
        period: Math.min(20, closes.length),
        stdDev: 2,
        values: closes
    });
    
    // ATR (14-period) for volatility
    const atr = ATR.calculate({
        period: Math.min(14, closes.length),
        high: highs,
        low: lows,
        close: closes
    });
    
    // Stochastic Oscillator
    const stoch = Stochastic.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: Math.min(14, closes.length),
        signalPeriod: Math.min(3, closes.length)
    });
    
    // Williams %R (14-period)
    const williamsR = WilliamsR.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: Math.min(14, closes.length)
    });
    
    // Commodity Channel Index (20-period)
    const cci = CCI.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: Math.min(20, closes.length)
    });
    
    // Average Directional Index (14-period)
    const adx = ADX.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: Math.min(14, closes.length)
    });
    
    // Get latest values
    const latestSMA20 = sma20[sma20.length - 1];
    const latestSMA50 = sma50[sma50.length - 1];
    const latestEMA5 = ema5[ema5.length - 1];
    const latestEMA8 = ema8[ema8.length - 1];
    const latestEMA12 = ema12[ema12.length - 1];
    const latestEMA21 = ema21[ema21.length - 1];
    const latestEMA26 = ema26[ema26.length - 1];
    const latestRSI = rsi[rsi.length - 1];
    const latestMACD = macd[macd.length - 1];
    const latestBB = bb[bb.length - 1];
    const latestATR = atr[atr.length - 1];
    const latestStoch = stoch[stoch.length - 1];
    const latestWilliamsR = williamsR[williamsR.length - 1];
    const latestCCI = cci[cci.length - 1];
    const latestADX = adx[adx.length - 1];
    
    // Calculate support/resistance levels
    const recentHighs = highs.slice(-20);
    const recentLows = lows.slice(-20);
    const resistance = Math.max(...recentHighs);
    const support = Math.min(...recentLows);
    
    // 1. EMA Alignment Score - when fast EMAs are stacked properly
    const calculateEmaAlignment = () => {
        const emas = [latestEMA5, latestEMA8, latestEMA12, latestEMA21, latestEMA26];
        let bullishAlignment = 0;
        let bearishAlignment = 0;
        
        // Check EMA ordering
        for (let i = 0; i < emas.length - 1; i++) {
            if (emas[i] !== undefined && emas[i + 1] !== undefined) {
                if (emas[i] > emas[i + 1]) bullishAlignment++;
                else if (emas[i] < emas[i + 1]) bearishAlignment++;
            }
        }
        
        // Calculate alignment score with perfect alignment priority
        let alignmentScore;
        if (bullishAlignment === 4) alignmentScore = 4;      // Perfect bullish alignment
        else if (bearishAlignment === 4) alignmentScore = -4; // Perfect bearish alignment
        else alignmentScore = bullishAlignment - bearishAlignment; // Mixed signals
        
        return {
            score: alignmentScore,
            bullishLayers: bullishAlignment,
            bearishLayers: bearishAlignment,
            strength: Math.max(bullishAlignment, bearishAlignment) / 4 * 100 // Percentage strength
        };
    };
    
    const emaAlignment = calculateEmaAlignment();
    
    // RSI Divergence Detection - price vs RSI momentum
    const calculateRsiDivergence = () => {
        const lookback = Math.min(10, closes.length);
        if (lookback < 5 || rsi.length < lookback) return { rsiDivergence: 'none' };
        
        // Get recent price and RSI data
        const recentPrices = closes.slice(-lookback);
        const recentRSI = rsi.slice(-lookback);
        
        // Simple linear regression slope calculation
        const calculateSlope = (data: number[]) => {
            const n = data.length;
            if (n < 2) return 0;
            
            const sumX = (n * (n - 1)) / 2;
            const sumY = data.reduce((sum, val) => sum + val, 0);
            const sumXY = data.reduce((sum, val, i) => sum + val * i, 0);
            const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
            
            const denominator = n * sumX2 - sumX * sumX;
            if (denominator === 0) return 0;
            
            return (n * sumXY - sumX * sumY) / denominator;
        };
        
        const priceSlope = calculateSlope(recentPrices);
        const rsiSlope = calculateSlope(recentRSI);
        
        // Detect RSI divergence (opposite slopes with significant magnitude)
        const rsiDivergence = Math.abs(priceSlope) > 0.01 && Math.abs(rsiSlope) > 0.01 ?
            (priceSlope > 0 && rsiSlope < 0 ? 'bearish' : 
             priceSlope < 0 && rsiSlope > 0 ? 'bullish' : 'none') : 'none';
        
        return { rsiDivergence };
    };
    
    // MACD Divergence Detection - price vs MACD momentum
    const calculateMacdDivergence = () => {
        const lookback = Math.min(10, closes.length);
        if (lookback < 5 || macd.length < lookback) return { macdDivergence: 'none' };
        
        // Get recent price and MACD data
        const recentPrices = closes.slice(-lookback);
        const recentMACD = macd.slice(-lookback).map(m => m.MACD);
        
        // Simple linear regression slope calculation
        const calculateSlope = (data: number[]) => {
            const n = data.length;
            if (n < 2) return 0;
            
            const sumX = (n * (n - 1)) / 2;
            const sumY = data.reduce((sum, val) => sum + val, 0);
            const sumXY = data.reduce((sum, val, i) => sum + val * i, 0);
            const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
            
            const denominator = n * sumX2 - sumX * sumX;
            if (denominator === 0) return 0;
            
            return (n * sumXY - sumX * sumY) / denominator;
        };
        
        const priceSlope = calculateSlope(recentPrices);
        const macdSlope = calculateSlope(recentMACD);
        
        // Detect MACD divergence (opposite slopes with significant magnitude)
        const macdDivergence = Math.abs(priceSlope) > 0.01 && Math.abs(macdSlope) > 0.01 ?
            (priceSlope > 0 && macdSlope < 0 ? 'bearish' : 
             priceSlope < 0 && macdSlope > 0 ? 'bullish' : 'none') : 'none';
        
        return { macdDivergence };
    };
    
    const rsiDivergenceData = calculateRsiDivergence();
    const macdDivergenceData = calculateMacdDivergence();
    
    return {
        period,
        currentPrice,
        priceChange,
        priceChangePercent,
        candleCount: candles.length,
        lastUpdate: ohlcData[ohlcData.length - 1].date,
        indicators: {
            sma20: latestSMA20,
            sma50: latestSMA50,
            ema5: latestEMA5,
            ema8: latestEMA8,
            ema12: latestEMA12,
            ema21: latestEMA21,
            ema26: latestEMA26,
            rsi: latestRSI,
            macd: latestMACD,
            bb: latestBB,
            atr: latestATR,
            stoch: latestStoch,
            williamsR: latestWilliamsR,
            cci: latestCCI,
            adx: latestADX
        },
        signals: {
            emaAlignment,
            rsiDivergence: rsiDivergenceData.rsiDivergence,
            macdDivergence: macdDivergenceData.macdDivergence
        },
        levels: {
            resistance,
            support,
            distanceToResistance: ((resistance - currentPrice) / currentPrice * 100),
            distanceToSupport: ((currentPrice - support) / currentPrice * 100)
        }
    };
};

// Technical Analysis Query - Fetch candlestick data for all timeframes and calculate indicators
export const get_technical_analysis_str = async (
    sdk: GmxSdk,
    tokenSymbol: 'BTC' | 'ETH',
    gmxDataCache?: EnhancedDataCache
): Promise<string> => {
    try {
        // First get current market price using SDK
        const marketsResult = gmxDataCache ? await gmxDataCache.getMarketsInfo() : await sdk.markets.getMarketsInfo().catch(error => {
            throw new Error(`Failed to get market data: ${error.message || error}`);
        });
        const { marketsInfoData, tokensData } = marketsResult;
        
        if (!marketsInfoData || !tokensData) {
            throw new Error("Failed to get market and token data");
        }
        
        // Find the appropriate market for the token (BTC/USD or ETH/USD)
        let currentMarkPrice: bigint | null = null;
        let marketFound = false;
        
        for (const [marketAddress, marketInfo] of Object.entries(marketsInfoData)) {
            if (marketInfo.name && marketInfo.indexToken) {
                const isBtcMarket = tokenSymbol === 'BTC' && 
                    (marketInfo.name.includes('BTC/USD') || marketInfo.name.includes('BTC-USD'));
                const isEthMarket = tokenSymbol === 'ETH' && 
                    (marketInfo.name.includes('ETH/USD') || marketInfo.name.includes('ETH-USD'));
                
                if ((isBtcMarket || isEthMarket) && !marketInfo.isSpotOnly) {
                    const indexToken = tokensData[marketInfo.indexTokenAddress];
                    if (indexToken && indexToken.prices) {
                        // Use mid price for technical analysis
                        const maxPrice = indexToken.prices.maxPrice || 0n;
                        const minPrice = indexToken.prices.minPrice || 0n;
                        currentMarkPrice = (maxPrice + minPrice) / 2n;
                        marketFound = true;
                        break;
                    }
                }
            }
        }
        
        if (!marketFound || !currentMarkPrice) {
            throw new Error(`Could not find market price for ${tokenSymbol}`);
        }
        
        const timeframes = ['15m', '1h', '4h'] as const;
        const analysisResults: any[] = [];
        
        // Fetch data for all timeframes in parallel
        const fetchPromises = timeframes.map(async (period) => {
            try {
                const url = `https://arbitrum-api.gmxinfra.io/prices/candles?tokenSymbol=${tokenSymbol}&period=${period}`;
                
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch candlestick data for ${period}: ${response.status} ${response.statusText}`);
                }
                
                const data = await response.json();
                
                if (!data || !data.candles || !Array.isArray(data.candles)) {
                    throw new Error(`Invalid candlestick data received for ${tokenSymbol} ${period}`);
                }
                
                const candles = data.candles;
                if (candles.length < 30) {
                    console.warn(`Insufficient data for ${period} analysis. Got ${candles.length} candles, need at least 30`);
                    return null;
                }
                
                const analysis = calculateTechnicalIndicators(candles, period, tokenSymbol);
                return analysis;
            } catch (error) {
                console.error(`Error fetching data for ${period}:`, error);
                return null;
            }
        });
        
        const results = await Promise.all(fetchPromises);
        
        // Filter out failed requests
        results.forEach(result => {
            if (result !== null) {
                analysisResults.push(result);
            }
        });
        
        if (analysisResults.length === 0) {
            throw new Error(`No valid data available for ${tokenSymbol} technical analysis`);
        }
        
        // Use the actual mark price from SDK instead of last candle price
        const currentPrice = bigIntToDecimal(currentMarkPrice, USD_DECIMALS);
        
        // 3. Multi-timeframe Confluence Scoring
        const calculateConfluenceScore = () => {
            let bullishSignals = 0;
            let bearishSignals = 0;
            let totalSignals = 0;
            
            analysisResults.forEach(data => {
                const { emaAlignment, rsiDivergence, macdDivergence } = data.signals;
                const indicators = data.indicators;
                
                // EMA alignment signals
                if (emaAlignment.score > 2) bullishSignals++;
                else if (emaAlignment.score < -2) bearishSignals++;
                totalSignals++;
                
                // RSI signals
                if (indicators.rsi < 30) bullishSignals++;
                else if (indicators.rsi > 70) bearishSignals++;
                totalSignals++;
                
                // MACD signals
                if (indicators.macd?.MACD !== undefined && indicators.macd?.signal !== undefined) {
                    if (indicators.macd.MACD > indicators.macd.signal) bullishSignals++;
                    else if (indicators.macd.MACD < indicators.macd.signal) bearishSignals++;
                    totalSignals++;
                }
                
                // Price vs SMA signals (use real current price)
                if (currentPrice > indicators.sma20) bullishSignals++;
                else if (currentPrice < indicators.sma20) bearishSignals++;
                totalSignals++;
                
                // ADX trend strength
                if (indicators.adx?.adx !== undefined && indicators.adx?.adx > 25 && 
                    indicators.adx?.pdi !== undefined && indicators.adx?.mdi !== undefined) {
                    if (indicators.adx.pdi > indicators.adx.mdi) bullishSignals++;
                    else bearishSignals++;
                    totalSignals++;
                }
                
                // RSI divergence signals
                if (rsiDivergence === 'bullish') {
                    bullishSignals++;
                    totalSignals++;
                } else if (rsiDivergence === 'bearish') {
                    bearishSignals++;
                    totalSignals++;
                }
                
                // MACD divergence signals
                if (macdDivergence === 'bullish') {
                    bullishSignals++;
                    totalSignals++;
                } else if (macdDivergence === 'bearish') {
                    bearishSignals++;
                    totalSignals++;
                }
                
            });
            
            const confluenceScore = totalSignals > 0 ? ((bullishSignals - bearishSignals) / totalSignals) * 100 : 0;
            
            return {
                score: confluenceScore.toFixed(1),
                bullishSignals,
                bearishSignals,
                totalSignals,
                strength: Math.abs(confluenceScore) > 60 ? 'STRONG' : Math.abs(confluenceScore) > 30 ? 'MODERATE' : 'WEAK',
                direction: confluenceScore > 10 ? 'BULLISH' : confluenceScore < -10 ? 'BEARISH' : 'NEUTRAL'
            };
        };
        
        const confluenceAnalysis = calculateConfluenceScore();
        
        // Format raw technical indicator data for AI analysis
        let output = `📊 TECHNICAL INDICATORS - ${tokenSymbol}\n`;
        output += '═'.repeat(60) + '\n\n';
        
        output += `💰 CURRENT PRICE: $${currentPrice.toFixed(2)}\n\n`;
        
        // Multi-timeframe confluence summary
        output += `🎯 CONFLUENCE ANALYSIS\n`;
        output += `├─ Overall Signal: ${confluenceAnalysis.direction} (${confluenceAnalysis.strength})\n`;
        output += `├─ Confluence Score: ${confluenceAnalysis.score}%\n`;
        output += `├─ Bullish Signals: ${confluenceAnalysis.bullishSignals}/${confluenceAnalysis.totalSignals}\n`;
        output += `└─ Bearish Signals: ${confluenceAnalysis.bearishSignals}/${confluenceAnalysis.totalSignals}\n\n`;
        
        // Raw indicator data by timeframe
        for (const data of analysisResults) {
            output += `⏰ ${data.period.toUpperCase()} TIMEFRAME (${data.candleCount} candles)\n`;
            output += `├─ Last Candle Close: $${data.currentPrice.toFixed(2)} (${data.priceChangePercent > 0 ? '+' : ''}${data.priceChangePercent.toFixed(2)}%)\n`;
            output += `├─ SMA(20): $${data.indicators.sma20?.toFixed(2) || 'N/A'}\n`;
            output += `├─ SMA(50): $${data.indicators.sma50?.toFixed(2) || 'N/A'}\n`;
            output += `├─ EMA(5): $${data.indicators.ema5?.toFixed(2) || 'N/A'}\n`;
            output += `├─ EMA(8): $${data.indicators.ema8?.toFixed(2) || 'N/A'}\n`;
            output += `├─ EMA(12): $${data.indicators.ema12?.toFixed(2) || 'N/A'}\n`;
            output += `├─ EMA(21): $${data.indicators.ema21?.toFixed(2) || 'N/A'}\n`;
            output += `├─ EMA(26): $${data.indicators.ema26?.toFixed(2) || 'N/A'}\n`;
            // Add explicit RSI status to prevent AI misinterpretation
            const rsiValue = data.indicators.rsi;
            const rsiStatus = rsiValue ? (rsiValue > 70 ? 'OVERBOUGHT' : rsiValue < 30 ? 'OVERSOLD' : 'NEUTRAL') : 'N/A';
            output += `├─ RSI(14): ${rsiValue?.toFixed(2) || 'N/A'} (${rsiStatus})\n`;
            // Add explicit MACD signal status to prevent AI misinterpretation
            const macdValue = data.indicators.macd?.MACD;
            const macdSignalValue = data.indicators.macd?.signal;
            const macdCrossover = macdValue && macdSignalValue ? 
                (macdValue > macdSignalValue ? 'BULLISH' : 'BEARISH') : 'N/A';
            output += `├─ MACD: ${macdValue?.toFixed(4) || 'N/A'}\n`;
            output += `├─ MACD Signal: ${macdSignalValue?.toFixed(4) || 'N/A'}\n`;
            output += `├─ MACD Crossover: ${macdCrossover}\n`;
            output += `├─ MACD Histogram: ${data.indicators.macd?.histogram?.toFixed(4) || 'N/A'}\n`;
            output += `├─ Bollinger Upper: $${data.indicators.bb?.upper?.toFixed(2) || 'N/A'}\n`;
            output += `├─ Bollinger Middle: $${data.indicators.bb?.middle?.toFixed(2) || 'N/A'}\n`;
            output += `├─ Bollinger Lower: $${data.indicators.bb?.lower?.toFixed(2) || 'N/A'}\n`;
            output += `├─ ATR(14): ${data.indicators.atr?.toFixed(2) || 'N/A'}\n`;
            // Add explicit Stochastic status to prevent AI misinterpretation
            const stochK = data.indicators.stoch?.k;
            const stochStatus = stochK ? (stochK > 80 ? 'OVERBOUGHT' : stochK < 20 ? 'OVERSOLD' : 'NEUTRAL') : 'N/A';
            output += `├─ Stochastic %K: ${stochK?.toFixed(2) || 'N/A'} (${stochStatus})\n`;
            output += `├─ Stochastic %D: ${data.indicators.stoch?.d?.toFixed(2) || 'N/A'}\n`;
            
            // Add explicit Williams %R status to prevent AI misinterpretation
            const williamsR = data.indicators.williamsR;
            const williamsStatus = williamsR ? (williamsR > -20 ? 'OVERBOUGHT' : williamsR < -80 ? 'OVERSOLD' : 'NEUTRAL') : 'N/A';
            output += `├─ Williams %R: ${williamsR?.toFixed(2) || 'N/A'} (${williamsStatus})\n`;
            output += `├─ CCI(20): ${data.indicators.cci?.toFixed(2) || 'N/A'}\n`;
            output += `├─ ADX(14): ${data.indicators.adx?.adx?.toFixed(2) || 'N/A'}\n`;
            output += `├─ +DI: ${data.indicators.adx?.pdi?.toFixed(2) || 'N/A'}\n`;
            output += `├─ -DI: ${data.indicators.adx?.mdi?.toFixed(2) || 'N/A'}\n`;
            output += `├─ EMA Alignment: ${data.signals.emaAlignment.score}/4 (${data.signals.emaAlignment.strength.toFixed(1)}%)\n`;
            output += `├─ RSI Divergence: ${data.signals.rsiDivergence}\n`;
            output += `├─ MACD Divergence: ${data.signals.macdDivergence}\n`;
            output += `├─ Support: $${data.levels.support.toFixed(2)}\n`;
            output += `└─ Resistance: $${data.levels.resistance.toFixed(2)}\n\n`;
        }
        
        return output;
        
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch technical analysis for ${tokenSymbol}: ${errorMsg}`);
    }
};

export const get_trading_history_str = async (sdk: GmxSdk, gmxDataCache?: EnhancedDataCache) => {
    try {
        // Get markets and tokens data first
        const marketsResult = gmxDataCache ? await gmxDataCache.getMarketsInfo() : await sdk.markets.getMarketsInfo().catch(error => {
            throw new Error(`Failed to get markets data: ${error.message || error}`);
        });
        const { marketsInfoData } = marketsResult;
        
        const tokensResult = gmxDataCache ? await gmxDataCache.getTokensData() : await sdk.tokens.getTokensData().catch(error => {
            throw new Error(`Failed to get tokens data: ${error.message || error}`);
        });
        const { tokensData } = tokensResult;

        if (!marketsInfoData || !tokensData) {
            throw new Error("Failed to get required market and token data for trading history");
        }

        // Fetch all trades with pagination to get complete history
        let allTrades: any[] = [];
        let pageIndex = 0;
        const pageSize = 1000;
        let hasMoreData = true;

        while (hasMoreData) {
            try {
                const history = await sdk.trades.getTradeHistory({
                    forAllAccounts: false,
                    pageSize: pageSize,
                    pageIndex: pageIndex,
                    marketsInfoData: marketsInfoData,
                    tokensData: tokensData,
                });
                
                if (history && history.length > 0) {
                    allTrades.push(...history);
                    pageIndex++;
                    
                    // If we got less than the page size, we've reached the end
                    if (history.length < pageSize) {
                        hasMoreData = false;
                    }
                } else {
                    hasMoreData = false;
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                
                // Handle GraphQL errors gracefully
                if (errorMsg.includes('GraphQL') || errorMsg.includes('502') || errorMsg.includes('HTTP error')) {
                    console.warn('Trading history unavailable due to GraphQL error:', errorMsg);
                    return '📊 TRADING PERFORMANCE: Trade history temporarily unavailable\n';
                }
                
                // Check if it's a temporary network error
                const isTemporaryError = errorMsg.includes('503') || 
                                       errorMsg.includes('504') ||
                                       errorMsg.includes('timeout');
                
                if (isTemporaryError && pageIndex === 0) {
                    // If we can't get any data at all, throw the error
                    throw new Error(`Failed to get trade history: ${errorMsg}`);
                } else if (isTemporaryError) {
                    // If we have some data but hit an error on later pages, stop gracefully
                    console.warn(`Trading history fetch stopped at page ${pageIndex} due to network error: ${errorMsg}`);
                    hasMoreData = false;
                } else {
                    // For other errors, throw immediately
                    throw new Error(`Failed to get trade history: ${errorMsg}`);
                }
            }

            // Safety break to prevent infinite loops
            if (pageIndex > 50) { // Max 50 pages (50k trades)
                break;
            }
        }

        // Filter to only executed trades and exclude swaps (orderType 0 and 1)
        const executedTrades = allTrades.filter(trade => 
            trade.eventName === 'OrderExecuted' && 
            trade.orderType !== 0 && // Market Swap
            trade.orderType !== 1    // Limit Swap
        );

        const processedTrades = executedTrades.map((trade: any) => {
            // Handle timestamp - ensure it's in seconds
            let finalTimestamp = trade.timestamp || Date.now() / 1000;
            
            // If timestamp looks like it's in milliseconds (> year 2100 in seconds), convert to seconds
            if (finalTimestamp > 4102444800) { // Jan 1, 2100 in seconds
                finalTimestamp = finalTimestamp / 1000;
            }

            // Calculate collateralDeltaUsd from the raw amount
            let collateralDeltaUsd = 0;
            if (trade.initialCollateralDeltaAmount && trade.initialCollateralToken) {
                // Use the execution price if available, otherwise use current token price
                const collateralPrice = trade.collateralTokenPriceMax || 
                                      trade.collateralTokenPriceMin || 
                                      trade.initialCollateralToken?.prices?.maxPrice ||
                                      trade.initialCollateralToken?.prices?.minPrice;
                
                if (collateralPrice) {
                    const collateralUsdBigInt = convertToUsd(
                        trade.initialCollateralDeltaAmount,
                        trade.initialCollateralToken.decimals || 18,
                        collateralPrice
                    );
                    collateralDeltaUsd = collateralUsdBigInt ? bigIntToDecimal(collateralUsdBigInt, USD_DECIMALS) : 0;
                }
            }

            return {
                id: trade.id || `${trade.transaction?.hash}-${Date.now()}`,
                txHash: trade.transaction?.hash,
                blockNumber: trade.transaction?.blockNumber,
                timestamp: finalTimestamp,
                eventName: trade.eventName,
                orderType: trade.orderType,
                orderKey: trade.orderKey,
                account: trade.account,
                marketAddress: trade.marketAddress || trade.marketInfo?.marketTokenAddress,
                isLong: trade.isLong,
                sizeDeltaUsd: trade.sizeDeltaUsd ? bigIntToDecimal(trade.sizeDeltaUsd, USD_DECIMALS) : 0,
                collateralDeltaAmount: trade.initialCollateralDeltaAmount,
                collateralDeltaUsd: collateralDeltaUsd,
                triggerPrice: trade.triggerPrice && trade.triggerPrice !== 0n ? bigIntToDecimal(trade.triggerPrice, USD_DECIMALS) : 0,
                acceptablePrice: trade.acceptablePrice ? bigIntToDecimal(trade.acceptablePrice, USD_DECIMALS) : 0,
                executionPrice: trade.executionPrice ? bigIntToDecimal(trade.executionPrice, USD_DECIMALS) : 0,
                priceImpactUsd: trade.priceImpactUsd ? bigIntToDecimal(trade.priceImpactUsd, USD_DECIMALS) : 0,
                positionFeeAmount: trade.positionFeeAmount,
                borrowingFeeAmount: trade.borrowingFeeAmount,
                fundingFeeAmount: trade.fundingFeeAmount,
                pnlUsd: trade.pnlUsd ? bigIntToDecimal(trade.pnlUsd, USD_DECIMALS) : trade.basePnlUsd ? bigIntToDecimal(trade.basePnlUsd, USD_DECIMALS) : 0,
                marketInfo: trade.marketInfo,
                indexToken: trade.indexToken,
                collateralToken: trade.initialCollateralToken || trade.targetCollateralToken,
            };
        });

        const trades = processedTrades.sort((a, b) => b.timestamp - a.timestamp); // Sort by newest first
        
        if (!trades || trades.length === 0) {
            return '📊 TRADING PERFORMANCE: No trading history available';
        }

        // Use the performance metrics calculation from utils
        const metrics = calculatePerformanceMetrics(trades);
        const avgTradeSize = trades.reduce((sum, t) => sum + Math.abs(t.sizeDeltaUsd), 0) / trades.length;

        let output = `📊 TRADING PERFORMANCE\n`;
        output += `├─ Total Trades: ${trades.length}\n`;
        output += `├─ Date Range: ${new Date(trades[trades.length - 1].timestamp * 1000).toLocaleDateString()} to ${new Date(trades[0].timestamp * 1000).toLocaleDateString()}\n`;
        output += `├─ Total P&L: ${metrics.totalPnl >= 0 ? '+' : ''}$${metrics.totalPnl.toFixed(2)}\n`;
        output += `├─ Win Rate: ${metrics.winRate.toFixed(1)}% (${metrics.winningTrades}/${metrics.totalTrades})\n`;
        output += `├─ Average Win: +$${metrics.averageProfit.toFixed(2)}\n`;
        output += `├─ Average Loss: -$${metrics.averageLoss.toFixed(2)}\n`;
        output += `├─ Profit Factor: ${metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)}x\n`;
        output += `├─ Average Trade Size: $${avgTradeSize.toFixed(2)}\n`;
        output += `├─ Largest Win: +$${metrics.largestWin.toFixed(2)}\n`;
        output += `└─ Largest Loss: $${metrics.largestLoss.toFixed(2)}\n\n`;

        // Analyze by position type
        const longTrades = trades.filter(t => t.isLong);
        const shortTrades = trades.filter(t => !t.isLong);
        const longMetrics = calculatePerformanceMetrics(longTrades);
        const shortMetrics = calculatePerformanceMetrics(shortTrades);
        
        output += `📊 POSITION TYPE ANALYSIS\n`;
        output += `├─ Long Positions: ${longTrades.length} trades\n`;
        output += `│  ├─ P&L: ${longMetrics.totalPnl >= 0 ? '+' : ''}$${longMetrics.totalPnl.toFixed(2)}\n`;
        output += `│  └─ Win Rate: ${longMetrics.winRate.toFixed(1)}%\n`;
        output += `├─ Short Positions: ${shortTrades.length} trades\n`;
        output += `│  ├─ P&L: ${shortMetrics.totalPnl >= 0 ? '+' : ''}$${shortMetrics.totalPnl.toFixed(2)}\n`;
        output += `│  └─ Win Rate: ${shortMetrics.winRate.toFixed(1)}%\n\n`;

        // Show recent trades (last 10)
        output += `🕒 RECENT TRADES (Last 10)\n`;
        const recentTrades = trades.slice(0, 10);
        
        recentTrades.forEach((trade, index) => {
            const date = new Date(trade.timestamp * 1000);
            const marketName = trade.marketInfo?.name || 'Unknown Market';
            const side = trade.isLong ? 'LONG' : 'SHORT';
            const pnlColor = trade.pnlUsd >= 0 ? '+' : '';
            const isLast = index === recentTrades.length - 1;
            const prefix = isLast ? '└─' : '├─';
            
            output += `${prefix} ${index + 1}. ${marketName} ${side} - ${pnlColor}$${trade.pnlUsd.toFixed(2)} (${date.toLocaleDateString()})\n`;
        });

        return output;
        
    } catch (error) {
        throw new Error(`Failed to get trading history: ${error instanceof Error ? error.message : String(error)}`);
    }
};