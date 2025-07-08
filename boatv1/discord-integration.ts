/**
 * Discord integration for GMX trading agent
 */

import { DiscordClient, type MessageData } from '@daydreamsai/discord';
import { LogLevel } from '@daydreamsai/core';
import type { OutputRef } from '@daydreamsai/core';

// Types for our notifications
interface TradeNotification {
    market: string;
    direction: 'long' | 'short';
    size: string;
    entryPrice: string;
    timestamp: number;
}

interface MarketAnalysis {
    market: string;
    analysis: string;
    recommendation: string;
    confidence: number;
}

interface RiskAlert {
    type: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    action_required: boolean;
}

/**
 * Enhanced Discord client for trading notifications
 */
export class TradingDiscordClient {
    private client: DiscordClient;
    private channelId: string;
    private enabled: boolean = true;
    
    constructor(
        credentials: { discord_token: string; discord_bot_name: string },
        channelId: string,
        logLevel: LogLevel = LogLevel.INFO
    ) {
        this.client = new DiscordClient(credentials, logLevel);
        this.channelId = channelId;
    }
    
    /**
     * Send trade execution notification
     */
    async notifyTradeExecution(trade: TradeNotification): Promise<void> {
        if (!this.enabled) return;
        
        const emoji = trade.direction === 'long' ? '📈' : '📉';
        const color = trade.direction === 'long' ? 0x00ff00 : 0xff0000;
        
        const embed = {
            color,
            title: `${emoji} Trade Executed: ${trade.market}`,
            fields: [
                { name: 'Direction', value: trade.direction.toUpperCase(), inline: true },
                { name: 'Size', value: `$${trade.size}`, inline: true },
                { name: 'Entry Price', value: `$${trade.entryPrice}`, inline: true }
            ],
            timestamp: new Date(trade.timestamp).toISOString(),
            footer: { text: 'Vega Trading Agent' }
        };
        
        const messageData: MessageData = {
            content: '',
            channelId: this.channelId,
            files: [{
                attachment: JSON.stringify({ embeds: [embed] }),
                name: 'embed.json'
            }]
        };
        
        try {
            await this.client.sendMessage(messageData);
        } catch (error) {
            console.error('Failed to send trade notification:', error);
        }
    }
    
    /**
     * Send market analysis
     */
    async notifyMarketAnalysis(analysis: MarketAnalysis): Promise<void> {
        if (!this.enabled) return;
        
        // Only send high confidence signals
        if (analysis.confidence < 80) return;
        
        const emoji = analysis.recommendation.includes('buy') ? '🟢' : 
                     analysis.recommendation.includes('sell') ? '🔴' : '🟡';
        
        const message = `${emoji} **Market Signal: ${analysis.market}**\n` +
                       `Recommendation: **${analysis.recommendation.toUpperCase()}** (${analysis.confidence}% confidence)\n` +
                       `\`\`\`${analysis.analysis}\`\`\``;
        
        const messageData: MessageData = {
            content: message,
            channelId: this.channelId
        };
        
        try {
            await this.client.sendMessage(messageData);
        } catch (error) {
            console.error('Failed to send market analysis:', error);
        }
    }
    
    /**
     * Send risk alert
     */
    async notifyRiskAlert(alert: RiskAlert): Promise<void> {
        if (!this.enabled) return;
        
        const emoji = alert.severity === 'critical' ? '🚨' : 
                     alert.severity === 'warning' ? '⚠️' : 'ℹ️';
        
        const roleTag = alert.severity === 'critical' ? '@everyone' : '';
        
        const message = `${emoji} **RISK ALERT** ${roleTag}\n` +
                       `Type: ${alert.type}\n` +
                       `Severity: **${alert.severity.toUpperCase()}**\n` +
                       `Message: ${alert.message}` +
                       (alert.action_required ? '\n⚡ **ACTION REQUIRED**' : '');
        
        const messageData: MessageData = {
            content: message,
            channelId: this.channelId
        };
        
        try {
            await this.client.sendMessage(messageData);
        } catch (error) {
            console.error('Failed to send risk alert:', error);
        }
    }
    
    /**
     * Send performance report
     */
    async notifyPerformanceReport(report: {
        period: string;
        totalTrades: number;
        winRate: number;
        totalPnL: string;
        sharpeRatio: number;
    }): Promise<void> {
        if (!this.enabled) return;
        
        const profitEmoji = report.totalPnL.startsWith('-') ? '📉' : '📈';
        const color = report.totalPnL.startsWith('-') ? 0xff0000 : 0x00ff00;
        
        const embed = {
            color,
            title: `${profitEmoji} Performance Report - ${report.period}`,
            fields: [
                { name: 'Total Trades', value: report.totalTrades.toString(), inline: true },
                { name: 'Win Rate', value: `${report.winRate.toFixed(2)}%`, inline: true },
                { name: 'Total P&L', value: report.totalPnL, inline: true },
                { name: 'Sharpe Ratio', value: report.sharpeRatio.toFixed(2), inline: true }
            ],
            timestamp: new Date().toISOString(),
            footer: { text: 'Vega Trading Agent Performance' }
        };
        
        const messageData: MessageData = {
            content: '',
            channelId: this.channelId,
            files: [{
                attachment: JSON.stringify({ embeds: [embed] }),
                name: 'embed.json'
            }]
        };
        
        try {
            await this.client.sendMessage(messageData);
        } catch (error) {
            console.error('Failed to send performance report:', error);
        }
    }
    
    /**
     * Send status update
     */
    async notifyStatusUpdate(status: string): Promise<void> {
        if (!this.enabled) return;
        
        const messageData: MessageData = {
            content: `📋 **Status Update**: ${status}`,
            channelId: this.channelId
        };
        
        try {
            await this.client.sendMessage(messageData);
        } catch (error) {
            console.error('Failed to send status update:', error);
        }
    }
    
    /**
     * Enable/disable notifications
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        console.log(`Discord notifications ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Destroy client connection
     */
    destroy(): void {
        this.client.destroy();
    }
}