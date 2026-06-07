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

    // Read raw field values. Field names are taken at face value: usage_count
    // is USAGE (consumed), remaining_count is REMAINING, used_count is also USED.
    // Don't trust undocumented "usage = remaining" semantics.
    const total = Number(first.current_interval_total_count || 0);

    const remainingField = LocalMinimaxService.pickDefinedField(first, [
      'current_interval_remaining_count',
      'current_interval_remains_count',
      'current_interval_remain_count',
      'remaining_count',
      'remains_count',
      'remaining',
      'remains',
      'left_count'
    ]);
    const explicitUsedField = LocalMinimaxService.pickDefinedField(first, [
      'current_interval_usage_count',
      'current_interval_used_count',
      'used_count',
      'used'
    ]);

    const hasRemaining = remainingField !== null;
    const hasUsed = explicitUsedField !== null;
    const remainingRaw = hasRemaining ? Number(remainingField) : null;
    const usedRaw = hasUsed ? Number(explicitUsedField) : null;

    let usedCount;
    let remaining;

    if (hasRemaining && hasUsed) {
      // Both present — use them; if sum doesn't match total, prefer explicit remaining.
      usedCount = Math.max(0, usedRaw);
      remaining = Math.max(0, remainingRaw);
      if (total > 0 && Math.abs((usedCount + remaining) - total) > Math.max(1, total * 0.05)) {
        // Self-inconsistent: recompute used from total - remaining.
        usedCount = Math.max(0, total - remaining);
        console.warn(
          `[minimax] model "${first.model_name || '?'}": used+remaining (${usedCount + remaining}) != total (${total}); using total - remaining`
        );
      }
    } else if (hasRemaining) {
      remaining = Math.max(0, remainingRaw);
      usedCount = Math.max(0, total - remaining);
    } else if (hasUsed) {
      usedCount = Math.max(0, usedRaw);
      remaining = Math.max(0, total - usedCount);
    } else {
      usedCount = 0;
      remaining = Math.max(0, total);
    }

    if (total > 0) {
      if (usedCount > total) usedCount = total;
      if (remaining > total) remaining = total;
    } else {
      // total=0 means the API didn't return a cap; show used as-is without clamping to 0.
      usedCount = Math.max(0, usedCount);
      remaining = Math.max(0, remaining);
    }

    // CN API returns model call counts (÷15 for prompts); GLOBAL returns prompt counts.
    const MODEL_CALLS_PER_PROMPT = 15;
    const isCn = this.region === 'CN';
    const multiplier = isCn ? 1 / MODEL_CALLS_PER_PROMPT : 1;

    const finalUsed = Math.round(usedCount * multiplier);
    const finalTotal = Math.round(total * multiplier);
    const finalRemaining = Math.round(remaining * multiplier);

    const remainingPercent = this.computeRemainingPercent(first, {
      total: finalTotal,
      used: finalUsed,
      remaining: finalRemaining
    });

    console.log(
      `[minimax:${this.region}] model=${first.model_name || '?'} ` +
      `raw_total=${total} raw_used=${usedCount} raw_remaining=${remaining} ` +
      `→ final total=${finalTotal} used=${finalUsed} remaining=${finalRemaining} (${remainingPercent}%)`
    );

    const planName = data?.current_subscribe_title || data?.plan_name || data?.plan || 'MiniMax';
    const endTime = first.end_time || first.remains_time || null;

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
        used: finalUsed,
        total: finalTotal,
        remaining: finalRemaining,
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

  // Read the first field on `item` whose value is neither null nor undefined.
  // Returns null if every field is missing — this lets callers distinguish
  // "field not present" from "field is 0", which the `||` operator cannot.
  static pickDefinedField(item, fieldNames) {
    if (!item || typeof item !== 'object') return null;
    for (const name of fieldNames) {
      const value = item[name];
      if (value !== null && value !== undefined) {
        return value;
      }
    }
    return null;
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

  computeRemainingPercent(item, fallback = {}) {
    const direct = Number(item?.current_interval_remaining_percent);
    if (Number.isFinite(direct) && direct >= 0 && direct <= 100) {
      return direct;
    }

    const total = Number(fallback.total || item?.current_interval_total_count || 0);
    const used = Number(fallback.used || item?.current_interval_usage_count || 0);
    const remaining = Number(fallback.remaining || item?.current_interval_remaining_count || item?.current_interval_remains_count || 0);

    if (total > 0 && remaining > 0) {
      return Math.max(0, Math.min(100, (remaining / total) * 100));
    }

    if (total > 0 && used >= 0) {
      return Math.max(0, Math.min(100, 100 - (used / total) * 100));
    }

    if (used > 0 || remaining > 0) {
      const sum = used + remaining;
      if (sum > 0) {
        return Math.max(0, Math.min(100, (remaining / sum) * 100));
      }
    }

    return null;
  }
}

module.exports = LocalMinimaxService;
