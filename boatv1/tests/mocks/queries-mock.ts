/**
 * Mock query functions for testing
 */

export async function get_portfolio_balance_str(sdk: any): Promise<string> {
    return `🏦 PORTFOLIO BALANCE ANALYSIS
═══════════════════════════════════════════

💰 TOKEN HOLDINGS:
┌─────────────────────────────────────────
├─ USDC: 50,000.00 ($50,000.00)
├─ WETH: 0.0100 ($35.00)
├─ BTC: 0.0000 ($0.00)
└─ Total Token Value: $50,035.00

📊 POSITION VALUES:
┌─────────────────────────────────────────
├─ Open Positions: 1
├─ Total Position Value: $10,150.00
├─ Unrealized PnL: +$150.00 (+1.50%)
└─ Collateral Locked: $2,000.00

📈 PORTFOLIO SUMMARY:
┌─────────────────────────────────────────
├─ Total Portfolio Value: $60,185.00
├─ Available Balance: $48,035.00
├─ Position Allocation: 16.87%
└─ Cash Allocation: 83.13%`;
}

export async function get_positions_str(sdk: any): Promise<string> {
    return `📊 CURRENT POSITIONS ANALYSIS
═══════════════════════════════════════════

📈 ACTIVE POSITIONS (1):

🔹 BTC/USD - LONG
├─ Size: $10,000.00
├─ Entry Price: $64,000.00
├─ Current Price: $65,000.00
├─ Leverage: 5.0x
├─ Unrealized PnL: +$150.00 (+1.50%)
├─ Liquidation Price: $58,000.00
├─ Distance to Liquidation: -10.77%
├─ Collateral: $2,000.00
└─ Risk Level: MODERATE`;
}

export async function get_btc_eth_markets_str(sdk: any): Promise<string> {
    return `🏛️ BTC & ETH MARKETS OVERVIEW
═══════════════════════════════════════════

🔶 BTC/USD MARKET:
┌─────────────────────────────────────────
├─ Market Address: 0xBTC123456789
├─ Current Price: $65,000.00
├─ 24h Change: +2.35%
├─ Funding Rate: 0.00001 (0.001%)
├─ Open Interest:
│  ├─ Long: $50,000,000
│  ├─ Short: $45,000,000
│  └─ Ratio: 1.11 (Bullish)
└─ Available Liquidity: $100,000,000

🔷 ETH/USD MARKET:
┌─────────────────────────────────────────
├─ Market Address: 0xETH123456789
├─ Current Price: $3,500.00
├─ 24h Change: +1.85%
├─ Funding Rate: 0.00002 (0.002%)
├─ Open Interest:
│  ├─ Long: $30,000,000
│  ├─ Short: $28,000,000
│  └─ Ratio: 1.07 (Slightly Bullish)
└─ Available Liquidity: $75,000,000`;
}

export async function get_tokens_data_str(sdk: any): Promise<string> {
    return `💎 AVAILABLE TOKENS
═══════════════════════════════════════════

📊 TOKEN INFORMATION:

🔹 USDC (USD Coin)
├─ Address: 0xaf88d065e77c8cC2239327C5EDb3A432268e5831
├─ Decimals: 6
├─ Balance: 50,000.000000
└─ Value: $50,000.00

🔹 WETH (Wrapped Ether)
├─ Address: 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1
├─ Decimals: 18
├─ Balance: 0.010000
└─ Value: $35.00

🔹 BTC (Bitcoin)
├─ Address: 0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f
├─ Decimals: 8
├─ Balance: 0.000000
└─ Value: $0.00`;
}

export async function get_daily_volumes_str(sdk: any): Promise<string> {
    return `📊 24H TRADING VOLUMES
═══════════════════════════════════════════

🔶 BTC/USD:
├─ Total Volume: $250,000,000
├─ Long Volume: $135,000,000
├─ Short Volume: $115,000,000
└─ Volume Trend: 📈 +15.2%

🔷 ETH/USD:
├─ Total Volume: $180,000,000
├─ Long Volume: $95,000,000
├─ Short Volume: $85,000,000
└─ Volume Trend: 📈 +8.5%`;
}

export async function get_orders_str(sdk: any): Promise<string> {
    return `📋 PENDING ORDERS ANALYSIS
═══════════════════════════════════════════

⏳ ACTIVE ORDERS (1):

🔹 ETH/USD - SHORT (Limit Order)
├─ Size: $5,000.00
├─ Trigger Price: $3,600.00
├─ Current Price: $3,500.00
├─ Distance: +2.86%
├─ Order Age: 1 hour
├─ Execution Probability: LOW
└─ Status: Waiting for price`;
}

export async function get_trading_history_str(sdk: any): Promise<string> {
    return `📈 TRADING PERFORMANCE ANALYSIS
═══════════════════════════════════════════

📊 OVERALL STATISTICS:
├─ Total Trades: 25
├─ Winning Trades: 15 (60.0%)
├─ Losing Trades: 10 (40.0%)
├─ Total PnL: +$2,500.00
├─ Average Win: +$350.00
├─ Average Loss: -$225.00
├─ Profit Factor: 2.33
└─ Sharpe Ratio: 1.85

🏆 RECENT TRADES (Last 5):
1. BTC/USD LONG - +$150.00 (+1.5%) - OPEN
2. ETH/USD SHORT - +$250.00 (+2.1%) - 2h ago
3. BTC/USD LONG - -$100.00 (-0.8%) - 5h ago
4. ETH/USD LONG - +$300.00 (+2.5%) - 8h ago
5. BTC/USD SHORT - +$180.00 (+1.2%) - 12h ago`;
}

export async function get_synth_predictions_consolidated_str(asset: string): Promise<string> {
    const price = asset === 'BTC' ? 65000 : 3500;
    const predictions = asset === 'BTC' ? [
        { miner: 'Alpha', prediction: price * 1.02, confidence: 85 },
        { miner: 'Beta', prediction: price * 1.015, confidence: 80 },
        { miner: 'Gamma', prediction: price * 1.025, confidence: 75 }
    ] : [
        { miner: 'Alpha', prediction: price * 1.018, confidence: 82 },
        { miner: 'Beta', prediction: price * 1.012, confidence: 78 },
        { miner: 'Gamma', prediction: price * 1.022, confidence: 76 }
    ];
    
    return `🔮 SYNTH AI PREDICTIONS - ${asset}
═══════════════════════════════════════════

📊 CONSOLIDATED FORECAST:
├─ Current Price: $${price.toLocaleString()}.00
├─ Average Prediction: $${(price * 1.02).toLocaleString()}.00
├─ Consensus: BULLISH
└─ Confidence: 80%

🏆 TOP MINERS:
${predictions.map((p, i) => 
`${i + 1}. ${p.miner} Miner
   ├─ Prediction: $${p.prediction.toLocaleString()}.00
   ├─ Change: +${((p.prediction / price - 1) * 100).toFixed(2)}%
   └─ Confidence: ${p.confidence}%`
).join('\n')}`;
}

export async function get_technical_analysis_str(sdk: any, asset: string): Promise<string> {
    return `📊 TECHNICAL ANALYSIS - ${asset}/USD
═══════════════════════════════════════════

🕐 15M TIMEFRAME:
├─ Trend: BULLISH
├─ RSI: 58.5 (Neutral)
├─ MACD: Bullish Cross
├─ Support: $${asset === 'BTC' ? '64,500' : '3,450'}
└─ Resistance: $${asset === 'BTC' ? '65,500' : '3,550'}

🕐 1H TIMEFRAME:
├─ Trend: BULLISH
├─ RSI: 62.3 (Slightly Overbought)
├─ MACD: Bullish
├─ Support: $${asset === 'BTC' ? '64,000' : '3,400'}
└─ Resistance: $${asset === 'BTC' ? '66,000' : '3,600'}

🎯 CONFLUENCE SCORE: 4/5
└─ Strong bullish setup with multiple confirmations`;
}