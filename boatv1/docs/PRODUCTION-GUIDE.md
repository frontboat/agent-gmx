# GMX Trading Agent - Production Best Practices

## 🚨 Critical Issues to Address Before Production

### 1. **Output Type Definitions**

The `NotFoundError` seen in tests will occur in production if outputs aren't properly defined. 

**❌ Problem**: AI tries to use output types that don't exist
```typescript
// AI might try: <output type="market_analysis_and_portfolio_summary">
// But this type doesn't exist in the context
```

**✅ Solution**: Define all expected output types in your context
```typescript
const gmxContext = context({
    // ... other config
    
    outputs: {
        trade_executed: {
            description: "Notification when a trade is executed",
            schema: z.object({
                market: z.string(),
                direction: z.enum(["long", "short"]),
                size: z.string(),
                entryPrice: z.string()
            })
        },
        
        market_analysis: {
            description: "Market analysis results",
            schema: z.object({
                market: z.string(),
                analysis: z.string(),
                recommendation: z.enum(["strong_buy", "buy", "hold", "sell", "strong_sell"])
            })
        },
        
        risk_alert: {
            description: "Risk warnings",
            schema: z.object({
                type: z.string(),
                severity: z.enum(["info", "warning", "critical"]),
                message: z.string()
            })
        },
        
        status_update: {
            description: "General updates",
            schema: z.string() // Simple text updates
        }
    }
});
```

### 2. **Error Handling in Production**

**Add error boundaries around agent operations:**

```typescript
// Wrap agent runs with try-catch
try {
    const result = await agent.run({
        context: gmxContext,
        args: { /* ... */ },
        handlers: {
            onLogStream: (log, done) => {
                // Handle errors gracefully
                if (log.ref === 'output' && (log as any).error) {
                    console.error('Output error:', (log as any).error);
                    // Log to monitoring system
                    // Fallback to safe mode
                }
            }
        }
    });
} catch (error) {
    console.error('Agent run failed:', error);
    // Implement fallback strategy
    // Alert monitoring system
    // Ensure positions are safe
}
```

### 3. **Production Monitoring**

**Essential monitoring for trading agent:**

```typescript
// Add comprehensive logging
const productionLogger = new Logger({
    level: LogLevel.INFO,
    transports: [
        new ConsoleTransport(),
        // Add file transport for persistent logs
        new FileTransport({
            filename: 'logs/trading-{date}.log'
        }),
        // Add remote logging for alerts
        new RemoteTransport({
            endpoint: 'https://your-logging-service.com'
        })
    ]
});

// Monitor key metrics
setInterval(async () => {
    const metrics = {
        positions: await sdk.positions.getPositions(),
        balance: await sdk.reader.getAccountBalances(account),
        memory: process.memoryUsage(),
        errors: errorCount
    };
    
    // Send to monitoring dashboard
    await sendMetrics(metrics);
}, 60000); // Every minute
```

### 4. **Graceful Degradation**

**When AI outputs fail, have fallbacks:**

```typescript
// Define fallback handlers
const outputHandlers = {
    trade_executed: async (data) => {
        // Primary handler
        try {
            await notifyTradeExecution(data);
        } catch (error) {
            // Fallback: log locally
            console.error('Trade notification failed:', error);
            await logTradeLocally(data);
        }
    },
    
    risk_alert: async (data) => {
        if (data.severity === 'critical') {
            // Multiple notification channels for critical alerts
            await Promise.allSettled([
                sendDiscordAlert(data),
                sendEmailAlert(data),
                logToDatabase(data)
            ]);
        }
    }
};
```

### 5. **Health Checks**

**Implement regular health checks:**

```typescript
const healthCheck = async () => {
    const checks = {
        gmxConnection: false,
        aiResponsive: false,
        memoryHealthy: false,
        walletsAccessible: false
    };
    
    try {
        // Check GMX connection
        await sdk.markets.getMarkets();
        checks.gmxConnection = true;
        
        // Check AI responsiveness
        const testResult = await agent.run({
            context: healthContext,
            args: { test: true }
        });
        checks.aiResponsive = testResult.length > 0;
        
        // Check memory system
        const memoryTest = await agent.memory.store.get('health-check');
        checks.memoryHealthy = true;
        
        // Check wallet access
        const balance = await sdk.reader.getAccountBalances(account);
        checks.walletsAccessible = !!balance;
        
    } catch (error) {
        console.error('Health check failed:', error);
    }
    
    return checks;
};

// Run health checks every 5 minutes
setInterval(async () => {
    const health = await healthCheck();
    if (!Object.values(health).every(v => v)) {
        console.error('Health check failed:', health);
        // Trigger alerts
        // Consider stopping trading
    }
}, 300000);
```

### 6. **Position Safety**

**Always ensure positions are protected:**

```typescript
// Before any risky operation
const protectPositions = async () => {
    const positions = await sdk.positions.getPositions();
    
    for (const position of positions) {
        // Ensure stop loss is set
        if (!position.stopLossPrice) {
            console.warn('Position without stop loss detected!');
            // Set emergency stop loss
            await setEmergencyStopLoss(position);
        }
        
        // Check liquidation risk
        const liquidationRisk = calculateLiquidationRisk(position);
        if (liquidationRisk > 0.8) {
            console.error('High liquidation risk!', position);
            // Consider reducing position
        }
    }
};

// Run protection checks frequently
setInterval(protectPositions, 30000); // Every 30 seconds
```

### 7. **Environment-Specific Configuration**

```typescript
// Use different settings for production
const isProduction = process.env.NODE_ENV === 'production';

const agent = createDreams({
    model: isProduction 
        ? openrouter("anthropic/claude-sonnet-4") // More reliable
        : openrouter("google/gemini-2.5-flash"),   // Faster/cheaper for dev
        
    modelSettings: {
        temperature: isProduction ? 0.7 : 0.9, // Less creative in production
        maxTokens: 4096,
    },
    
    // More conservative in production
    taskRunner: new TaskRunner(isProduction ? 3 : 5),
    
    // Production-grade logging
    logger: productionLogger,
    
    // Ensure training data is captured
    exportTrainingData: true,
    trainingDataPath: "./training/production-trades"
});
```

## 📋 Production Checklist

Before deploying to production:

- [ ] All output types are defined in context
- [ ] Error handling wraps all agent operations
- [ ] Health checks are implemented
- [ ] Position protection is active
- [ ] Monitoring and alerting is configured
- [ ] Fallback strategies are in place
- [ ] Stop losses are mandatory on all positions
- [ ] Memory limits are configured
- [ ] API rate limits are respected
- [ ] Wallet permissions are minimal (trading only)
- [ ] Private keys are in secure key management
- [ ] Backup RPC endpoints are configured
- [ ] Circuit breakers for excessive losses
- [ ] Audit trail for all trades
- [ ] Disaster recovery plan documented

## 🚀 Deployment

1. **Start with paper trading** - Run in production environment but with testnet
2. **Small position sizes** - Start with minimal capital at risk
3. **Gradual scaling** - Increase position sizes based on performance
4. **24/7 monitoring** - Always have alerts configured
5. **Kill switch ready** - One command to stop all trading

Remember: The cost of a production error in trading can be significant. Over-engineer for safety!