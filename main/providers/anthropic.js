const BaseProvider = require('./base-provider');

class AnthropicProvider extends BaseProvider {
  async fetchBalance() {
    const adminKey = this.getEnv(this.account.adminKeyEnv);
    if (adminKey) {
      const dailyCosts = await this.fetchCostReport(adminKey, this.startOfMonthUtc(), new Date());
      const monthCostUsd = dailyCosts.reduce((sum, item) => sum + item.costUsd, 0);
      const todayKey = this.toIso(this.startOfDayUtc()).slice(0, 10);
      const todayCostUsd = dailyCosts
        .filter((item) => item.date === todayKey)
        .reduce((sum, item) => sum + item.costUsd, 0);
      const budgetUsd = this.getConfiguredNumber('budgetUsd', null);

      return this.buildBalanceSnapshot({
        balanceUsd: Number.isFinite(budgetUsd) ? Math.max(0, budgetUsd - monthCostUsd) : null,
        creditTotalUsd: budgetUsd,
        creditUsedUsd: monthCostUsd,
        todayCostUsd,
        monthCostUsd,
        status: 'live',
        message: 'Anthropic admin cost report'
      });
    }

    return this.buildBalanceSnapshot({
      balanceUsd: this.getMockField('balanceUsd', 18.2),
      creditTotalUsd: this.getMockField('creditTotalUsd', 50),
      creditUsedUsd: this.getMockField('creditUsedUsd', 31.8),
      status: 'mock',
      message: 'Set adminKeyEnv for live data'
    });
  }

  async fetchDailyCosts() {
    const adminKey = this.getEnv(this.account.adminKeyEnv);
    if (!adminKey) {
      return this.buildMockDailyCosts();
    }

    return this.fetchCostReport(adminKey, this.dateDaysAgoUtc(6), new Date());
  }

  async fetchCostReport(adminKey, startDate, endDate) {
    const params = new URLSearchParams({
      starting_at: this.toIso(startDate),
      ending_at: this.toIso(endDate),
      bucket_width: '1d',
      limit: '31'
    });

    if (this.account.workspaceId) {
      params.append('workspace_ids[]', this.account.workspaceId);
    }

    const data = await this.fetchJson(`https://api.anthropic.com/v1/organizations/cost_report?${params.toString()}`, {
      method: 'GET',
      headers: {
        'x-api-key': adminKey,
        'anthropic-version': '2023-06-01'
      }
    });

    return (data.data || []).map((bucket) => {
      const total = (bucket.results || []).reduce((sum, result) => {
        return sum + this.parseAnthropicAmount(result.amount, result.currency);
      }, 0);

      const date = bucket.starting_at.slice(0, 10);
      return this.buildDailyCostEvent({
        date,
        costUsd: total
      });
    });
  }

  parseAnthropicAmount(amount, currency) {
    const numeric = Number(amount || 0);
    if (!Number.isFinite(numeric)) {
      return 0;
    }

    if (String(currency || '').toUpperCase() === 'USD') {
      return numeric / 100;
    }

    return numeric;
  }

  buildMockDailyCosts() {
    const values = [0.7, 0.5, 0.6, 0.8, 0.4, 0.7, 0.9];
    return values.map((costUsd, index) => {
      const date = this.toIso(this.dateDaysAgoUtc(6 - index)).slice(0, 10);
      return this.buildDailyCostEvent({ date, costUsd });
    });
  }
}

module.exports = AnthropicProvider;
