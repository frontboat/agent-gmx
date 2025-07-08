/**
 * Production output handlers for GMX trading agent
 */

import { z } from "zod";
import type { OutputRef } from "@daydreamsai/core";
import { TradingDiscordClient } from "./discord-integration";

// Track output frequency to prevent spam
const outputThrottles = new Map<string, number>();
const OUTPUT_COOLDOWN_MS = 5000; // 5 seconds between similar outputs

/**
 * Throttle outputs to prevent spam
 */
function shouldThrottle(outputType: string, key?: string): boolean {
    const throttleKey = key ? `${outputType}:${key}` : outputType;
    const lastOutput = outputThrottles.get(throttleKey) || 0;
    const now = Date.now();
    
    if (now - lastOutput < OUTPUT_COOLDOWN_MS) {
        return true;
    }
    
    outputThrottles.set(throttleKey, now);
    return false;
}

// Initialize Discord client (will be set by the agent)
let discordClient: TradingDiscordClient | null = null;

export function setDiscordClient(client: TradingDiscordClient) {
    discordClient = client;
}

/**
 * Production output handlers
 */
export const productionOutputHandlers = {
    trade_executed: {
        description: "Notification when a trade is executed",
        schema: z.object({
            market: z.string(),
            direction: z.enum(["long", "short"]),
            size: z.string(),
            entryPrice: z.string(),
            timestamp: z.number()
        }),
        handler: async (data: any, ctx: any, agent: any) => {
            // Always log trades - no throttling
            console.log(`🔔 TRADE EXECUTED: ${data.direction.toUpperCase()} ${data.market} @ ${data.entryPrice}`);
            
            // Send to Discord
            if (discordClient) {
                await discordClient.notifyTradeExecution(data);
            }
            
            return { data, processed: true };
        }
    },
    
    market_analysis: {
        description: "Market analysis and trading recommendations",
        schema: z.object({
            market: z.string(),
            analysis: z.string(),
            recommendation: z.enum(["strong_buy", "buy", "hold", "sell", "strong_sell"]),
            confidence: z.number().min(0).max(100)
        }),
        handler: async (data: any, ctx: any, agent: any) => {
            // Throttle per market
            if (shouldThrottle('market_analysis', data.market)) {
                return { data, processed: true }; // Silent skip
            }
            
            console.log(`📊 MARKET ANALYSIS: ${data.market} - ${data.recommendation} (${data.confidence}% confidence)`);
            
            // Send to Discord for high confidence signals
            if (discordClient && data.confidence > 80) {
                await discordClient.notifyMarketAnalysis(data);
            }
            
            return { data, processed: true };
        }
    },
    
    risk_alert: {
        description: "Risk management alerts and warnings",
        schema: z.object({
            type: z.enum(["drawdown", "leverage", "position_size", "correlation"]),
            severity: z.enum(["info", "warning", "critical"]),
            message: z.string(),
            action_required: z.boolean()
        }),
        handler: async (data: any, ctx: any, agent: any) => {
            // Never throttle critical alerts
            if (data.severity !== 'critical' && shouldThrottle('risk_alert', data.type)) {
                return { data, processed: true };
            }
            
            const emoji = data.severity === 'critical' ? '🚨' : data.severity === 'warning' ? '⚠️' : 'ℹ️';
            console.log(`${emoji} RISK ALERT [${data.severity.toUpperCase()}]: ${data.message}`);
            
            if (data.action_required) {
                console.log(`   ⚡ ACTION REQUIRED: Check positions immediately!`);
            }
            
            // Send to Discord
            if (discordClient) {
                await discordClient.notifyRiskAlert(data);
            }
            
            return { data, processed: true };
        }
    },
    
    performance_report: {
        description: "Trading performance summary",
        schema: z.object({
            period: z.string(),
            totalTrades: z.number(),
            winRate: z.number(),
            totalPnL: z.string(),
            sharpeRatio: z.number()
        }),
        handler: async (data: any, ctx: any, agent: any) => {
            // Only one performance report per period
            if (shouldThrottle('performance_report', data.period)) {
                return { data, processed: true };
            }
            
            console.log(`\n📈 PERFORMANCE REPORT (${data.period})`);
            console.log(`├─ Total Trades: ${data.totalTrades}`);
            console.log(`├─ Win Rate: ${data.winRate.toFixed(2)}%`);
            console.log(`├─ Total P&L: ${data.totalPnL}`);
            console.log(`└─ Sharpe Ratio: ${data.sharpeRatio.toFixed(2)}\n`);
            
            // Send to Discord
            if (discordClient) {
                await discordClient.notifyPerformanceReport(data);
            }
            
            return { data, processed: true };
        }
    },
    
    status_update: {
        description: "General status updates and information",
        schema: z.string(),
        handler: async (data: any, ctx: any, agent: any) => {
            // Heavily throttle status updates
            if (shouldThrottle('status_update')) {
                return { data, processed: true };
            }
            
            console.log(`📋 STATUS: ${data}`);
            
            return { data, processed: true };
        }
    }
};

/**
 * Format output for logging
 */
export function formatOutputLog(output: OutputRef): string {
    const timestamp = new Date(output.timestamp).toISOString();
    return `[${timestamp}] ${output.type}: ${JSON.stringify(output.data)}`;
}

/**
 * Batch outputs for efficient processing
 */
export class OutputBatcher {
    private batch: OutputRef[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;
    
    constructor(
        private batchSize: number = 10,
        private batchDelayMs: number = 1000,
        private processor: (batch: OutputRef[]) => Promise<void>
    ) {}
    
    add(output: OutputRef) {
        this.batch.push(output);
        
        if (this.batch.length >= this.batchSize) {
            this.flush();
        } else if (!this.timer) {
            this.timer = setTimeout(() => this.flush(), this.batchDelayMs);
        }
    }
    
    async flush() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        
        if (this.batch.length === 0) return;
        
        const batchToProcess = [...this.batch];
        this.batch = [];
        
        try {
            await this.processor(batchToProcess);
        } catch (error) {
            console.error('Failed to process output batch:', error);
        }
    }
}

// Example usage:
// const outputBatcher = new OutputBatcher(10, 1000, async (batch) => {
//     await saveOutputsToDatabase(batch);
// });