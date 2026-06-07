const LocalMinimaxService = require('../services/local-minimax-service');

class LocalMinimaxProvider {
  constructor(account) {
    this.account = account;
    this.service = new LocalMinimaxService();
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

    // Percent mode: API returned percent-only data (no count totals).
    // Shows a percent progress bar instead of count-based.
    if (usage.isPercentMode) {
      const pct = Math.min(100, Math.max(0, Number(usage.remainingPercent) || 0));
      lines.push({
        type: 'progress',
        label: 'Session',
        used: pct,
        limit: 100,
        format: { kind: 'percent', mode: 'remaining' },
        subtitle: `${Math.round(pct)}% left`,
        resetsAt: usage.resetsAt
      });
    } else if (usage.total > 0) {
      lines.push({
        type: 'progress',
        label: 'Session',
        used: usage.remaining !== undefined ? usage.remaining : usage.used,
        limit: usage.total,
        format: { kind: 'count', mode: 'remaining', suffix: 'prompts' },
        subtitle: `${usage.remaining !== undefined ? usage.remaining + ' left' : ''}`,
        resetsAt: usage.resetsAt
      });
    }

    return lines;
  }
}

module.exports = LocalMinimaxProvider;
