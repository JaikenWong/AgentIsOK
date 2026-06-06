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

    if (usage.total > 0) {
      lines.push({
        type: 'progress',
        label: 'Session',
        used: usage.used,
        limit: usage.total,
        format: { kind: 'count', suffix: 'prompts' },
        resetsAt: usage.resetsAt
      });
    } else if (usage.remainingPercent !== undefined && usage.remainingPercent > 0) {
      lines.push({
        type: 'progress',
        label: 'Session',
        used: 100 - usage.remainingPercent,
        limit: 100,
        format: { kind: 'percent' },
        resetsAt: usage.resetsAt
      });
    }

    return lines;
  }
}

module.exports = LocalMinimaxProvider;
