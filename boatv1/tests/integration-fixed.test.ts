/**
 * Fixed integration test with proper output definitions
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { openrouter } from "@openrouter/ai-sdk-provider";
import { 
    createDreams, 
    context, 
    action,
    output,
    extension,
    LogLevel,
    Logger,
    TaskRunner
} from "@daydreamsai/core";
import { z } from "zod";
import { createMockSupabaseMemory } from './mocks/supabase-mock';
import * as mockQueries from './mocks/queries-mock';
import { MockGmxSdk } from './mocks/gmx-sdk-mock';

describe('GMX Agent Integration Tests (Fixed)', () => {
    let hasRealApiKey = false;
    
    beforeAll(() => {
        hasRealApiKey = !!process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'test-key';
        if (!hasRealApiKey) {
            console.warn('⚠️  No real OPENROUTER_API_KEY found. Skipping live API tests.');
        }
    });
    
    test('should analyze market with proper outputs', async () => {
        if (!hasRealApiKey) {
            console.log('Skipping test - no API key');
            return;
        }
        
        const mockSdk = new MockGmxSdk({});
        
        // Create test context with proper outputs
        const testContext = context({
            type: "test-market-analysis",
            schema: z.object({
                marketData: z.string()
            }),
            create: ({ args }) => ({
                marketData: args.marketData
            }),
            render: ({ memory }) => memory.marketData,
            
            // Define outputs that the AI can use
            outputs: {
                analysis: output({
                    description: "Market analysis results",
                    schema: z.object({
                        market: z.string(),
                        sentiment: z.enum(["bullish", "bearish", "neutral"]),
                        confidence: z.number()
                    }),
                    handler: async (data, ctx, agent) => {
                        console.log('Analysis output:', data);
                        return {
                            data,
                            processed: true
                        };
                    }
                }),
                
                report: output({
                    description: "Detailed market report",
                    schema: z.string(), // Simple text report
                    handler: async (data, ctx, agent) => {
                        console.log('Report output:', data);
                        return {
                            data,
                            processed: true
                        };
                    }
                })
            }
        });
        
        // Create test actions
        const testActions = [
            action({
                name: "analyze_market",
                description: "Analyze market conditions and provide trading recommendation",
                handler: async () => {
                    const btcAnalysis = await mockQueries.get_technical_analysis_str(mockSdk, 'BTC');
                    const predictions = await mockQueries.get_synth_predictions_consolidated_str('BTC');
                    
                    return {
                        analysis: btcAnalysis,
                        predictions: predictions,
                        recommendation: "BTC showing strong bullish signals"
                    };
                }
            }),
            
            action({
                name: "check_portfolio",
                description: "Check current portfolio status",
                handler: async () => {
                    const portfolio = await mockQueries.get_portfolio_balance_str(mockSdk);
                    return {
                        portfolio: portfolio,
                        available: "$48,035.00",
                        positions: 1
                    };
                }
            })
        ];
        
        // Create agent
        const agent = createDreams({
            model: openrouter("google/gemini-2.5-flash"),
            logger: new Logger({ level: LogLevel.INFO }),
            taskRunner: new TaskRunner(2),
            memory: createMockSupabaseMemory(),
            extensions: [
                extension({
                    name: "test-extension",
                    contexts: { testContext },
                    actions: testActions
                })
            ],
            streaming: false
        });
        
        await agent.start();
        
        // Run analysis without errors
        const result = await agent.run({
            context: testContext,
            args: {
                marketData: "BTC is showing bullish signals. Analyze the market and provide a report."
            },
            handlers: {
                onLogStream: (log, done) => {
                    if (log.ref === 'output') {
                        console.log('Output generated:', (log as any).type);
                    }
                }
            }
        });
        
        // Verify no errors
        const errors = result.filter(r => r.ref === 'output' && (r as any).error);
        expect(errors.length).toBe(0);
        
        // Verify outputs were created
        const outputs = result.filter(r => r.ref === 'output');
        expect(outputs.length).toBeGreaterThan(0);
        
        await agent.stop();
    }, 60000);
});