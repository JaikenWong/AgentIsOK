const BaseProvider = require('./base-provider');

class OpenAIProvider extends BaseProvider {
  async fetchBalance() {
    const adminKey = this.getEnv(this.account.adminKeyEnv);
    if (adminKey) {
      const dailyCosts = await this.fetchCostsFromApi(adminKey, this.startOfMonthUtc(), new Date());
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
        message: 'OpenAI admin costs API'
      });
    }

    return this.buildBalanceSnapshot({
      balanceUsd: this.getMockField('balanceUsd', 42.7),
      creditTotalUsd: this.getMockField('creditTotalUsd', 100),
      creditUsedUsd: this.getMockField('creditUsedUsd', 57.3),
      status: 'mock',
      message: 'Set adminKeyEnv for live data'
    });
  }

  async fetchDailyCosts() {
    const adminKey = this.getEnv(this.account.adminKeyEnv);
    if (!adminKey) {
      return this.buildMockDailyCosts();
    }

    return this.fetchCostsFromApi(adminKey, this.dateDaysAgoUtc(6), new Date());
  }

  async fetchCostsFromApi(adminKey, startDate, endDate) {
    const params = new URLSearchParams({
      start_time: String(this.toUnixSeconds(startDate)),
      end_time: String(this.toUnixSeconds(endDate)),
      bucket_width: '1d',
      limit: '31'
    });

    const headers = {
      Authorization: `Bearer ${adminKey}`,
      'Content-Type': 'application/json'
    };

    if (this.account.organizationId) {
      headers['OpenAI-Organization'] = this.account.organizationId;
    }

    if (this.account.projectId) {
      headers['OpenAI-Project'] = this.account.projectId;
    }

    const data = await this.fetchJson(`https://api.openai.com/v1/organization/costs?${params.toString()}`, {
      method: 'GET',
      headers
    });

    return (data.data || []).map((bucket) => {
      const total = (bucket.results || []).reduce((sum, result) => {
        const amount = result.amount && typeof result.amount.value === 'number'
          ? result.amount.value
          : 0;
        return sum + amount;
      }, 0);

      const date = new Date(bucket.start_time * 1000).toISOString().slice(0, 10);
      return this.buildDailyCostEvent({
        date,
        costUsd: total
      });
    });
  }

  buildMockDailyCosts() {
    const values = [1.2, 0.9, 1.1, 1.4, 0.8, 1.0, 1.3];
    return values.map((costUsd, index) => {
      const date = this.toIso(this.dateDaysAgoUtc(6 - index)).slice(0, 10);
      return this.buildDailyCostEvent({ date, costUsd });
    });
  }
}

module.exports = OpenAIProvider;
