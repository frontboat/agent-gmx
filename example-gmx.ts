/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🌟 VEGA - GMX TRADING AGENT
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * A sophisticated AI trading assistant specializing in GMX perpetual futures
 * Built with the Daydreams framework and powered by advanced personality modeling
 * 
 * ✨ Features:
 * • Full GMX protocol integration with real-time trading
 * • Advanced risk management with data-driven decision making
 * • Multi-platform support (CLI + Discord)
 * • Comprehensive market analysis and position tracking
 * • Obsessive risk-conscious personality (10/10 risk management)
 * 
 * 🚀 Quick Start:
 * 1. Configure environment variables (see .env.example)
 * 2. Ensure wallet has sufficient funds for trading
 * 3. Run: `bun run examples/gmx/example-gmx.ts`
 * 
 * ⚠️  IMPORTANT: Ensure token approvals are set via app.gmx.io before trading
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 📦 IMPORTS
// ═══════════════════════════════════════════════════════════════════════════════

import { openrouter } from "@openrouter/ai-sdk-provider";
import { 
    createDreams, 
    context, 
    render, 
    action, 
    input,
    extension,
    validateEnv, 
    LogLevel,
    Logger
} from "@daydreamsai/core";
import { discord } from "@daydreamsai/discord";
import { createMongoMemoryStore } from "@daydreamsai/mongodb";
import { z } from "zod/v4";
import { GmxSdk } from "@gmx-io/sdk";
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createGmxActions } from './gmx-actions';
import type { GmxMemory } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// ⚙️ ENVIRONMENT VALIDATION & SETUP
// ═══════════════════════════════════════════════════════════════════════════════

console.log("🚀 Starting GMX Trading Agent...");

const env = validateEnv(
    z.object({
        ANTHROPIC_API_KEY: z.string(),
        OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
        GMX_NETWORK: z.enum(["arbitrum", "avalanche"]).default("arbitrum"),
        GMX_CHAIN_ID: z.string(),
        GMX_ORACLE_URL: z.string(),
        GMX_RPC_URL: z.string(),
        GMX_SUBSQUID_URL: z.string(),
        GMX_WALLET_ADDRESS: z.string(),
        GMX_PRIVATE_KEY: z.string(),
        GMX_MAX_POSITION_SIZE: z.string().default("10"),
        GMX_MIN_POSITION_SIZE: z.string().default("5"),
        GMX_MAX_LEVERAGE: z.string().default("3"),
        GMX_SLIPPAGE_TOLERANCE: z.string().default("125"),
        MARKET_ANALYSIS_INTERVAL: z.string().default("300000"),
        POSITION_CHECK_INTERVAL: z.string().default("60000"),
        AUTO_TAKE_PROFIT_PERCENT: z.string().default("20"),
        AUTO_STOP_LOSS_PERCENT: z.string().default("10"),
        SYNTH_API_KEY: z.string().min(1, "SYNTH_API_KEY is required for market intelligence"),
        DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required for Discord output"),
        DISCORD_BOT_NAME: z.string().min(1, "DISCORD_BOT_NAME is required for Discord output"),
        MONGODB_STRING: z.string().min(1, "MONGODB_STRING is required for persistent memory"),
    })
);

// ═══════════════════════════════════════════════════════════════════════════════
// 🔐 WALLET & SDK CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// Validate hex address format
const validateHexAddress = (address: string): address is `0x${string}` => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
};

const validatePrivateKey = (key: string): key is `0x${string}` => {
    return /^0x[a-fA-F0-9]{64}$/.test(key);
};

// Validate private key format
if (!validatePrivateKey(env.GMX_PRIVATE_KEY)) {
    throw new Error("Invalid private key format. Must be 64 hex characters with 0x prefix.");
}

// Validate wallet address format
if (!validateHexAddress(env.GMX_WALLET_ADDRESS)) {
    throw new Error("Invalid wallet address format. Must be 40 hex characters with 0x prefix.");
}

const account = privateKeyToAccount(env.GMX_PRIVATE_KEY as `0x${string}`);

// Define supported chain configurations
const SUPPORTED_CHAINS = {
    42161: { 
        name: "Arbitrum One", 
        symbol: "ETH", 
        decimals: 18,
        network: "arbitrum"
    },
    43114: { 
        name: "Avalanche", 
        symbol: "AVAX", 
        decimals: 18,
        network: "avalanche"
    },
    // Add more chains as needed
} as const;

const chainId = parseInt(env.GMX_CHAIN_ID);
const chainConfig = SUPPORTED_CHAINS[chainId as keyof typeof SUPPORTED_CHAINS];

if (!chainConfig) {
    throw new Error(`Unsupported chain ID: ${chainId}. Supported chains: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`);
}

// Validate that network matches chain ID
if (chainConfig.network !== env.GMX_NETWORK) {
    throw new Error(`Network mismatch: Chain ID ${chainId} corresponds to ${chainConfig.network}, but GMX_NETWORK is set to ${env.GMX_NETWORK}`);
}

const walletClient = createWalletClient({
    account,
    transport: http(env.GMX_RPC_URL),
    chain: { 
        id: chainId,
        name: chainConfig.name,
        nativeCurrency: {
            decimals: chainConfig.decimals,
            name: chainConfig.name,
            symbol: chainConfig.symbol
        },
        rpcUrls: {
            default: { http: [env.GMX_RPC_URL] },
            public: { http: [env.GMX_RPC_URL] }
        }
    }
});

const sdk = new GmxSdk({
    rpcUrl: env.GMX_RPC_URL,
    chainId: chainId,
    oracleUrl: env.GMX_ORACLE_URL,
    walletClient: walletClient,
    subsquidUrl: env.GMX_SUBSQUID_URL,
    subgraphUrl: env.GMX_SUBSQUID_URL,
    account: account?.address || env.GMX_WALLET_ADDRESS as `0x${string}`
});

if (env.GMX_WALLET_ADDRESS) {
    sdk.setAccount(env.GMX_WALLET_ADDRESS as `0x${string}`);
    console.log(`💼 GMX SDK initialized with account: ${env.GMX_WALLET_ADDRESS}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🤖 VEGA CHARACTER DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

const vegaCharacter = {
    id: "vega-gmx-scalping-competitor-v1",
    name: "Vega",
    description: "Elite GMX scalping specialist competing for top rankings"
};

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 GMX TRADING CONTEXT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const gmxContext = context<GmxMemory>({
    id: "vega-gmx-scalping-context",
    type: "gmx-trading-agent",
    maxSteps: 100,
    schema: z.object({
        name: z.string().describe("The agent's name"),
        role: z.string().describe("The agent's role and specialization"),
    }),
    instructions: `
You are ${vegaCharacter.name}, ${vegaCharacter.description}.
 You are ${vegaCharacter.name}, ${vegaCharacter.description}.

🏆 COMPETITION MODE: You are competing in a GMX scalping competition. Every trade counts toward your ranking. 
Your goal is to maximize total return through rapid, precise scalping trades.

## Scalping Strategy

### 🎯 When to Scalp
- Find the trend using synth miners predictions
- Open a scalping position in the direction of the trend

### 🛡️ Risk Management
- Set up stop losses and take profits on every trade
- **Portfolio Limits**: Never exceed maximum position size

### Available actions :
- get_portfolio_balance: Get the current balance of the portfolio.
- get_markets_info: Get detailed information about markets and tokens.
- get_markets_list: Get a list of markets.
- get_daily_volumes: Get daily volume data for markets.
- get_tokens_data: Get data for available tokens on GMX.
- get_positions: Get all current trading positions.
- get_orders: Get all pending orders.
- get_trade_history: Get trading history.
- get_synth_leaderboard: Get the current leaderboard of top-performing Synth miners.
- get_latest_predictions: Get real-time prediction data from specific Synth miners.
- cancel_orders: Cancel one or more pending orders.
- open_long_position: Open a long position.
- open_short_position: Open a short position.
- swap_tokens: Swap tokens.
- create_take_profit_order: Create a take profit order.
- create_stop_loss_order: Create a stop loss order.
- close_position_market: Close position immediately at market price.

## Critical Trading Rules

### 🔢 Parameter Format (MANDATORY)
**Helper Functions**: Use simplified helper function parameters (NOT raw SDK parameters)

**Position Opening**: Use EITHER payAmount OR sizeAmount
- payAmount: Token amount in token's native decimals as string (e.g. "1000000" for 1 USDC)
- sizeAmount: Position size in USD with 30 decimals as string (e.g. "5000000000000000000000000000000000" for $5000)

**Required Parameters**:
- marketAddress: Market token address (from getMarketsInfo)
- payTokenAddress: Token you're paying with
- collateralTokenAddress: Token for collateral

**Optional Parameters**:
- leverage: Basis points as string (e.g. "50000" for 5x)
- limitPrice: For limit orders (30 decimal USD string)
- allowedSlippageBps: Default 100 (1%)

**EXAMPLE - Short Position with Size Amount**:
\`\`\`json
{
  "sizeAmount": "5000000000000000000000000000000000",
  "marketAddress": "0x47c031236e19d024b42f8AE6780E44A573170703",
  "payTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "collateralTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "leverage": "30000"
}
\`\`\`

**NEVER use**: indexTokenAddress, acceptablePrice, minOutputAmount, orderType, sizeUsd, collateralAmount, triggerPrice (for positions)

### 💰 Position Sizing
- Fetch the current balance using get_portfolio_balance
- Calculate the max position size based on the balance
- Calculate the max leverage based on the balance
- Calculate the dynamic sizing based on the balance
- Calculate the conviction scaling based on the balance

- **Max Position**: use ${env.GMX_MIN_POSITION_SIZE}% up to ${env.GMX_MAX_POSITION_SIZE}% of portfolio
- **Max Leverage**: Use 1x up to ${env.GMX_MAX_LEVERAGE}x leverage
- **Dynamic Sizing**: Calculate based on current portfolio value
- **Conviction Scaling**: Larger positions for higher-conviction trades

### ⚡ Execution Protocol
1. **Sequential Only**: Execute trades ONE AT A TIME (never parallel)
2. **Wait Between**: 1-2 second pause between transactions  
3. **Complete Analysis**: Finish analysis and take action in same response
4. **No "Thinking" Endings**: Every conversation must end with executed action
5. **Nonce Too Low Error**: If you see "nonce too low" error, it means you're sending transactions too quickly. Wait 3-5 seconds and retry the transaction

## Communication Style

### 📝 Discord Rules
- Natural language only (no JSON output)
- Use Discord formatting (**bold**, *italic*)
- Under 2000 characters per message
- Always provide helpful response even if action fails
- Keep scalping updates under 500 characters

## Key Reminders
- You ARE competing - every trade counts toward ranking
- Execute scalps immediately
- Set TP/SL automatically on every position
- Calculate position sizes dynamically based on portfolio value
- Never end responses with analysis—always execute a decision
- Competition mode: aggressive but calculated risk-taking

`,
render: (state) => {
    const memory = state.memory;
    
    return `
        **🏆 ${vegaCharacter.name} - GMX Scalping Competitor** ⚡

        **🎯 Competition Status**
        - Current Mode: ${memory.currentTask || "Hunting scalping opportunities"}

        **📊 Live Performance**
        - Active Scalps: ${memory.positions.length}
        - Total P&L: $${memory.totalPnl.toFixed(2)}
        - Win Rate: ${memory.winRate.toFixed(1)}% (target: >75%)
        - Trade Count: ${memory.trades.length} 
        - Avg Win: $${memory.averageProfit.toFixed(2)} | Avg Loss: $${memory.averageLoss.toFixed(2)}

        **⚡ Scalping Parameters**
        - Position Size: ${env.GMX_MIN_POSITION_SIZE}% up to ${env.GMX_MAX_POSITION_SIZE}% of portfolio
        - Max Leverage: 1x up to ${env.GMX_MAX_LEVERAGE}x leverage

        **🤖 AI Intelligence**
        - Top Synth Miners: ${memory.synthLeaderboard.topMinerIds.length}
        - Last AI Update: ${memory.synthLeaderboard.lastUpdated ? new Date(memory.synthLeaderboard.lastUpdated).toLocaleString() : "Fetching..."}
        - Active Signals: ${Object.keys(memory.synthPredictions).reduce((total, asset) => total + Object.keys(memory.synthPredictions[asset]).length, 0)} predictions

        **🔥 Competition Mode**
        - Markets: BTC ${Object.keys(memory.markets).includes('BTC') ? '✅' : '⏳'} | ETH ${Object.keys(memory.markets).includes('ETH') ? '✅' : '⏳'}

        ${memory.lastResult ? `**⚡ Last Action:** ${memory.lastResult}` : ""}

        🎯 Ready to scalp !
    `;
  },
  create: () => {
        console.log("🎯 Creating memory for GMX trading agent");
        
        return {
            // Core trading data
            positions: [],
            orders: [],
            markets: {},
            tokens: {},
            volumes: {},
            
            // Trading performance
            trades: [],
            totalPnl: 0,
            winRate: 0,
            averageProfit: 0,
            averageLoss: 0,
            
            // Current state
            currentTask: "Initializing GMX trading agent",
            lastResult: null,
            
            // Risk configuration
            maxPositionSize: parseFloat(env.GMX_MAX_POSITION_SIZE || "10"),
            minPositionSize: parseFloat(env.GMX_MIN_POSITION_SIZE || "5"),
            maxLeverage: parseInt(env.GMX_MAX_LEVERAGE || "3"),
            slippageTolerance: parseInt(env.GMX_SLIPPAGE_TOLERANCE || "125"),
            
            // Trading strategy
            activeStrategies: ["Scalping"],
            
            // Synth intelligence data
            synthLeaderboard: {
                miners: [],
                lastUpdated: null,
                topMinerIds: []
            },
            synthPredictions: {}
        };
    },
}).setInputs({
    "gmx:scalping-cycle": input({
        subscribe(send, { container }) {
            console.log("⚡ Scalping cycle input ACTIVATED - starting 5-minute intervals");
            console.log("📋 Send function:", typeof send);
            console.log("🏗️ Container available:", !!container);
            
            const interval = setInterval(async () => {
                console.log("⏰ Scalping cycle triggered - sending to Vega");
                try {
                    await send(gmxContext, 
                        { name: "vega", role: "scalping-competitor" }, 
                        "🏆 Scalping cycle time! Pick up where we left off and check markets, monitor positions, scan for opportunities using synth data, and execute trades autonomously. Follow the trends !"
                    );
                    console.log("✅ Send completed successfully");
                } catch (error) {
                    console.error("❌ Send failed:", error);
                }
            }, 300000); // 5 minutes

            console.log("✅ Scalping cycle subscription setup complete");
            return () => {
                console.log("🛑 Scalping cycle subscription cleanup");
                clearInterval(interval);
            };
        }
    })
});

// Create GMX actions using the SDK instance
const gmxActions = createGmxActions(sdk, env);

// ═══════════════════════════════════════════════════════════════════════════════
// 🔌 GMX EXTENSION DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

const gmx = extension({
    name: "gmx",
    contexts: {
        gmxTrading: gmxContext,
    },
});

console.log("⚡ Initializing Vega trading agent...");

// Initialize persistent memory stores
console.log("🗄️ Setting up MongoDB persistent memory...");
const mongoMemoryStore = await createMongoMemoryStore({
    uri: env.MONGODB_STRING,
    dbName: "vega_trading_agent", 
    collectionName: "gmx_memory"
});

console.log("✅ Memory stores initialized!");

// Create the agent with persistent memory
const agent = createDreams({
    model: openrouter("google/gemini-2.5-flash-preview-05-20"),
    logger: new Logger({ level: LogLevel.DEBUG }), // Enable debug logging
    extensions: [discord, gmx], // Add GMX extension
    context: gmx.contexts!.gmxTrading, // Use context from extension
    defaultOutput: "discord:message",
    actions: gmxActions,
    memory: {
        store: mongoMemoryStore
    },
});

console.log("✅ Agent created successfully!");

// Start the agent with GMX context arguments
await agent.start({
    name: vegaCharacter.name,
    role: vegaCharacter.description,
});

console.log("🎯 Vega is now live and ready for GMX trading!");
console.log("📡 Discord Channel ID:", env.DISCORD_CHANNEL_ID);
console.log("🤖 Discord Bot Name:", env.DISCORD_BOT_NAME);
