/**
 * Tests for Enhanced GMX Trading Agent
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { openrouter } from "@openrouter/ai-sdk-provider";
import { 
    createDreams, 
    context, 
    render, 
    input,
    extension,
    validateEnv, 
    LogLevel,
    Logger,
    TaskRunner,
    task,
    type Evaluator,
    service,
    trimWorkingMemory,
    type Episode,
    memory
} from "@daydreamsai/core";
import { z } from "zod";

// Import mocks
import { MockGmxSdk } from './mocks/gmx-sdk-mock';
import { createMockSupabaseMemory } from './mocks/supabase-mock';
import * as mockQueries from './mocks/queries-mock';

// Mock environment variables
const mockEnv = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
    OPENAI_API_KEY: 'test-openai-key',
    GMX_NETWORK: 'arbitrum',
    GMX_CHAIN_ID: '42161',
    GMX_ORACLE_URL: 'http://mock-oracle',
    GMX_RPC_URL: 'http://mock-rpc',
    GMX_SUBSQUID_URL: 'http://mock-subsquid',
    GMX_WALLET_ADDRESS: '0x1234567890123456789012345678901234567890',
    GMX_PRIVATE_KEY: '0x1234567890123456789012345678901234567890123456789012345678901234',
    SYNTH_API_KEY: 'test-synth-key',
    SUPABASE_URL: 'http://mock-supabase',
    SUPABASE_KEY: 'test-supabase-key'
};

// Test configuration
const TEST_TIMEOUT = 30000; // 30 seconds

describe('Enhanced GMX Trading Agent', () => {
    let agent: any;
    let mockSdk: MockGmxSdk;
    let taskRunner: TaskRunner;
    
    beforeAll(() => {
        // Set up mocks
        mockSdk = new MockGmxSdk({
            account: mockEnv.GMX_WALLET_ADDRESS
        });
        
        taskRunner = new TaskRunner(3);
    });
    
    afterAll(async () => {
        if (agent?.stop) {
            await agent.stop();
        }
    });
    
    describe('TaskRunner - Concurrent Operations', () => {
        test('should fetch market data concurrently', async () => {
            const updateMarketDataTask = task({
                key: "test-update-market-data",
                concurrency: 2,
                retry: 2,
                timeoutMs: 5000,
                handler: async ({ markets }: { markets: string[] }) => {
                    const results = await Promise.all(
                        markets.map(async (market) => {
                            // Simulate API delay
                            await new Promise(resolve => setTimeout(resolve, 100));
                            return mockQueries.get_technical_analysis_str(mockSdk, market);
                        })
                    );
                    return results;
                }
            });
            
            const startTime = Date.now();
            const results = await taskRunner.enqueueTask(
                updateMarketDataTask,
                { markets: ['BTC', 'ETH'] }
            );
            const endTime = Date.now();
            
            // Should complete in ~100ms (concurrent) not ~200ms (sequential)
            expect(endTime - startTime).toBeLessThan(150);
            expect(results).toHaveLength(2);
            expect(results[0]).toContain('TECHNICAL ANALYSIS - BTC');
            expect(results[1]).toContain('TECHNICAL ANALYSIS - ETH');
        }, TEST_TIMEOUT);
        
        test('should retry failed tasks', async () => {
            let attempts = 0;
            const flakeyTask = task({
                key: "test-flakey-task",
                retry: 3,
                handler: async () => {
                    attempts++;
                    if (attempts < 3) {
                        throw new Error('Temporary failure');
                    }
                    return 'Success!';
                }
            });
            
            const result = await taskRunner.enqueueTask(flakeyTask, {});
            expect(result).toBe('Success!');
            expect(attempts).toBe(3);
        });
        
        test('should handle task timeout', async () => {
            const slowTask = task({
                key: "test-slow-task",
                timeoutMs: 100,
                handler: async () => {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    return 'Should not reach here';
                }
            });
            
            await expect(taskRunner.enqueueTask(slowTask, {})).rejects.toThrow();
        });
    });
    
    describe('Evaluators - Trade Validation', () => {
        test('profit target evaluator should validate trades', async () => {
            const profitEvaluator: Evaluator = {
                name: "test-profit-evaluator",
                handler: async (result: any) => {
                    const minProfitPercent = 0.02;
                    return result.profitPercent >= minProfitPercent;
                }
            };
            
            const goodTrade = { profitPercent: 0.025 };
            const badTrade = { profitPercent: 0.015 };
            
            expect(await profitEvaluator.handler!(goodTrade, {} as any, {} as any)).toBe(true);
            expect(await profitEvaluator.handler!(badTrade, {} as any, {} as any)).toBe(false);
        });
        
        test('risk/reward evaluator should enforce ratios', async () => {
            const rrEvaluator: Evaluator = {
                name: "test-rr-evaluator",
                handler: async (result: any) => {
                    const minRR = 2.0;
                    return result.riskRewardRatio >= minRR;
                }
            };
            
            const goodSetup = { riskRewardRatio: 2.5 };
            const badSetup = { riskRewardRatio: 1.5 };
            
            expect(await rrEvaluator.handler!(goodSetup, {} as any, {} as any)).toBe(true);
            expect(await rrEvaluator.handler!(badSetup, {} as any, {} as any)).toBe(false);
        });
        
        test('drawdown evaluator should prevent excessive risk', async () => {
            const drawdownEvaluator: Evaluator = {
                name: "test-drawdown-evaluator",
                handler: async (result: any, ctx: any) => {
                    const maxDrawdown = 0.15;
                    return ctx.memory.currentDrawdown <= maxDrawdown;
                }
            };
            
            const safeContext = { memory: { currentDrawdown: 0.10 } };
            const riskyContext = { memory: { currentDrawdown: 0.20 } };
            
            expect(await drawdownEvaluator.handler!({}, safeContext as any, {} as any)).toBe(true);
            expect(await drawdownEvaluator.handler!({}, riskyContext as any, {} as any)).toBe(false);
        });
    });
    
    describe('Event System', () => {
        test('should emit position opened events', async () => {
            const events: any[] = [];
            
            const testContext = context({
                type: "test-context",
                events: {
                    positionOpened: z.object({
                        market: z.string(),
                        size: z.string(),
                        direction: z.enum(["long", "short"])
                    })
                },
                create: () => ({}),
                onRun: async (ctx) => {
                    (ctx as any).emit("positionOpened", {
                        market: "BTC/USD",
                        size: "10000",
                        direction: "long"
                    });
                }
            });
            
            // In real implementation, events would be captured by the agent
            // For testing, we simulate the event emission
            const mockEmit = (event: string, data: any) => {
                events.push({ event, data });
            };
            
            const ctx = {
                emit: mockEmit,
                memory: {}
            };
            
            await testContext.onRun?.(ctx as any, {} as any);
            
            expect(events).toHaveLength(1);
            expect(events[0]).toEqual({
                event: "positionOpened",
                data: {
                    market: "BTC/USD",
                    size: "10000",
                    direction: "long"
                }
            });
        });
        
        test('should emit risk alerts', async () => {
            const events: any[] = [];
            const mockEmit = (event: string, data: any) => {
                events.push({ event, data });
            };
            
            const testContext = context({
                type: "test-risk-context",
                events: {
                    riskAlert: z.object({
                        type: z.string(),
                        severity: z.string(),
                        message: z.string()
                    })
                },
                create: () => ({ currentDrawdown: 0.18 }),
                onRun: async (ctx) => {
                    if (ctx.memory.currentDrawdown > 0.15) {
                        (ctx as any).emit("riskAlert", {
                            type: "drawdown",
                            severity: "critical",
                            message: "Drawdown exceeds 15%"
                        });
                    }
                }
            });
            
            const ctx = {
                emit: mockEmit,
                memory: { currentDrawdown: 0.18 }
            };
            
            await testContext.onRun?.(ctx as any, {} as any);
            
            expect(events).toHaveLength(1);
            expect(events[0].event).toBe("riskAlert");
            expect(events[0].data.severity).toBe("critical");
        });
    });
    
    describe('Working Memory Management', () => {
        test('should trim working memory to prevent overflow', () => {
            const workingMemory = {
                inputs: Array(20).fill(0).map((_, i) => ({ 
                    id: `input-${i}`, 
                    ref: 'input' as const,
                    timestamp: i 
                })),
                outputs: Array(20).fill(0).map((_, i) => ({ 
                    id: `output-${i}`, 
                    ref: 'output' as const,
                    timestamp: i 
                })),
                thoughts: Array(50).fill(0).map((_, i) => ({ 
                    id: `thought-${i}`, 
                    ref: 'thought' as const,
                    timestamp: i 
                })),
                calls: Array(100).fill(0).map((_, i) => ({ 
                    id: `call-${i}`, 
                    ref: 'action_call' as const,
                    timestamp: i 
                })),
                results: Array(100).fill(0).map((_, i) => ({ 
                    id: `result-${i}`, 
                    ref: 'action_result' as const,
                    timestamp: i 
                })),
                runs: [],
                steps: [],
                events: []
            };
            
            trimWorkingMemory(workingMemory, {
                thoughts: 10,
                inputs: 5,
                outputs: 5,
                actions: 20
            });
            
            expect(workingMemory.thoughts).toHaveLength(10);
            expect(workingMemory.inputs).toHaveLength(5);
            expect(workingMemory.outputs).toHaveLength(5);
            expect(workingMemory.calls).toHaveLength(20);
            expect(workingMemory.results).toHaveLength(20);
            
            // Should keep the most recent items
            expect(workingMemory.thoughts[0].id).toBe('thought-40');
            expect(workingMemory.inputs[0].id).toBe('input-15');
        });
    });
    
    describe('Episodic Memory', () => {
        test('should store successful trade episodes', async () => {
            const episodes: Episode[] = [];
            
            const successEpisode: Episode = {
                id: 'test-success-1',
                timestamp: Date.now(),
                observation: 'Opened long position on BTC at support',
                result: 'Profit of $500 (2.5%)',
                thoughts: 'Support level held as expected',
                metadata: {
                    success: true,
                    tags: ['support-bounce', 'btc', 'long'],
                    profit: 500,
                    profitPercent: 2.5
                }
            };
            
            episodes.push(successEpisode);
            
            expect(episodes).toHaveLength(1);
            expect(episodes[0].metadata?.success).toBe(true);
            expect(episodes[0].metadata?.profit).toBe(500);
        });
        
        test('should store failed trade episodes for learning', async () => {
            const episodes: Episode[] = [];
            
            const failEpisode: Episode = {
                id: 'test-fail-1',
                timestamp: Date.now(),
                observation: 'Opened short position on ETH at resistance',
                result: 'Loss of $200 (-1.0%)',
                thoughts: 'Resistance broke due to strong momentum',
                metadata: {
                    success: false,
                    tags: ['resistance-break', 'eth', 'short'],
                    loss: -200,
                    lossPercent: -1.0
                }
            };
            
            episodes.push(failEpisode);
            
            // Calculate win rate
            const totalEpisodes = episodes.length;
            const successfulEpisodes = episodes.filter(e => e.metadata?.success).length;
            const winRate = totalEpisodes > 0 ? successfulEpisodes / totalEpisodes : 0;
            
            expect(winRate).toBe(0); // 0% win rate with only failed trade
        });
    });
    
    describe('Service Lifecycle', () => {
        test('should boot and stop services properly', async () => {
            let bootCalled = false;
            let stopCalled = false;
            
            const testService = service({
                boot: async () => {
                    bootCalled = true;
                },
                stop: async () => {
                    stopCalled = true;
                }
            });
            
            // Simulate service lifecycle
            await testService.boot?.({} as any);
            expect(bootCalled).toBe(true);
            
            await testService.stop?.({} as any);
            expect(stopCalled).toBe(true);
        });
    });
    
    describe('Integration Test', () => {
        test('should create agent with all enhanced features', async () => {
            // This test creates a minimal agent to verify all features integrate
            const testMemory = createMockSupabaseMemory();
            
            const testAgent = createDreams({
                model: openrouter("google/gemini-2.5-flash"), // Use a fast model for testing
                logger: new Logger({ level: LogLevel.ERROR }), // Reduce log noise
                taskRunner: new TaskRunner(2),
                memory: testMemory,
                exportTrainingData: true,
                trainingDataPath: "./tests/training",
                streaming: false
            });
            
            expect(testAgent).toBeDefined();
            expect(testAgent.taskRunner).toBeDefined();
            expect(testAgent.isBooted()).toBe(false);
            
            // Clean up
            await testAgent.stop();
        }, TEST_TIMEOUT);
    });
});