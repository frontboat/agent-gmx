/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🏗️ GMX TRADING TYPES
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Type definitions for GMX trading agent
 */

export interface GmxMemory {
    // Core trading data
    positions: string;
    orders: any[];
    markets: string;
    tokens: string;
    volumes: string;
    
    // Trading performance
    trades: any[];
    totalPnl: number;
    winRate: number;
    averageProfit: number;
    averageLoss: number;
    
    // Portfolio balance
    portfolioBalance?: string;
    
    // Current state
    currentTask: string | null;
    lastResult: string | null;
    
    // Risk configuration
    maxPositionSize: number;
    minPositionSize: number;
    maxLeverage: number;
    slippageTolerance: number;
    
    // Trading strategy
    activeStrategies: string[];
    
    // Synth intelligence data
    synthLeaderboard: {
        miners: any[];
        lastUpdated: string | null;
        topMinerIds: number[];
    };
    synthPredictions: Record<string, Record<number, {
        predictions: any[];
        lastUpdated: string;
        asset: string;
        minerId: number;
    }>>;
}