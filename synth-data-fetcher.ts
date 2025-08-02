#!/usr/bin/env bun

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { type Asset, ASSETS } from './gmx-utils';

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Types
interface LPBoundsData {
    data: {
        '24h': {
            probability_above: { [price: string]: number };
            probability_below: { [price: string]: number };
        };
    };
    current_price: number;
}

interface LPBoundsSnapshot {
    timestamp: number;
    bounds: LPBoundsData;
}

interface SnapshotStorage {
    version: string;
    snapshots: Record<Asset, LPBoundsSnapshot[]>;
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
async function fetchLPBoundsDataDirect(asset: Asset): Promise<LPBoundsData> {
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
            if (parsed.version && parsed.snapshots && ASSETS.every(asset => parsed.snapshots[asset])) {
                return parsed;
            }
        }
    } catch (error) {
        console.error('[SynthDataFetcher] Error loading existing data:', error);
    }
    
    // Return default structure
    return {
        version: '1.0',
        snapshots: Object.fromEntries(ASSETS.map(asset => [asset, []])) as Record<Asset, LPBoundsSnapshot[]>
    };
}

// Save data store to file atomically
function saveDataStore(store: SnapshotStorage): void {
    try {
        // Ensure directory exists
        const dir = path.dirname(DATA_FILE_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Write to a temporary file first
        const tempPath = `${DATA_FILE_PATH}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(store, null, 2));
        
        // Atomically rename temp file to actual file
        // This is atomic on POSIX systems and prevents partial reads
        fs.renameSync(tempPath, DATA_FILE_PATH);
        
        const counts = ASSETS.map(asset => `${store.snapshots[asset].length} ${asset}`).join(', ');
        console.log(`[SynthDataFetcher] Saved ${counts} snapshots`);
    } catch (error) {
        console.error('[SynthDataFetcher] Error saving data:', error);
        // Clean up temp file if it exists
        const tempPath = `${DATA_FILE_PATH}.tmp`;
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
        throw error;
    }
}

// Main fetch function
async function fetchAndStoreSynthData(): Promise<void> {
    console.log('[SynthDataFetcher] Starting synth data fetch...');
    
    const store = loadDataStore();
    const now = Date.now();
    
    try {
        // Fetch LP bounds for all assets (sequential with rate limiting)
        const lpBoundsResults: { asset: Asset; data: LPBoundsData }[] = [];
        
        for (const asset of ASSETS) {
            const lpBounds = await fetchLPBoundsDataDirect(asset);
            console.log(`[SynthDataFetcher] ${asset} LP bounds fetched successfully`);
            lpBoundsResults.push({ asset, data: lpBounds });
        }
        
        // Create and store snapshots for each asset
        for (const { asset, data } of lpBoundsResults) {
            const snapshot: LPBoundsSnapshot = {
                timestamp: now,
                bounds: data
            };
            
            // Add to respective array
            store.snapshots[asset].push(snapshot);
            
            // Keep only the most recent snapshots (7 days worth) for this asset
            if (store.snapshots[asset].length > MAX_SNAPSHOTS) {
                store.snapshots[asset] = store.snapshots[asset].slice(-MAX_SNAPSHOTS);
            }
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

export { fetchAndStoreSynthData, loadDataStore, type SnapshotStorage, type LPBoundsSnapshot };