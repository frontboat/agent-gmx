# Discord Integration Setup for GMX Trading Agent

## 🤖 Current Status

The enhanced GMX trading agent now has **full Discord integration** using the `@daydreamsai/discord` package. 

### ✅ What's Implemented

1. **Trade Notifications** - Rich embeds for every trade execution
2. **Market Analysis** - High-confidence signals (80%+) only
3. **Risk Alerts** - Severity-based notifications with @everyone for critical
4. **Performance Reports** - Daily/weekly summaries with P&L
5. **Status Updates** - General agent status messages

### 📍 Integration Points

The Discord integration is implemented in:
- `discord-integration.ts` - Discord client wrapper
- `output-handlers.ts` - Connected to all output types
- `agent-gmx-enhanced.ts` - Initialization and lifecycle

## 🔧 Setup Instructions

### 1. Create Discord Bot

1. Go to https://discord.com/developers/applications
2. Click "New Application" and name it (e.g., "Vega Trading Bot")
3. Go to "Bot" section
4. Click "Add Bot"
5. Copy the TOKEN (this is your `DISCORD_TOKEN`)
6. Set the bot name (this is your `DISCORD_BOT_NAME`)

### 2. Configure Bot Permissions

In the Bot section:
- Enable "MESSAGE CONTENT INTENT" 
- Under OAuth2 > URL Generator:
  - Select "bot" scope
  - Select permissions:
    - Send Messages
    - Embed Links
    - Attach Files
    - Mention Everyone (for critical alerts)

### 3. Invite Bot to Server

1. Copy the generated OAuth2 URL
2. Open in browser and select your Discord server
3. Authorize the bot

### 4. Get Channel ID

1. Enable Developer Mode in Discord (Settings > Advanced)
2. Right-click on your trading channel
3. Click "Copy ID" (this is your `DISCORD_CHANNEL_ID`)

### 5. Set Environment Variables

Add to your `.env` file:
```env
# Discord Integration (Optional)
DISCORD_TOKEN=your-bot-token-here
DISCORD_BOT_NAME=Vega Trading Bot
DISCORD_CHANNEL_ID=your-channel-id-here
```

## 📨 Message Types

### Trade Execution
```
📈 Trade Executed: BTC/USD
Direction: LONG        Size: $10,000      Entry Price: $65,000
```

### Market Analysis (High Confidence Only)
```
🟢 Market Signal: BTC/USD
Recommendation: STRONG_BUY (85% confidence)
```
Technical analysis details...
```

### Risk Alerts
```
🚨 RISK ALERT @everyone
Type: drawdown
Severity: CRITICAL
Message: Drawdown exceeds 15% - risk reduction mode active
⚡ ACTION REQUIRED
```

### Performance Reports
```
📈 Performance Report - daily
Total Trades: 25      Win Rate: 64.00%
Total P&L: $2,500     Sharpe Ratio: 1.85
```

## 🎛️ Configuration Options

### Throttling
- Trade notifications: Never throttled
- Market analysis: 5-second cooldown per market
- Risk alerts: Critical bypass throttle
- Performance: One per period
- Status updates: Heavily throttled

### Filtering
- Market analysis only sent for 80%+ confidence
- Critical alerts mention @everyone
- All trades are notified

## 🚀 Running with Discord

```bash
# Ensure Discord env vars are set
export DISCORD_TOKEN=your-token
export DISCORD_BOT_NAME="Vega Trading Bot"
export DISCORD_CHANNEL_ID=your-channel-id

# Run the enhanced agent
bun run start:enhanced
```

You should see:
```
🤖 Initializing Discord integration...
✅ Discord client connected!
```

## 🔍 Troubleshooting

### Bot Not Sending Messages
1. Check bot has permissions in the channel
2. Verify DISCORD_CHANNEL_ID is correct
3. Ensure bot is online in Discord
4. Check logs for connection errors

### Missing Notifications
- Verify output handlers are using Discord client
- Check throttling isn't blocking messages
- Ensure confidence thresholds are met

### Connection Issues
```typescript
// The agent handles Discord errors gracefully
try {
    await discordClient.notifyTradeExecution(data);
} catch (error) {
    console.error('Failed to send trade notification:', error);
    // Continues without Discord
}
```

## 🎨 Customization

To customize Discord messages, edit `discord-integration.ts`:

```typescript
// Change embed colors
const color = trade.direction === 'long' ? 0x00ff00 : 0xff0000;

// Modify message format
const message = `Your custom format here`;

// Add more fields to embeds
fields: [
    { name: 'Custom Field', value: 'Custom Value', inline: true }
]
```

## 📊 Benefits

1. **Real-time Notifications** - Never miss a trade or alert
2. **Team Collaboration** - Multiple people can monitor
3. **Mobile Alerts** - Discord mobile app support
4. **Rich Formatting** - Embeds for clear data presentation
5. **Selective Notifications** - Only important signals
6. **Historical Record** - Channel becomes trade log

The Discord integration is now fully operational and will send all configured notifications to your specified channel!