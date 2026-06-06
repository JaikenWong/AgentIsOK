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
      const balanceUsd = Number.isFinite(budgetUsd) ? Math.max(0, budgetUsd - monthCostUsd) : null;

      return this.buildBalanceSnapshot({
        balanceUsd,
        creditTotalUsd: budgetUsd,
        creditUsedUsd: monthCostUsd,
        todayCostUsd,
        monthCostUsd,
        plan: Number.isFinite(budgetUsd) ? `Budget $${budgetUsd}` : 'Usage',
        lines: this.buildUsageLines({
          monthCostUsd,
          todayCostUsd,
          budgetUsd,
          balanceUsd
        }),
        status: 'live',
        message: 'Anthropic admin cost report'
      });
    }

    const balanceUsd = this.getMockField('balanceUsd', 18.2);
    const creditTotalUsd = this.getMockField('creditTotalUsd', 50);
    const creditUsedUsd = this.getMockField('creditUsedUsd', 31.8);
    return this.buildBalanceSnapshot({
      balanceUsd,
      creditTotalUsd,
      creditUsedUsd,
      todayCostUsd: this.getMockField('todayCostUsd', 0.9),
      monthCostUsd: creditUsedUsd,
      plan: `Budget $${creditTotalUsd}`,
      lines: this.buildUsageLines({
        monthCostUsd: creditUsedUsd,
        todayCostUsd: this.getMockField('todayCostUsd', 0.9),
        budgetUsd: creditTotalUsd,
        balanceUsd
      }),
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

  buildUsageLines({ monthCostUsd, todayCostUsd, budgetUsd, balanceUsd }) {
    const lines = [];
    if (Number.isFinite(budgetUsd) && budgetUsd > 0) {
      lines.push(this.buildProgressLine({
        label: 'Month',
        used: monthCostUsd,
        limit: budgetUsd,
        resetsAt: this.endOfMonthUtc().toISOString(),
        subtitle: `${this.formatUsd(balanceUsd)} left`
      }));
    }

    lines.push(this.buildTextLine({
      label: 'Today',
      value: `${this.formatUsd(todayCostUsd)} today`,
      subtitle: `Month ${this.formatUsd(monthCostUsd)}`
    }));

    return lines;
  }

  formatUsd(value) {
    return typeof value === 'number' && Number.isFinite(value)
      ? `$${value.toFixed(1)}`
      : '--';
  }
}

module.exports = AnthropicProvider;
