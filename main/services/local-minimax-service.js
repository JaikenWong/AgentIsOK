const fs = require('fs');
const path = require('path');
const os = require('os');

class LocalMinimaxService {
  constructor() {
    this.region = null;
    this.apiKey = null;
    this.baseUrl = null;
  }

  async fetchSnapshot() {
    const keyInfo = this.findApiKey();
    if (!keyInfo) {
      return null;
    }

    this.apiKey = keyInfo.key;
    this.region = keyInfo.region;
    this.baseUrl = keyInfo.baseUrl;

    try {
      const data = await this.fetchUsage();
      return this.buildSnapshot(data);
    } catch (err) {
      return {
        accountId: 'minimax-local',
        provider: 'minimax',
        label: 'MiniMax',
        status: 'error',
        message: `MiniMax fetch failed: ${err.message}`,
        capturedAt: Date.now(),
        source: 'local_auth'
      };
    }
  }

  findApiKey() {
    const cnKey = process.env.MINIMAX_CN_API_KEY;
    const globalKey = process.env.MINIMAX_API_KEY || process.env.MINIMAX_API_TOKEN;
    const customBaseUrl = process.env.MINIMAX_BASE_URL || process.env.MINIMAX_API_HOST;

    if (cnKey) {
      return {
        key: cnKey,
        region: 'CN',
        baseUrl: customBaseUrl || 'https://api.minimaxi.com'
      };
    }
    if (globalKey) {
      return {
        key: globalKey,
        region: 'GLOBAL',
        baseUrl: customBaseUrl || 'https://www.minimax.io'
      };
    }

    if (process.platform === 'darwin') {
      try {
        const { execSync } = require('child_process');
        const key = execSync(
          'security find-generic-password -s minimax-api-key -w 2>/dev/null',
          { encoding: 'utf8', timeout: 5000 }
        ).trim();
        if (key) {
          return {
            key,
            region: 'GLOBAL',
            baseUrl: customBaseUrl || 'https://www.minimax.io'
          };
        }
      } catch (e) {}
    }

    return null;
  }

  async fetchUsage() {
    const baseUrl = this.baseUrl || (this.region === 'CN'
      ? 'https://api.minimaxi.com'
      : 'https://www.minimax.io');

    const res = await fetch(`${baseUrl}/v1/token_plan/remains`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  buildSnapshot(data) {
    const remains = data?.model_remains || [];
    const first = this.pickPrimaryRemain(remains);

    const total = Number(first.current_interval_total_count || 0);
    const used = Number(first.current_interval_usage_count || 0);
    const remaining = Number(first.current_interval_remaining_count || first.current_interval_remains_count || 0);
    const remainingPercent = Number(first.current_interval_remaining_percent || 0);

    const planName = data?.current_subscribe_title || data?.plan_name || data?.plan || 'MiniMax';
    const endTime = first.end_time || first.remains_time || null;

    let usedCount = used;
    let totalCount = total;
    if (totalCount <= 0 && remaining > 0) {
      totalCount = used + remaining;
    }

    return {
      accountId: 'minimax-local',
      provider: 'minimax',
      label: 'MiniMax',
      balanceUsd: null,
      creditTotalUsd: null,
      creditUsedUsd: null,
      status: 'live-local',
      capturedAt: Date.now(),
      source: 'local_auth',
      plan: `${planName} (${this.region})`,
      usage: {
        used: usedCount,
        total: totalCount,
        remaining,
        remainingPercent,
        resetsAt: endTime
      },
      meta: {
        region: this.region,
        baseUrl: this.baseUrl,
        modelRemains: remains
      }
    };
  }

  pickPrimaryRemain(remains) {
    if (!Array.isArray(remains) || !remains.length) {
      return {};
    }

    return remains
      .slice()
      .sort((left, right) => this.getRemainScore(right) - this.getRemainScore(left))[0] || {};
  }

  getRemainScore(item) {
    if (!item || typeof item !== 'object') {
      return 0;
    }

    const total = Number(item.current_interval_total_count || 0);
    const used = Number(item.current_interval_usage_count || 0);
    const remaining = Number(item.current_interval_remaining_count || item.current_interval_remains_count || 0);
    const remainingPercent = Number(item.current_interval_remaining_percent || 0);

    return (
      (total > 0 ? 1000 : 0) +
      (used > 0 ? 400 : 0) +
      (remaining > 0 ? 200 : 0) +
      (remainingPercent > 0 ? 100 : 0) +
      total + used + remaining
    );
  }
}

module.exports = LocalMinimaxService;
