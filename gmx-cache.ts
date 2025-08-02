import { type GmxSdk } from "@gmx-io/sdk";
import { type Asset } from "./gmx-utils";

// Enhanced cache for all GMX data types and external APIs
export class EnhancedDataCache {
    // Market data cache
    private marketCache: Map<string, { marketsInfoData: any, tokensData: any }> = new Map();
    private lastMarketFetch: number = 0;
    private readonly MARKET_TTL_MS = 60_000; // 1 minute
    private marketFetchPromise: Promise<{ marketsInfoData: any, tokensData: any }> | null = null;

    // Token data cache
    private tokenCache: Map<string, any> = new Map();
    private lastTokenFetch: number = 0;
    private readonly TOKEN_TTL_MS = 300_000; // 5 minutes
    private tokenFetchPromise: Promise<any> | null = null;

    // Position data cache
    private positionCache: Map<string, any> = new Map();
    private lastPositionFetch: number = 0;
    private readonly POSITION_TTL_MS = 300_000; // 5 minutes
    private positionFetchPromise: Promise<any> | null = null;

    // Position info cache
    private positionInfoCache: Map<string, any> = new Map();
    private lastPositionInfoFetch: number = 0;
    private readonly POSITION_INFO_TTL_MS = 300_000; // 5 minutes
    private positionInfoFetchPromise: Promise<any> | null = null;

    // Volatility cache
    private volatilityCache: Map<string, number> = new Map();
    private lastVolatilityFetch: Map<string, number> = new Map();
    private readonly VOLATILITY_TTL_MS = 900_000; // 15 minutes
    private volatilityFetchPromises: Map<string, Promise<number>> = new Map();

    
    constructor(private sdk: GmxSdk) {}

    // ═══════════════════════════════════════════════════════════════════════════════
    // 📊 MARKET DATA METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    async getMarketsInfo(forceRefresh = false): Promise<{ marketsInfoData: any, tokensData: any }> {
        const now = Date.now();
        const cacheKey = "markets";

        // Return cached data if still valid
        if (!forceRefresh && this.marketCache.has(cacheKey) && (now - this.lastMarketFetch) < this.MARKET_TTL_MS) {
            console.warn(`[MarketCache] Returning cached market data (age: ${now - this.lastMarketFetch}ms, ttl: ${this.MARKET_TTL_MS}ms)`);
            return this.marketCache.get(cacheKey)!;
        }

        // If a fetch is already in progress, return that promise
        if (this.marketFetchPromise) {
            console.warn('[MarketCache] Returning in-progress market fetch');
            return this.marketFetchPromise;
        }

        // Start new fetch
        console.warn('[MarketCache] Fetching fresh market data');
        this.marketFetchPromise = this.fetchMarkets();

        try {
            const markets = await this.marketFetchPromise;
            this.marketCache.set(cacheKey, markets);
            this.lastMarketFetch = now;
            console.warn(`[MarketCache] Market data cached at ${now}`);
            return markets;
        } finally {
            this.marketFetchPromise = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🪙 TOKEN DATA METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    async getTokensData(forceRefresh = false): Promise<any> {
        const now = Date.now();
        const cacheKey = "tokens";

        // Return cached data if still valid
        if (!forceRefresh && this.tokenCache.has(cacheKey) && (now - this.lastTokenFetch) < this.TOKEN_TTL_MS) {
            console.warn(`[TokenCache] Returning cached token data (age: ${now - this.lastTokenFetch}ms, ttl: ${this.TOKEN_TTL_MS}ms)`);
            return this.tokenCache.get(cacheKey)!;
        }

        // If a fetch is already in progress, return that promise
        if (this.tokenFetchPromise) {
            console.warn('[TokenCache] Returning in-progress token fetch');
            return this.tokenFetchPromise;
        }

        // Start new fetch
        console.warn('[TokenCache] Fetching fresh token data');
        this.tokenFetchPromise = this.fetchTokens();

        try {
            const tokens = await this.tokenFetchPromise;
            this.tokenCache.set(cacheKey, tokens);
            this.lastTokenFetch = now;
            console.warn(`[TokenCache] Token data cached at ${now}`);
            return tokens;
        } finally {
            this.tokenFetchPromise = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 📈 POSITION DATA METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    async getPositions(marketsData: any, tokensData: any, forceRefresh = false): Promise<any> {
        const now = Date.now();
        const cacheKey = "positions";

        // Return cached data if still valid
        if (!forceRefresh && this.positionCache.has(cacheKey) && (now - this.lastPositionFetch) < this.POSITION_TTL_MS) {
            console.warn(`[PositionCache] Returning cached position data (age: ${now - this.lastPositionFetch}ms, ttl: ${this.POSITION_TTL_MS}ms)`);
            return this.positionCache.get(cacheKey)!;
        }

        // If a fetch is already in progress, return that promise
        if (this.positionFetchPromise) {
            console.warn('[PositionCache] Returning in-progress position fetch');
            return this.positionFetchPromise;
        }

        // Start new fetch
        console.warn('[PositionCache] Fetching fresh position data');
        this.positionFetchPromise = this.fetchPositions(marketsData, tokensData);

        try {
            const positions = await this.positionFetchPromise;
            this.positionCache.set(cacheKey, positions);
            this.lastPositionFetch = now;
            console.warn(`[PositionCache] Position data cached at ${now}`);
            return positions;
        } finally {
            this.positionFetchPromise = null;
        }
    }

    async getPositionsInfo(marketsInfoData: any, tokensData: any, forceRefresh = false): Promise<any> {
        const now = Date.now();
        const cacheKey = "positionsInfo";

        // Return cached data if still valid
        if (!forceRefresh && this.positionInfoCache.has(cacheKey) && (now - this.lastPositionInfoFetch) < this.POSITION_INFO_TTL_MS) {
            console.warn(`[PositionInfoCache] Returning cached position info data (age: ${now - this.lastPositionInfoFetch}ms, ttl: ${this.POSITION_INFO_TTL_MS}ms)`);
            return this.positionInfoCache.get(cacheKey)!;
        }

        // If a fetch is already in progress, return that promise
        if (this.positionInfoFetchPromise) {
            console.warn('[PositionInfoCache] Returning in-progress position info fetch');
            return this.positionInfoFetchPromise;
        }

        // Start new fetch
        console.warn('[PositionInfoCache] Fetching fresh position info data');
        this.positionInfoFetchPromise = this.fetchPositionsInfo(marketsInfoData, tokensData);

        try {
            const positionsInfo = await this.positionInfoFetchPromise;
            this.positionInfoCache.set(cacheKey, positionsInfo);
            this.lastPositionInfoFetch = now;
            console.warn(`[PositionInfoCache] Position info data cached at ${now}`);
            return positionsInfo;
        } finally {
            this.positionInfoFetchPromise = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🔧 PRIVATE FETCH METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    private async fetchMarkets(): Promise<{ marketsInfoData: any, tokensData: any }> {
        try {
            const marketsResult = await this.sdk.markets.getMarketsInfo();
            return marketsResult;
        } catch (error) {
            console.error('[MarketCache] Failed to fetch market data:', error);
            throw error;
        }
    }

    private async fetchTokens(): Promise<any> {
        try {
            const tokensResult = await this.sdk.tokens.getTokensData();
            return tokensResult;
        } catch (error) {
            console.error('[TokenCache] Failed to fetch token data:', error);
            throw error;
        }
    }

    private async fetchPositions(marketsData: any, tokensData: any): Promise<any> {
        try {
            const positionsResult = await this.sdk.positions.getPositions({
                marketsData: marketsData,
                tokensData: tokensData,
                start: 0,
                end: 1000,
            });
            return positionsResult;
        } catch (error) {
            console.error('[PositionCache] Failed to fetch position data:', error);
            throw error;
        }
    }

    private async fetchPositionsInfo(marketsInfoData: any, tokensData: any): Promise<any> {
        try {
            const positionsInfoResult = await this.sdk.positions.getPositionsInfo({
                marketsInfoData,
                tokensData,
                showPnlInLeverage: false
            });
            return positionsInfoResult;
        } catch (error) {
            console.error('[PositionInfoCache] Failed to fetch position info data:', error);
            throw error;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 📈 VOLATILITY CACHE METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    async getVolatility(asset: Asset, forceRefresh = false): Promise<number> {
        const now = Date.now();
        const cacheKey = `volatility_${asset}`;

        // Return cached data if still valid
        if (!forceRefresh && this.volatilityCache.has(cacheKey)) {
            const lastFetch = this.lastVolatilityFetch.get(cacheKey) || 0;
            if ((now - lastFetch) < this.VOLATILITY_TTL_MS) {
                const cachedValue = this.volatilityCache.get(cacheKey)!;
                console.warn(`[VolatilityCache] Returning cached ${asset} volatility: ${cachedValue.toFixed(1)}% (age: ${now - lastFetch}ms)`);
                return cachedValue;
            }
        }

        // If a fetch is already in progress, return that promise
        if (this.volatilityFetchPromises.has(cacheKey)) {
            console.warn(`[VolatilityCache] Returning in-progress ${asset} volatility fetch`);
            return this.volatilityFetchPromises.get(cacheKey)!;
        }

        // Start new fetch
        const fetchPromise = this.fetchVolatility(asset);
        this.volatilityFetchPromises.set(cacheKey, fetchPromise);

        try {
            const result = await fetchPromise;
            
            // Cache the result
            this.volatilityCache.set(cacheKey, result);
            this.lastVolatilityFetch.set(cacheKey, now);
            
            console.warn(`[VolatilityCache] Cached fresh ${asset} volatility: ${result.toFixed(1)}%`);
            return result;
        } finally {
            // Clean up the promise
            this.volatilityFetchPromises.delete(cacheKey);
        }
    }

    private async fetchVolatility(asset: Asset): Promise<number> {
        try {
            // Import here to avoid circular dependencies
            const { calculate24HourVolatility } = await import('./gmx-utils');
            
            // Fetch 24 hours of 15-minute candles (96 candles)
            const url = `https://arbitrum-api.gmxinfra.io/prices/candles?tokenSymbol=${asset}&period=15m&limit=96`;
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch candlestick data: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (!data || !data.candles || !Array.isArray(data.candles) || data.candles.length < 2) {
                console.warn(`[VolatilityCache] Insufficient data for volatility calculation. Got ${data?.candles?.length || 0} candles`);
                return 0;
            }
            
            return calculate24HourVolatility(data.candles);
        } catch (error) {
            console.error(`[VolatilityCache] Error calculating 24h volatility for ${asset}:`, error);
            return 0;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🖺 CACHE MANAGEMENT METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    invalidateAll(): void {
        console.warn('[EnhancedCache] Invalidating all caches');
        this.invalidateMarkets();
        this.invalidateTokens();
        this.invalidatePositions();
        this.invalidateVolatility();
    }

    invalidateMarkets(): void {
        console.warn('[EnhancedCache] Invalidating market cache');
        this.marketCache.clear();
        this.lastMarketFetch = 0;
        this.marketFetchPromise = null;
    }

    invalidateTokens(): void {
        console.warn('[EnhancedCache] Invalidating token cache');
        this.tokenCache.clear();
        this.lastTokenFetch = 0;
        this.tokenFetchPromise = null;
    }

    invalidatePositions(): void {
        console.warn('[EnhancedCache] Invalidating position caches');
        this.positionCache.clear();
        this.positionInfoCache.clear();
        this.lastPositionFetch = 0;
        this.lastPositionInfoFetch = 0;
        this.positionFetchPromise = null;
        this.positionInfoFetchPromise = null;
    }

    invalidateVolatility(): void {
        console.warn('[EnhancedCache] Invalidating volatility cache');
        this.volatilityCache.clear();
        this.lastVolatilityFetch.clear();
        this.volatilityFetchPromises.clear();
    }

    getCacheAges(): { markets: number, tokens: number, positions: number, positionsInfo: number} {
        const now = Date.now();
        return {
            markets: now - this.lastMarketFetch,
            tokens: now - this.lastTokenFetch,
            positions: now - this.lastPositionFetch,
            positionsInfo: now - this.lastPositionInfoFetch
        };
    }

    getCacheStatus(): { 
        markets: boolean, 
        tokens: boolean, 
        positions: boolean, 
        positionsInfo: boolean
    } {
        const now = Date.now();
        return {
            markets: this.marketCache.has("markets") && (now - this.lastMarketFetch) < this.MARKET_TTL_MS,
            tokens: this.tokenCache.has("tokens") && (now - this.lastTokenFetch) < this.TOKEN_TTL_MS,
            positions: this.positionCache.has("positions") && (now - this.lastPositionFetch) < this.POSITION_TTL_MS,
            positionsInfo: this.positionInfoCache.has("positionsInfo") && (now - this.lastPositionInfoFetch) < this.POSITION_INFO_TTL_MS
        };
    }
}
