class LocalDeepSeekService {
  constructor() {
    this.apiKey = null;
    this.baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  }

  async fetchSnapshot() {
    const apiKey = this.findApiKey();
    if (!apiKey) {
      return null;
    }

    this.apiKey = apiKey;

    try {
      const data = await this.fetchBalance();
      return this.buildSnapshot(data);
    } catch (err) {
      return {
        accountId: 'deepseek-local',
        provider: 'deepseek',
        label: 'DeepSeek',
        status: 'error',
        message: `DeepSeek fetch failed: ${err.message}`,
        capturedAt: Date.now(),
        source: 'provider_api'
      };
    }
  }

  findApiKey() {
    const raw = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_TOKEN;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  }

  async fetchBalance() {
    const res = await fetch(`${this.baseUrl}/user/balance`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json'
      }
    });

    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (err) {
        throw new Error(`Invalid JSON: ${text.slice(0, 120)}`);
      }
    }

    if (!res.ok) {
      const message = data?.error?.message || data?.message || `HTTP ${res.status}`;
      throw new Error(message);
    }

    return data || {};
  }

  buildSnapshot(data) {
    const balanceInfos = Array.isArray(data.balance_infos) ? data.balance_infos : [];
    const primary = this.pickPrimaryBalance(balanceInfos);
    const totalBalance = LocalDeepSeekService.readMoney(primary?.total_balance);
    const grantedBalance = LocalDeepSeekService.readMoney(primary?.granted_balance);
    const toppedUpBalance = LocalDeepSeekService.readMoney(primary?.topped_up_balance);
    const currency = primary?.currency || 'CNY';

    return {
      accountId: 'deepseek-local',
      provider: 'deepseek',
      label: 'DeepSeek',
      balanceUsd: currency === 'USD' ? totalBalance : null,
      creditTotalUsd: null,
      creditUsedUsd: null,
      status: data.is_available === false ? 'warn' : 'live',
      capturedAt: Date.now(),
      source: 'provider_api',
      plan: currency,
      usage: {
        currency,
        totalBalance,
        grantedBalance,
        toppedUpBalance,
        isAvailable: data.is_available !== false
      },
      meta: {
        balanceInfos,
        baseUrl: this.baseUrl
      }
    };
  }

  pickPrimaryBalance(balanceInfos) {
    if (!balanceInfos.length) {
      return null;
    }

    const cny = balanceInfos.find((item) => item?.currency === 'CNY');
    return cny || balanceInfos[0];
  }

  static readMoney(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
}

module.exports = LocalDeepSeekService;
