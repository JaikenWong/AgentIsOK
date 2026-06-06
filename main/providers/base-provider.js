class BaseProvider {
  constructor(account, defaultsConfig) {
    this.account = account;
    this.defaultsConfig = defaultsConfig;
  }

  getMockField(name, fallback = null) {
    if (this.account.mock && this.account.mock[name] !== undefined) {
      return this.account.mock[name];
    }

    return fallback;
  }

  buildBalanceSnapshot(fields) {
    return {
      accountId: this.account.id,
      provider: this.account.provider,
      label: this.account.label,
      billingMode: this.account.billingMode || null,
      capturedAt: Date.now(),
      source: 'provider_api',
      status: 'ok',
      ...fields
    };
  }

  endOfMonthUtc() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  }

  buildProgressLine({ label, used, limit, resetsAt = null, subtitle = null }) {
    return {
      type: 'progress',
      label,
      used: Number(used || 0),
      limit: Number(limit || 0),
      remaining: Number(limit || 0) - Number(used || 0),
      format: { kind: 'currency', currency: 'USD' },
      resetsAt,
      subtitle
    };
  }

  buildTextLine({ label, value, subtitle = null }) {
    return {
      type: 'text',
      label,
      value,
      subtitle
    };
  }

  getEnv(name) {
    return name ? process.env[name] : undefined;
  }

  getConfiguredNumber(name, fallback = null) {
    const raw = this.account[name];
    if (raw === undefined || raw === null || raw === '') {
      return fallback;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  buildDailyCostEvent({ date, costUsd, model = 'all', project = 'provider-sync' }) {
    const timestamp = new Date(`${date}T00:00:00.000Z`).getTime();
    return {
      id: `daily_${this.account.id}_${date}`,
      timestamp,
      source: 'provider_api_daily',
      provider: this.account.provider,
      accountId: this.account.id,
      project,
      model,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      costUsd: Number(costUsd || 0)
    };
  }

  startOfMonthUtc() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  }

  startOfDayUtc() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  }

  dateDaysAgoUtc(days) {
    const date = this.startOfDayUtc();
    date.setUTCDate(date.getUTCDate() - days);
    return date;
  }

  toIso(date) {
    return date.toISOString();
  }

  toUnixSeconds(date) {
    return Math.floor(date.getTime() / 1000);
  }

  async fetchJson(url, options = {}) {
    const fetchImpl = global.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('Global fetch unavailable');
    }

    const response = await fetchImpl(url, options);
    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 160)}`);
      }
    }

    if (!response.ok) {
      const message = data && data.error && data.error.message
        ? data.error.message
        : `HTTP ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  async fetchDailyCosts() {
    return [];
  }
}

module.exports = BaseProvider;
