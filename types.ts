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
    orders: string;
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