import { bigIntToDecimal, formatTokenAmount, formatUsdAmount, convertToUsd, USD_DECIMALS, getTradeActionDescriptionEnhanced } from "./utils";
import { calculatePositionPnl, calculateLeverage, calculateLiquidationPrice, calculatePositionNetValue } from "./utils";
import { GmxSdk } from "@gmx-io/sdk";
import { SMA, EMA, RSI, MACD, BollingerBands, ATR, Stochastic, WilliamsR, CCI, ADX } from 'technicalindicators';

export const get_portfolio_balance_str = async (sdk: GmxSdk) => {
    // Get tokens data with balances and prices
    const { tokensData } = await sdk.tokens.getTokensData().catch(error => {
        throw new Error(`Failed to get tokens data: ${error.message || error}`);
    });
    
    // Get markets and positions data
    const { marketsInfoData } = await sdk.markets.getMarketsInfo().catch(error => {
        throw new Error(`Failed to get markets data: ${error.message || error}`);
    });
    
    if (!tokensData || !marketsInfoData) {
        throw new Error("Failed to get required market and token data");
    }

    // Get positions data (same method as working get_positions_str function)
    const positionsResult = await sdk.positions.getPositions({
        marketsData: marketsInfoData,
        tokensData: tokensData,
        start: 0,
        end: 1000,
    }).catch(error => {
        throw new Error(`Failed to get positions: ${error.message || error}`);
    });

    // Get enhanced positions info for value calculations
    const positionsInfoResult = await sdk.positions.getPositionsInfo({
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

export const get_positions_str = async (sdk: GmxSdk) => {
    // Get required market and token data first
    const { marketsInfoData, tokensData } = await sdk.markets.getMarketsInfo().catch(error => {
        throw new Error(`Failed to get market data: ${error.message || error}`);
    });
    
    if (!marketsInfoData || !tokensData) {
        throw new Error("Failed to get market and token data");
    }

    // Use official SDK method with required parameters
    const positionsResult = await sdk.positions.getPositions({
        marketsData: marketsInfoData,
        tokensData: tokensData,
        start: 0,
        end: 1000,
    }).catch(error => {
        throw new Error(`Failed to get positions: ${error.message || error}`);
    });
    
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
export const get_btc_eth_markets_str = async (sdk: GmxSdk) => {
    try {
        // Get all markets data
        const { marketsInfoData, tokensData } = await sdk.markets.getMarketsInfo().catch(error => {
            throw new Error(`Failed to get markets data: ${error.message || error}`);
        });
        
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
export const get_tokens_data_str = async (sdk: GmxSdk) => {
    try {
        // Get all tokens data - destructure tokensData from the response
        const { tokensData } = await sdk.tokens.getTokensData().catch(error => {
            throw new Error(`Failed to get tokens data: ${error.message || error}`);
        });
        
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
export const get_daily_volumes_str = async (sdk: GmxSdk) => {
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
        const { marketsInfoData } = await sdk.markets.getMarketsInfo().catch(error => {
            throw new Error(`Failed to get markets data: ${error.message || error}`);
        });
        
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

export const get_orders_str = async (sdk: GmxSdk) => {
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
                        executionStatus = "✅ Ready to Execute";
                    } else if (!order.isLong && markPriceUsd <= triggerPriceUsd) {
                        executionStatus = "✅ Ready to Execute";
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

export const get_synth_predictions_consolidated_str = async (asset: 'BTC' | 'ETH') => {
    try {
        // Step 1: Fetch top miners from validation scores for the specific asset
        const scoresResponse = await fetch(`https://api.synthdata.co/validation/scores/latest?asset=${asset}`, {
            headers: {
                'Authorization': `Apikey ${process.env.SYNTH_API_KEY}`
            }
        });
        
        // Handle rate limiting gracefully
        if (scoresResponse.status === 429) {
            return `📊 ${asset} SYNTH PREDICTIONS\n└─ ⚠️ Rate limited - predictions temporarily unavailable. Please try again later.\n`;
        }
        
        if (!scoresResponse.ok) {
            throw new Error(`Failed to fetch validation scores: ${scoresResponse.statusText}`);
        }
        
        const scoresData = await scoresResponse.json();

        // Extract miners from the scores data - assuming it returns an array of miners with scores
        if (!scoresData || !Array.isArray(scoresData)) {
            throw new Error("Invalid validation scores data format");
        }
        
        // The API returns miners already sorted by performance (best first)
        const topMiners = scoresData
            .slice(0, 3) // Take top 10 miners
            .map((miner: any, index: number) => ({
                neuron_uid: miner.miner_uid || miner.neuron_uid || miner.uid,
                rank: index + 1,
                score: miner.crps || miner.score
            }));
        
        if (topMiners.length === 0) {
            throw new Error(`No miners found in validation scores for ${asset}`);
        }
        
        // Step 2: Fetch predictions for all miners at once using the new API
        const minerIds = topMiners.map(m => m.neuron_uid);
        const minerParams = minerIds.map(id => `miner=${id}`).join('&');
        
        // Using the new prediction/latest endpoint with multiple miners
        const predictionsUrl = `https://api.synthdata.co/prediction/latest?${minerParams}&asset=${asset}&time_increment=300&time_length=86400`;
        
        const predictionsResponse = await fetch(predictionsUrl, {
            headers: {
                'Authorization': `Apikey ${process.env.SYNTH_API_KEY}`
            }
        });
        
        // Handle rate limiting gracefully
        if (predictionsResponse.status === 429) {
            return `📊 ${asset} SYNTH PREDICTIONS\n└─ ⚠️ Rate limited - predictions temporarily unavailable. Please try again later.\n`;
        }
        
        if (!predictionsResponse.ok) {
            throw new Error(`Failed to fetch predictions: ${predictionsResponse.statusText}`);
        }
        
        const predictionsData = await predictionsResponse.json();

        // Process the predictions data - the API returns an array of miner prediction objects
        if (!predictionsData || !Array.isArray(predictionsData)) {
            throw new Error("Invalid predictions data format");
        }
        
        // Step 3: Consolidate predictions by time
        const consolidatedMap = new Map<string, any>();
        
        // Process each miner's prediction data
        predictionsData.forEach((minerPrediction: any) => {
            // Find the rank for this miner
            const minerInfo = topMiners.find(m => m.neuron_uid === minerPrediction.miner_uid);
            if (!minerInfo) {
                console.warn(`Miner ${minerPrediction.miner_uid} not found in top miners list`);
                return;
            }
            // Extract predictions from the nested array structure
            if (!minerPrediction.prediction || !Array.isArray(minerPrediction.prediction) || 
                !minerPrediction.prediction[0] || !Array.isArray(minerPrediction.prediction[0])) {
                console.warn(`Invalid prediction structure for miner ${minerPrediction.miner_uid}`);
                return;
            }
            
            // The predictions are in prediction[0] which contains an array of {time, price} objects
            const predictions = minerPrediction.prediction[0];
            
            // Process each prediction point
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
                
                consolidatedMap.get(time).predictions.push({
                    miner_uid: minerPrediction.miner_uid,
                    rank: minerInfo.rank,
                    price
                });
            });
        });
        
        // Convert to array and sort by time
        const consolidatedArray = Array.from(consolidatedMap.values())
            .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        
        // Format raw prediction data for AI analysis
        let resultString = `📊 ${asset} SYNTH PREDICTIONS\n`;
        
        // Count unique miners that returned predictions
        const uniqueMiners = new Set<number>();
        consolidatedArray.forEach(timeSlot => {
            timeSlot.predictions.forEach((pred: any) => {
                uniqueMiners.add(pred.miner_uid);
            });
        });
        
        resultString += `├─ Active Miners: ${uniqueMiners.size}\n`;
        resultString += `├─ Prediction Windows: ${consolidatedArray.length}\n`;
        resultString += `└─ Asset: ${asset}\n\n`;
        
        // Raw prediction data by time - let AI do the analysis
        consolidatedArray.forEach((timeSlot, index) => {
            const isLast = index === consolidatedArray.length - 1;
            const prefix = isLast ? '└─' : '├─';
            
            resultString += `${prefix} Time: ${timeSlot.time}\n`;
            
            // Sort miners by rank for consistent display
            const sortedPredictions = timeSlot.predictions.sort((a: any, b: any) => a.rank - b.rank);
            
            sortedPredictions.forEach((pred: any, predIndex: number) => {
                const price = typeof pred.price === 'number' ? pred.price.toFixed(2) : pred.price;
                const isLastPred = predIndex === sortedPredictions.length - 1;
                const predPrefix = isLast ? (isLastPred ? '   └─' : '   ├─') : (isLastPred ? '│  └─' : '│  ├─');
                resultString += `${predPrefix} Rank ${pred.rank} (Miner ${pred.miner_uid}): $${price}\n`;
            });
            
            if (!isLast) {
                resultString += `│\n`;
            }
        });
        
        return resultString;
        
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch Synth predictions for ${asset}: ${errorMsg}`);
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
    tokenSymbol: 'BTC' | 'ETH'
): Promise<string> => {
    try {
        // First get current market price using SDK
        const { marketsInfoData, tokensData } = await sdk.markets.getMarketsInfo().catch(error => {
            throw new Error(`Failed to get market data: ${error.message || error}`);
        });
        
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
        
        const timeframes = ['5m', '15m', '1h', '4h'] as const;
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
            output += `├─ RSI(14): ${data.indicators.rsi?.toFixed(2) || 'N/A'}\n`;
            output += `├─ MACD: ${data.indicators.macd?.MACD?.toFixed(4) || 'N/A'}\n`;
            output += `├─ MACD Signal: ${data.indicators.macd?.signal?.toFixed(4) || 'N/A'}\n`;
            output += `├─ MACD Histogram: ${data.indicators.macd?.histogram?.toFixed(4) || 'N/A'}\n`;
            output += `├─ Bollinger Upper: $${data.indicators.bb?.upper?.toFixed(2) || 'N/A'}\n`;
            output += `├─ Bollinger Middle: $${data.indicators.bb?.middle?.toFixed(2) || 'N/A'}\n`;
            output += `├─ Bollinger Lower: $${data.indicators.bb?.lower?.toFixed(2) || 'N/A'}\n`;
            output += `├─ ATR(14): ${data.indicators.atr?.toFixed(2) || 'N/A'}\n`;
            output += `├─ Stochastic %K: ${data.indicators.stoch?.k?.toFixed(2) || 'N/A'}\n`;
            output += `├─ Stochastic %D: ${data.indicators.stoch?.d?.toFixed(2) || 'N/A'}\n`;
            output += `├─ Williams %R: ${data.indicators.williamsR?.toFixed(2) || 'N/A'}\n`;
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