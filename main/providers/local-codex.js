const LocalCodexService = require('../services/local-codex-service');

class LocalCodexProvider {
  constructor(account, defaultsConfig = {}) {
    this.account = account;
    this.defaultsConfig = defaultsConfig;
    this.service = new LocalCodexService();
  }

  async fetchBalance() {
    const snapshot = await this.service.fetchSnapshot();
    if (!snapshot) {
      return null;
    }

    const providerDefaults = (this.defaultsConfig.providers && this.defaultsConfig.providers.codex) || {};
    const manualPlan = providerDefaults.manualPlan ? String(providerDefaults.manualPlan).trim() : '';
    const effectivePlan = manualPlan || snapshot.plan || 'ChatGPT login';

    return {
      ...snapshot,
      accountId: this.account.id,
      provider: this.account.provider,
      label: this.account.label,
      plan: effectivePlan,
      meta: {
        ...(snapshot.meta || {}),
        manualPlan: manualPlan || null
      },
      lines: this.buildLines(snapshot, { manualPlan, effectivePlan })
    };
  }

  async fetchDailyCosts() {
    return [];
  }

  buildLines(snapshot, options = {}) {
    const lines = [];
    const lastRefresh = snapshot.meta && snapshot.meta.lastRefresh ? this.formatLastRefresh(snapshot.meta.lastRefresh) : null;
    const stale = snapshot.status === 'stale' || (snapshot.meta && snapshot.meta.isStale);
    const subtitleBits = [];

    if (options.manualPlan) {
      subtitleBits.push('manual');
    }
    if (lastRefresh) {
      subtitleBits.push(`cached ${lastRefresh}`);
    }

    if (stale) {
      lines.push({
        type: 'text',
        label: 'Status',
        value: 'Refresh needed',
        subtitle: subtitleBits.join(' · ') || 'Usage in Codex dashboard'
      });
    }

    if (snapshot.usage) {
      const usage = snapshot.usage;
      const rateLimit = usage.rate_limit;

      if (rateLimit) {
        if (rateLimit.primary_window && rateLimit.primary_window.used_percent !== undefined) {
          const resetAt = rateLimit.primary_window.reset_at;
          const usedPercent = Math.max(0, Math.min(100, Number(rateLimit.primary_window.used_percent || 0)));
          const remainingPercent = 100 - usedPercent;
          lines.push({
            type: 'progress',
            label: 'Session',
            used: usedPercent,
            limit: 100,
            format: { kind: 'percent', mode: 'remaining' },
            subtitle: resetAt
              ? `${Math.round(remainingPercent)}% left · resets ${new Date(resetAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : `${Math.round(remainingPercent)}% left`
          });
        }
        if (rateLimit.secondary_window && rateLimit.secondary_window.used_percent !== undefined) {
          const usedPercent = Math.max(0, Math.min(100, Number(rateLimit.secondary_window.used_percent || 0)));
          const remainingPercent = 100 - usedPercent;
          lines.push({
            type: 'progress',
            label: 'Weekly',
            used: usedPercent,
            limit: 100,
            format: { kind: 'percent', mode: 'remaining' },
            subtitle: `${Math.round(remainingPercent)}% left`
          });
        }
      }

      if (usage.credits && usage.credits.balance !== undefined) {
        const remaining = Number(usage.credits.balance || 0);
        const total = usage.credits.total !== undefined ? Number(usage.credits.total) : 1000;
        if (total > 0) {
          const used = Math.max(0, total - remaining);
          lines.push({
            type: 'progress',
            label: 'Credits',
            used,
            limit: total,
            format: { kind: 'count', suffix: 'credits' },
            subtitle: `${remaining} remaining`
          });
        }
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
