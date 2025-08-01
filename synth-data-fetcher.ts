#!/usr/bin/env bun

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Types
interface LPBoundsSnapshot {
    timestamp: number;
    bounds: {
        data: {
            '24h': {
                probability_above: { [price: string]: number };
                probability_below: { [price: string]: number };
            };
        };
        current_price: number;
    };
}

interface SnapshotStorage {
    version: string;
    snapshots: {
        BTC: LPBoundsSnapshot[];
        ETH: LPBoundsSnapshot[];
    };
}

// Constants
const DATA_FILE_PATH = path.join(__dirname, 'data', 'lp-bounds-snapshots.json');
const MAX_SNAPSHOTS = 2016; // 7 days * 24 hours * 12 (5-minute intervals)
const SYNTH_API_KEY = process.env.SYNTH_API_KEY;
const LP_BOUNDS_COOLDOWN_MS = 5000; // 5 seconds between requests

if (!SYNTH_API_KEY) {
    console.error('[SynthDataFetcher] ERROR: SYNTH_API_KEY not found in environment variables');
    process.exit(1);
}

let lastLPBoundsApiCall = 0;

// Direct API function for LP bounds (based on gmx-cache.ts implementation)
async function fetchLPBoundsDataDirect(asset: 'BTC' | 'ETH'): Promise<LPBoundsData> {
    const now = Date.now();
    
    // Rate limiting check
    if (lastLPBoundsApiCall > 0 && (now - lastLPBoundsApiCall) < LP_BOUNDS_COOLDOWN_MS) {
        const waitTime = LP_BOUNDS_COOLDOWN_MS - (now - lastLPBoundsApiCall);
        console.log(`[SynthDataFetcher] Rate limiting: waiting ${waitTime}ms before next request`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    const url = `https://api.synthdata.co/insights/lp-bounds-chart?asset=${asset}`;
    
    console.log(`[SynthDataFetcher] Fetching LP bounds for ${asset}...`);
    
    // Update timestamp before request
    lastLPBoundsApiCall = Date.now();
    
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Apikey ${SYNTH_API_KEY}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch LP bounds for ${asset}: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        // Ensure timestamp is still updated even on error
        if (lastLPBoundsApiCall === 0) {
            lastLPBoundsApiCall = Date.now();
        }
        throw error;
    }
}

// Load existing data or create new store
function loadDataStore(): SnapshotStorage {
    try {
        if (fs.existsSync(DATA_FILE_PATH)) {
            const data = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
            const parsed = JSON.parse(data) as SnapshotStorage;
            // Validate structure
            if (parsed.version && parsed.snapshots && parsed.snapshots.BTC && parsed.snapshots.ETH) {
                return parsed;
            }
        }
    } catch (error) {
        console.error('[SynthDataFetcher] Error loading existing data:', error);
    }
    
    // Return default structure
    return {
        version: '1.0',
        snapshots: {
            BTC: [],
            ETH: []
        }
    };
}

// Save data store to file
function saveDataStore(store: SnapshotStorage): void {
    try {
        // Ensure directory exists
        const dir = path.dirname(DATA_FILE_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(store, null, 2));
        console.log(`[SynthDataFetcher] Saved ${store.snapshots.BTC.length} BTC and ${store.snapshots.ETH.length} ETH snapshots`);
    } catch (error) {
        console.error('[SynthDataFetcher] Error saving data:', error);
        throw error;
    }
}

// Main fetch function
async function fetchAndStoreSynthData(): Promise<void> {
    console.log('[SynthDataFetcher] Starting synth data fetch...');
    
    const store = loadDataStore();
    const now = Date.now();
    
    try {
        // Fetch LP bounds for BTC first (respecting rate limit)
        const btcLPBounds = await fetchLPBoundsDataDirect('BTC');
        console.log('[SynthDataFetcher] BTC LP bounds fetched successfully');
        
        // Then fetch ETH (rate limiting will be handled automatically)
        const ethLPBounds = await fetchLPBoundsDataDirect('ETH');
        console.log('[SynthDataFetcher] ETH LP bounds fetched successfully');
        
        // Create new snapshots in the existing format
        const btcSnapshot: LPBoundsSnapshot = {
            timestamp: now,
            bounds: btcLPBounds
        };
        
        const ethSnapshot: LPBoundsSnapshot = {
            timestamp: now,
            bounds: ethLPBounds
        };
        
        // Add to respective arrays
        store.snapshots.BTC.push(btcSnapshot);
        store.snapshots.ETH.push(ethSnapshot);
        
        // Keep only the most recent snapshots (7 days worth) for each asset
        if (store.snapshots.BTC.length > MAX_SNAPSHOTS) {
            store.snapshots.BTC = store.snapshots.BTC.slice(-MAX_SNAPSHOTS);
        }
        if (store.snapshots.ETH.length > MAX_SNAPSHOTS) {
            store.snapshots.ETH = store.snapshots.ETH.slice(-MAX_SNAPSHOTS);
        }
        
        // Save to file
        saveDataStore(store);
        
        console.log('[SynthDataFetcher] Successfully fetched and stored data');
        
    } catch (error) {
        console.error('[SynthDataFetcher] Error fetching data:', error);
        throw error;
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    fetchAndStoreSynthData()
        .then(() => {
            console.log('[SynthDataFetcher] Completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('[SynthDataFetcher] Fatal error:', error);
            process.exit(1);
        });
}

export { fetchAndStoreSynthData, loadDataStore, type SynthDataStore, type SynthDataSnapshot };