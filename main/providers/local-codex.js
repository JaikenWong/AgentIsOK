const LocalCodexService = require('../services/local-codex-service');

class LocalCodexProvider {
  constructor(account) {
    this.account = account;
    this.service = new LocalCodexService();
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
      plan: snapshot.plan || 'ChatGPT login',
      lines: this.buildLines(snapshot)
    };
  }

  async fetchDailyCosts() {
    return [];
  }

  buildLines(snapshot) {
    const lines = [];
    const planType = snapshot.plan || 'ChatGPT login';
    const lastRefresh = snapshot.meta && snapshot.meta.lastRefresh ? this.formatLastRefresh(snapshot.meta.lastRefresh) : null;
    const stale = snapshot.status === 'stale' || (snapshot.meta && snapshot.meta.isStale);

    if (stale) {
      lines.push({
        type: 'text',
        label: 'Status',
        value: 'Refresh needed',
        subtitle: lastRefresh ? `cached ${lastRefresh}` : 'Usage in Codex dashboard'
      });
    }

    if (snapshot.usage) {
      const usage = snapshot.usage;
      const rateLimit = usage.rate_limit;

      if (rateLimit) {
        if (rateLimit.primary_window && rateLimit.primary_window.used_percent !== undefined) {
          const resetAt = rateLimit.primary_window.reset_at;
          lines.push({
            type: 'progress',
            label: 'Session',
            used: rateLimit.primary_window.used_percent,
            limit: 100,
            format: { kind: 'percent' },
            subtitle: resetAt ? `Resets at ${new Date(resetAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : null
          });
        }
        if (rateLimit.secondary_window && rateLimit.secondary_window.used_percent !== undefined) {
          lines.push({
            type: 'progress',
            label: 'Weekly',
            used: rateLimit.secondary_window.used_percent,
            limit: 100,
            format: { kind: 'percent' }
          });
        }
      }

      if (usage.credits && usage.credits.balance !== undefined) {
        const remaining = usage.credits.balance;
        const total = 1000; // Assuming 1000 as a standard limit or just showing remaining
        lines.push({
          type: 'progress',
          label: 'Credits',
          used: Math.max(0, total - remaining),
          limit: total,
          format: { kind: 'count', suffix: 'credits' },
          subtitle: `${remaining} remaining`
        });
      }
    }

    return lines;
  }

  formatLastRefresh(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  }
}

module.exports = LocalCodexProvider;
