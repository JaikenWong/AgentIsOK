const LocalCursorService = require('../services/local-cursor-service');

class LocalCursorProvider {
  constructor(account) {
    this.account = account;
    this.service = new LocalCursorService();
  }

  async fetchBalance() {
    const snapshot = await this.service.fetchSnapshot();
    if (!snapshot) {
      return null;
    }

    return {
      ...snapshot,
      accountId: this.account.id,
      provider: this.account.provider,
      label: this.account.label,
      lines: this.buildLines(snapshot)
    };
  }

  async fetchDailyCosts() {
    return [];
  }

  buildLines(snapshot) {
    const lines = [];
    const usage = snapshot.usage || {};

    if (usage.totalPercent !== undefined) {
      lines.push({
        type: 'progress',
        label: 'Total',
        used: usage.totalPercent,
        limit: 100,
        format: { kind: 'percent' }
      });
    }

    if (usage.autoPercent !== undefined && usage.autoPercent > 0) {
      lines.push({
        type: 'progress',
        label: 'Auto',
        used: usage.autoPercent,
        limit: 100,
        format: { kind: 'percent' }
      });
    }

    if (usage.apiPercent !== undefined && usage.apiPercent > 0) {
      lines.push({
        type: 'progress',
        label: 'API',
        used: usage.apiPercent,
        limit: 100,
        format: { kind: 'percent' }
      });
    }

    if (snapshot.balanceUsd !== null && snapshot.creditTotalUsd !== null) {
      lines.push({
        type: 'progress',
        label: 'Budget',
        used: snapshot.creditUsedUsd || 0,
        limit: snapshot.creditTotalUsd,
        format: { kind: 'currency', currency: 'USD' },
        subtitle: `$${(snapshot.balanceUsd || 0).toFixed(1)} left`
      });
    }

    return lines;
  }
}

module.exports = LocalCursorProvider;
