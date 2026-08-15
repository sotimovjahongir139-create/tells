const cron = require('node-cron');
const env = require('../config/env');
const syncService = require('../services/sync.service');

function startScheduler() {
  const minutes = Math.max(1, env.syncIntervalMinutes);
  const expression = `*/${minutes} * * * *`;

  cron.schedule(expression, async () => {
    try {
      const result = await syncService.syncAmoCrmCalls();
      console.log(
        `[sync] fetched=${result.fetched} created=${result.created} skippedUnattributed=${result.skippedUnattributed}`
      );
    } catch (err) {
      console.error('[sync] failed:', err.message);
    }
  });

  console.log(`[scheduler] amoCRM sync scheduled every ${minutes} minute(s).`);
}

module.exports = { startScheduler };
