import { bigIntToDecimal, formatTokenAmount, formatUsdAmount, convertToUsd, USD_DECIMALS } from "./utils";
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

    // Get positions info for portfolio value calculation
    const positionsResult = await sdk.positions.getPositionsInfo({
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
    
    if (positionsResult.positionsInfoData) {
        Object.values(positionsResult.positionsInfoData).forEach((position: any) => {
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