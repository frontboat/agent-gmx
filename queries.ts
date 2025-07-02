import { bigIntToDecimal, formatTokenAmount, formatUsdAmount, convertToUsd, USD_DECIMALS, getTradeActionDescriptionEnhanced } from "./utils";
import { calculatePositionPnl, calculateLeverage, calculateLiquidationPrice, calculatePositionNetValue } from "./utils";
import { GmxSdk } from "@gmx-io/sdk";

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

    let output = `💰 PORTFOLIO SUMMARY\n`;
    output += `Total Value: $${totalPortfolioValue.toFixed(2)} (Tokens: $${totalTokenValueUsd.toFixed(2)} | Positions: $${totalPositionValueUsd.toFixed(2)})\n`;
    output += `Total PnL: $${totalPositionPnl.toFixed(2)}\n`;
    output += `Allocation: ${tokenAllocation.toFixed(1)}% tokens, ${positionAllocation.toFixed(1)}% positions\n\n`;
    
    // Add debugging info about positions
    if (positionValues.length > 0) {
        output += `📊 POSITION VALUES (${positionValues.length} positions):\n`;
        positionValues.forEach(pos => {
            output += `• ${pos.marketName} ${pos.side}: Net Value ${pos.netValue} (PnL: ${pos.pnl})\n`;
        });
        output += `\n`;
    } else if (positionsResult.positionsData && Object.keys(positionsResult.positionsData).length > 0) {
        output += `⚠️ DEBUG: Found ${Object.keys(positionsResult.positionsData).length} raw positions but couldn't process them\n\n`;
    } else {
        output += `📊 POSITION VALUES: No active positions\n\n`;
    }
    
    if (tokenBalances.length > 0) {
        output += `📊 TOKEN BALANCES (${tokenBalances.length} tokens):\n`;
        tokenBalances.forEach(token => {
            output += `• ${token.symbol}: ${token.balance} (${token.usdValue})\n`;
        });
    } else {
        output += `📊 TOKEN BALANCES: No token balances\n`;
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
        return `📈 POSITIONS: No active positions`;
    }
    
    const avgLeverage = enhancedPositions.length > 0 ? 
        `${(enhancedPositions.reduce((sum, pos) => 
            sum + parseFloat(pos.leverage.replace('x', '')), 0) / enhancedPositions.length).toFixed(2)}x` : 
        "0x";
    
    let output = `📈 ACTIVE POSITIONS (${enhancedPositions.length})\n`;
    output += `Total Size: $${totalSizeUsd.toFixed(2)} | Total PnL: $${totalPnl.toFixed(2)} | Avg Leverage: ${avgLeverage}\n\n`;
    
    enhancedPositions.forEach((pos, index) => {
        const profitEmoji = pos.pnl.includes('-') ? '🔴' : '🟢';
        output += `${index + 1}. ${profitEmoji} ${pos.marketName} ${pos.direction}\n`;
        output += `   Size: ${pos.sizeUsd} | PnL: ${pos.pnl} (${pos.pnlPercentage}) | Leverage: ${pos.leverage}\n`;
        output += `   Entry: ${pos.entryPrice} | Mark: ${pos.markPrice} | Liq: ${pos.liquidationPrice} (${pos.distanceToLiquidation} away)\n`;
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
        
        // Format as string output
        let output = '📊 BTC/ETH Markets Overview\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        
        if (filteredMarkets.length === 0) {
            output += 'No BTC or ETH markets found.\n';
            return output;
        }
        
        // Summary section
        const btcMarkets = filteredMarkets.filter(m => m.indexToken.includes('BTC'));
        const ethMarkets = filteredMarkets.filter(m => m.indexToken.includes('ETH'));
        
        output += `Found ${filteredMarkets.length} markets: ${btcMarkets.length} BTC, ${ethMarkets.length} ETH\n\n`;
        
        // Market details
        filteredMarkets.forEach((market, index) => {
            const statusIcon = market.isDisabled ? '🔴' : '🟢';
            output += `${index + 1}. ${statusIcon} ${market.name}\n`;
            output += `   Market Address: ${market.marketTokenAddress}\n`;
            output += `   Price: ${market.indexPrice} | Spread: ${market.spread}\n`;
            output += `   Pool Value: ${market.totalPoolValue}\n`;
            output += `   Long Interest: ${market.longInterestUsd} (${market.utilizationLong})\n`;
            output += `   Short Interest: ${market.shortInterestUsd} (${market.utilizationShort})\n`;
            output += `   Funding Rate: ${market.fundingRateLong} | Borrowing: ${market.borrowingRateLong}\n`;
            
            if (index < filteredMarkets.length - 1) output += '\n';
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
        
        // Format as string output
        let output = '🪙 Tokens Overview\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        
        if (filteredTokens.length === 0) {
            output += 'No relevant tokens found.\n';
            return output;
        }
        
        // Summary section
        const totalBalanceUsd = filteredTokens.reduce((sum, token) => sum + parseFloat(token.balanceUsd), 0);
        const tokensWithBalance = filteredTokens.filter(token => parseFloat(token.balance) > 0);
        
        output += `Found ${filteredTokens.length} tokens (${tokensWithBalance.length} with balance)\n`;
        output += `Total Balance: $${totalBalanceUsd.toFixed(2)}\n\n`;
        
        // Token details
        filteredTokens.forEach((token, index) => {
            const balanceIcon = parseFloat(token.balance) > 0 ? '💰' : '🔘';
            output += `${index + 1}. ${balanceIcon} ${token.symbol} (${token.name})\n`;
            output += `   Address: ${token.address}\n`;
            output += `   Balance: ${token.balance} (~$${token.balanceUsd})\n`;
            output += `   Price: $${token.priceUsd}\n`;
            output += `   Decimals: ${token.decimals}\n`;
            
            if (index < filteredTokens.length - 1) output += '\n';
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
        const volumes = await sdk.markets.getDailyVolumes();
        
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
        
        // Format as string output
        let output = '📈 Daily Volume Overview\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        
        if (filteredVolumes.length === 0) {
            output += 'No BTC or ETH volume data found.\n';
            return output;
        }
        
        // Summary section
        const totalVolume = filteredVolumes.reduce((sum, vol) => sum + parseFloat(vol.volumeUsd), 0);
        const btcVolumes = filteredVolumes.filter(v => v.indexToken.includes('BTC'));
        const ethVolumes = filteredVolumes.filter(v => v.indexToken.includes('ETH'));
        
        const btcTotalVolume = btcVolumes.reduce((sum, vol) => sum + parseFloat(vol.volumeUsd), 0);
        const ethTotalVolume = ethVolumes.reduce((sum, vol) => sum + parseFloat(vol.volumeUsd), 0);
        
        output += `Total Volume: $${totalVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`;
        output += `BTC Markets: $${btcTotalVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${btcVolumes.length} markets)\n`;
        output += `ETH Markets: $${ethTotalVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${ethVolumes.length} markets)\n\n`;
        
        // Volume details
        filteredVolumes.forEach((volume, index) => {
            const tokenIcon = volume.indexToken.includes('BTC') ? '₿' : '⟠';
            output += `${index + 1}. ${tokenIcon} ${volume.name}\n`;
            output += `   Market Address: ${volume.marketAddress}\n`;
            output += `   24h Volume: ${volume.volumeFormatted}\n`;
            
            if (index < filteredVolumes.length - 1) output += '\n';
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
            return "📋 No pending orders found.";
        }
        
        // Build formatted string
        let ordersString = `📋 PENDING ORDERS (${orders.length} total)\n`;
        ordersString += "═".repeat(60) + "\n\n";
        
        let totalOrderValue = 0;
        let highRiskCount = 0;
        
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
                
                // Format order info
                ordersString += `📌 Order #${index + 1} - ${marketInfo.name}\n`;
                ordersString += `├─ Type: ${order.isLong ? "🟢 LONG" : "🔴 SHORT"} ${orderTypeText}\n`;
                ordersString += `├─ Size: $${orderValueUsd.toFixed(2)} @ ${leverage.toFixed(2)}x leverage\n`;
                ordersString += `├─ Trigger: $${triggerPriceUsd.toFixed(2)} (Current: $${markPriceUsd.toFixed(2)})\n`;
                ordersString += `├─ Collateral: ${collateralValue.toFixed(6)} ${initialCollateralToken.symbol}\n`;
                ordersString += `├─ Status: ${executionStatus}\n`;
                ordersString += `├─ Age: ${orderAgeHours.toFixed(1)} hours\n`;
                ordersString += `└─ Order Key: ${order.key}\n\n`;
                
            } catch (error) {
                ordersString += `Order #${index + 1}: [Processing Error: ${error}]\n\n`;
            }
        });
        
        // Add summary
        ordersString += "═".repeat(60) + "\n";
        ordersString += "📊 SUMMARY\n";
        ordersString += `├─ Total Orders: ${orders.length}\n`;
        ordersString += `├─ Total Value: $${totalOrderValue.toFixed(2)}\n`;
        ordersString += `├─ High Risk Orders: ${highRiskCount}\n`;
        ordersString += `└─ Average Size: $${(totalOrderValue / orders.length).toFixed(2)}\n`;
        
        return ordersString;
        
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return `❌ Error fetching orders: ${errorMsg}`;
    }
};