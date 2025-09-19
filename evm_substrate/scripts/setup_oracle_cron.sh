#!/bin/bash

# Setup Oracle Price Update Cron Job
# This script adds a cron job to automatically update oracle prices every 30 minutes

SCRIPT_DIR="/Users/jm/counterstake-bridge/evm_substrate/scripts"
LOG_DIR="/Users/jm/Library/Application Support/counterstake-bridge/logs"
CRON_ENTRY="*/30 * * * * cd $SCRIPT_DIR && node oracle_price_updater.js >> $LOG_DIR/oracle_updates.log 2>> $LOG_DIR/oracle_updates.err"

echo "🔧 Setting up Oracle Price Update Cron Job..."
echo "📁 Script Directory: $SCRIPT_DIR"
echo "📁 Log Directory: $LOG_DIR"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Check if cron entry already exists
if crontab -l 2>/dev/null | grep -q "oracle_price_updater.js"; then
    echo "⚠️  Oracle price updater cron job already exists"
    echo "Current cron entries:"
    crontab -l | grep "oracle_price_updater.js"
else
    echo "➕ Adding oracle price updater to crontab..."
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
    echo "✅ Oracle price updater cron job added successfully"
fi

echo ""
echo "📋 Current crontab entries:"
crontab -l

echo ""
echo "🎯 Oracle Price Update Schedule:"
echo "   - Updates every 30 minutes"
echo "   - Logs to: $LOG_DIR/oracle_updates.log"
echo "   - Errors to: $LOG_DIR/oracle_updates.err"
echo ""
echo "🔍 To monitor logs:"
echo "   tail -f $LOG_DIR/oracle_updates.log"
echo "   tail -f $LOG_DIR/oracle_updates.err"
echo ""
echo "🛑 To remove cron job:"
echo "   crontab -e  # then delete the oracle_price_updater.js line"
