// ═══════════════════════════════════════════════════════════════════════════════
// 📝 FILE LOGGER UTILITY
// ═══════════════════════════════════════════════════════════════════════════════

import * as fs from 'fs';
import * as path from 'path';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Generate timestamp for log file names
const getTimestamp = () => {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
};

// Create a log file for this session
const sessionTimestamp = getTimestamp();
const logFilePath = path.join(logsDir, `gmx-debug-${sessionTimestamp}.log`);

// Write initial header
fs.writeFileSync(logFilePath, `GMX Trading Debug Log - Started at ${new Date().toISOString()}\n${'='.repeat(80)}\n\n`);

/**
 * Safe JSON stringifier that handles BigInt values
 * @param obj - The object to stringify
 * @param space - Indentation space
 * @returns JSON string with BigInt values converted to strings
 */
function safejsonStringify(obj: any, space?: number): string {
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'bigint') {
            return value.toString() + 'n';
        }
        return value;
    }, space);
}

/**
 * Log to both console and file
 * @param category - The category of the log (e.g., "OPEN_LONG", "CLOSE_POSITION")
 * @param message - The message to log
 * @param data - Optional data object to log
 */
export function debugLog(category: string, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${category}] ${message}`;
    
    // Log to console
    console.log(logEntry);
    if (data !== undefined) {
        console.log(safejsonStringify(data, 2));
    }
    
    // Log to file
    let fileEntry = `${logEntry}\n`;
    if (data !== undefined) {
        fileEntry += `${safejsonStringify(data, 2)}\n`;
    }
    fileEntry += '\n';
    
    fs.appendFileSync(logFilePath, fileEntry);
}

/**
 * Log an error to both console and file
 * @param category - The category of the error
 * @param error - The error object or message
 * @param context - Optional context data
 */
export function debugError(category: string, error: any, context?: any) {
    const timestamp = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    const logEntry = `[${timestamp}] [ERROR] [${category}] ${errorMessage}`;
    
    // Log to console
    console.error(logEntry);
    if (errorStack) {
        console.error('Stack trace:', errorStack);
    }
    if (context !== undefined) {
        console.error('Context:', safejsonStringify(context, 2));
    }
    
    // Log to file
    let fileEntry = `${logEntry}\n`;
    if (errorStack) {
        fileEntry += `Stack trace:\n${errorStack}\n`;
    }
    if (context !== undefined) {
        fileEntry += `Context:\n${safejsonStringify(context, 2)}\n`;
    }
    fileEntry += '\n';
    
    fs.appendFileSync(logFilePath, fileEntry);
}

/**
 * Get the current log file path
 */
export function getLogFilePath(): string {
    return logFilePath;
}

// Export the path for reference
export { logFilePath };

// Log that the logger is initialized
debugLog('LOGGER', `Debug logging initialized. Log file: ${logFilePath}`);