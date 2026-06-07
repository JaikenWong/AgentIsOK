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
    // AUTO region selection (mirrors openusage):
    //   - if MINIMAX_CN_API_KEY is set, try CN first
    //   - otherwise try GLOBAL first
    //   - on auth/HTTP error from the first attempt, fall through to the other
    const regions = LocalMinimaxService.endpointAttempts();

    let firstNetworkError = null;
    let firstHttpStatus = null;
    let firstAuthStatus = null;

    for (const region of regions) {
      const keyInfo = this.loadApiKeyForRegion(region);
      if (!keyInfo) continue;

      this.apiKey = keyInfo.key;
      this.region = region;
      this.baseUrl = keyInfo.baseUrl;

      let data;
      try {
        data = await this.fetchUsage();
      } catch (err) {
        // Network / non-2xx: remember first such error and try the other region.
        const m = String(err && err.message || '');
        if (/^HTTP 4(01|03)/.test(m)) {
          firstAuthStatus = m;
        } else if (/^HTTP /.test(m)) {
          firstHttpStatus = firstHttpStatus || m;
        } else {
          firstNetworkError = firstNetworkError || m;
        }
        continue;
      }

      // Diagnostic: log the raw payload so parser issues are easy to diagnose.
      try {
        const preview = JSON.stringify(data);
        console.log(`[minimax:raw:${region}] ${preview.length > 2000 ? preview.slice(0, 2000) + '…[truncated]' : preview}`);
      } catch (_) { /* ignore JSON.stringify errors (circular) */ }

      return this.buildSnapshot(data);
    }

    // No region produced a usable response.
    const reason = firstAuthStatus
      ? 'Session expired. Check your MiniMax API key.'
      : firstHttpStatus
        ? `Request failed (${firstHttpStatus.replace(/^HTTP /, 'HTTP ')}). Try again later.`
        : firstNetworkError
          ? 'Request failed. Check your connection.'
          : 'MiniMax API key missing. Set MINIMAX_API_KEY or MINIMAX_CN_API_KEY.';
    console.error(`[minimax] ${reason}`);
    return {
      accountId: 'minimax-local',
      provider: 'minimax',
      label: 'MiniMax',
      status: 'error',
      message: reason,
      capturedAt: Date.now(),
      source: 'local_auth'
    };
  }

  loadApiKeyForRegion(region) {
    const customBaseUrl = process.env.MINIMAX_BASE_URL || process.env.MINIMAX_API_HOST;
    const envVars = region === 'CN'
      ? ['MINIMAX_CN_API_KEY', 'MINIMAX_API_KEY', 'MINIMAX_API_TOKEN']
      : ['MINIMAX_API_KEY', 'MINIMAX_API_TOKEN'];

    for (const name of envVars) {
      const raw = process.env[name];
      if (typeof raw === 'string' && raw.trim()) {
        return {
          key: raw.trim(),
          region,
          baseUrl: customBaseUrl || (region === 'CN' ? 'https://api.minimaxi.com' : 'https://www.minimax.io')
        };
      }
    }

    // macOS keychain fallback (GLOBAL only, since the openusage reference
    // only stores under the global keychain service name).
    if (region === 'GLOBAL' && process.platform === 'darwin') {
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

  static endpointAttempts() {
    return process.env.MINIMAX_CN_API_KEY ? ['CN', 'GLOBAL'] : ['GLOBAL', 'CN'];
  }

  async fetchUsage() {
    const res = await fetch(`${this.baseUrl}/v1/token_plan/remains`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();

    const data = (payload && typeof payload.data === 'object' && payload.data) || payload || {};
    const baseResp = data.base_resp || payload.base_resp || null;
    const apiStatusCode = LocalMinimaxService.readNumber(baseResp?.status_code);
    if (apiStatusCode !== null && apiStatusCode !== 0) {
      const msg = LocalMinimaxService.readString(baseResp?.status_msg) || `status ${apiStatusCode}`;
      if (apiStatusCode === 1004 || /invalid.*api.?key|unauthorized|auth/i.test(msg)) {
        throw new Error(`HTTP 401 ${msg}`);
      }
      throw new Error(`HTTP 500 ${msg}`);
    }

    return payload;
  }

  buildSnapshot(payload) {
    // Some endpoints wrap the body in {data: {...}}. openusage handles both.
    const data = (payload && typeof payload.data === 'object' && payload.data) || payload || {};

    const baseResp = (data && data.base_resp) || payload?.base_resp || null;
    const statusCode = LocalMinimaxService.readNumber(baseResp?.status_code);
    const statusMessage = LocalMinimaxService.readString(baseResp?.status_msg);
    if (statusCode !== null && statusCode !== 0) {
      return {
        accountId: 'minimax-local',
        provider: 'minimax',
        label: 'MiniMax',
        status: 'error',
        message: statusMessage
          ? `MiniMax API error: ${statusMessage}`
          : `MiniMax API error (status ${statusCode})`,
        capturedAt: Date.now(),
        source: 'local_auth'
      };
    }

    // model_remains may live under several keys (snake/camel, top-level or under data).
    const remains = LocalMinimaxService.pickFirstArray(data, [
      'model_remains',
      'modelRemains'
    ]) || LocalMinimaxService.pickFirstArray(payload, [
      'model_remains',
      'modelRemains'
    ]) || [];
    if (!remains.length) {
      return {
        accountId: 'minimax-local',
        provider: 'minimax',
        label: 'MiniMax',
        status: 'error',
        message: 'Could not parse usage data.',
        capturedAt: Date.now(),
        source: 'local_auth'
      };
    }

    const isCn = this.region === 'CN';
    const MODEL_CALLS_PER_PROMPT = 15;
    const displayMultiplier = isCn ? 1 / MODEL_CALLS_PER_PROMPT : 1;

    // Pick the right model_remains entry. openusage's policy:
    //   1. first entry with total > 0 that survives the CN scaling
    //   2. fallback: percent-bearing entry whose model_name === "general"
    //   3. fallback: any percent-bearing entry
    let chosen = null;
    let percentGeneralCandidate = null;
    let percentAnyCandidate = null;
    for (const item of remains) {
      if (!item || typeof item !== 'object') continue;
      const total = LocalMinimaxService.readNumber(item.current_interval_total_count ?? item.currentIntervalTotalCount);
      if (total !== null && total > 0 && Math.round(total * displayMultiplier) > 0) {
        chosen = item;
        break;
      }
      const pct = LocalMinimaxService.readNumber(item.current_interval_remaining_percent ?? item.currentIntervalRemainingPercent);
      if (pct !== null && pct >= 0 && pct <= 100) {
        const modelName = LocalMinimaxService.readString(item.model_name ?? item.modelName);
        if (!percentAnyCandidate) percentAnyCandidate = item;
        if (!percentGeneralCandidate && modelName === 'general') percentGeneralCandidate = item;
      }
    }
    if (!chosen) chosen = percentGeneralCandidate || percentAnyCandidate;
    if (!chosen) {
      return {
        accountId: 'minimax-local',
        provider: 'minimax',
        label: 'MiniMax',
        status: 'error',
        message: 'Could not parse usage data.',
        capturedAt: Date.now(),
        source: 'local_auth'
      };
    }

    const total = LocalMinimaxService.readNumber(chosen.current_interval_total_count ?? chosen.currentIntervalTotalCount) || 0;
    const remainingPercent = LocalMinimaxService.readNumber(
      chosen.current_interval_remaining_percent ?? chosen.currentIntervalRemainingPercent
    );

    // Percent mode: API didn't return a cap but did return a percent.
    const hasDisplayableCount = total > 0 && Math.round(total * displayMultiplier) > 0;

    let usedCount;
    let finalTotal;
    let finalUsed;
    let finalRemaining;
    let isPercentMode = false;
    let remainingPercentOut = null;

    if (!hasDisplayableCount && remainingPercent !== null) {
      isPercentMode = true;
      const percentUsed = 100 - remainingPercent;
      const percentRemaining = remainingPercent;
      // For percent mode, percent-mode CN responses should NOT be scaled
      // (the percent is already a fraction, not a model-call count).
      finalUsed = percentUsed;
      finalTotal = 100;
      finalRemaining = percentRemaining;
      remainingPercentOut = percentRemaining;
      usedCount = percentUsed;
    } else if (!hasDisplayableCount) {
      return {
        accountId: 'minimax-local',
        provider: 'minimax',
        label: 'MiniMax',
        status: 'error',
        message: 'Could not parse usage data.',
        capturedAt: Date.now(),
        source: 'local_auth'
      };
    } else {
      // Count mode. CRITICAL: openusage treats `current_interval_usage_count`
      // as REMAINING (MiniMax "remains API" semantics). Only fields explicitly
      // named `used_count` / `current_interval_used_count` are USED.
      const usageFieldCount = LocalMinimaxService.readNumber(
        chosen.current_interval_usage_count ?? chosen.currentIntervalUsageCount
      );
      const remainingCount = LocalMinimaxService.readNumber(
        chosen.current_interval_remaining_count ??
          chosen.currentIntervalRemainingCount ??
          chosen.current_interval_remains_count ??
          chosen.currentIntervalRemainsCount ??
          chosen.current_interval_remain_count ??
          chosen.currentIntervalRemainCount ??
          chosen.remaining_count ??
          chosen.remainingCount ??
          chosen.remains_count ??
          chosen.remainsCount ??
          chosen.remaining ??
          chosen.remains ??
          chosen.left_count ??
          chosen.leftCount
      );
      const inferredRemainingCount = remainingCount !== null ? remainingCount : usageFieldCount;
      const explicitUsed = LocalMinimaxService.readNumber(
        chosen.current_interval_used_count ??
          chosen.currentIntervalUsedCount ??
          chosen.used_count ??
          chosen.used
      );

      usedCount = explicitUsed;
      if (usedCount === null) {
        if (inferredRemainingCount !== null) usedCount = total - inferredRemainingCount;
        else usedCount = 0;
      }
      if (usedCount < 0) usedCount = 0;
      if (usedCount > total) usedCount = total;

      const remaining = inferredRemainingCount !== null
        ? Math.max(0, inferredRemainingCount)
        : Math.max(0, total - usedCount);

      // CN: scale model-call counts to prompts. GLOBAL: leave as-is.
      finalUsed = Math.round(usedCount * displayMultiplier);
      finalTotal = Math.round(total * displayMultiplier);
      finalRemaining = Math.round(remaining * displayMultiplier);
      remainingPercentOut = finalTotal > 0
        ? Math.max(0, Math.min(100, (finalRemaining / finalTotal) * 100))
        : null;
    }

    // Reset time + period duration
    const startMs = LocalMinimaxService.epochToMs(chosen.start_time ?? chosen.startTime);
    const endMs = LocalMinimaxService.epochToMs(chosen.end_time ?? chosen.endTime);
    const remainsRaw = LocalMinimaxService.readNumber(chosen.remains_time ?? chosen.remainsTime);
    const nowMs = Date.now();
    const remainsMs = LocalMinimaxService.inferRemainsMs(remainsRaw, endMs, nowMs);
    const resetsAt = endMs !== null
      ? new Date(endMs).toISOString()
      : remainsMs !== null
        ? new Date(nowMs + remainsMs).toISOString()
        : null;
    const periodDurationMs = (startMs !== null && endMs !== null && endMs > startMs)
      ? endMs - startMs
      : null;

    // Plan name: explicit fields first, then inference from known tier limits.
    const explicitPlanName = LocalMinimaxService.pickFirstString([
      data.current_subscribe_title,
      data.plan_name,
      data.plan,
      data.current_plan_title,
      data.combo_title,
      payload?.current_subscribe_title,
      payload?.plan_name,
      payload?.plan,
    ]);
    const normalizedPlanName = LocalMinimaxService.normalizePlanName(explicitPlanName);
    const inferredPlanName = !isPercentMode
      ? LocalMinimaxService.inferPlanNameFromLimit(total, this.region)
      : null;
    const planName = normalizedPlanName || inferredPlanName;
    const planSuffix = this.region ? ` (${this.region})` : '';

    console.log(
      `[minimax:${this.region}] mode=${isPercentMode ? 'percent' : 'count'} ` +
      `model=${LocalMinimaxService.readString(chosen.model_name ?? chosen.modelName) || '?'} ` +
      `raw_total=${total} raw_used=${usedCount} ` +
      `→ used=${finalUsed} remaining=${finalRemaining} total=${finalTotal} (${remainingPercentOut !== null ? Math.round(remainingPercentOut) + '%' : '-'})` +
      ` plan=${planName || '?'}`
    );

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
      plan: planName ? `${planName}${planSuffix}` : 'MiniMax',
      usage: {
        used: finalUsed,
        total: finalTotal,
        remaining: finalRemaining,
        remainingPercent: remainingPercentOut,
        isPercentMode,
        resetsAt,
        periodDurationMs
      },
      meta: {
        region: this.region,
        baseUrl: this.baseUrl,
        modelRemains: remains,
        isPercentMode
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
    if (!item || typeof item !== 'object') return 0;
    const total = Number(item.current_interval_total_count || 0);
    const usage = Number(item.current_interval_usage_count || 0);
    const remaining = Number(item.current_interval_remaining_count || item.current_interval_remains_count || 0);
    const pct = Number(item.current_interval_remaining_percent || 0);
    return (total > 0 ? 1000 : 0) + (usage > 0 ? 400 : 0) + (remaining > 0 ? 200 : 0) + (pct > 0 ? 100 : 0) + total + usage + remaining;
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

  // openusage-style helpers (ported for parity with the reference implementation).
  static readString(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  static readNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }

  static pickFirstString(values) {
    for (const v of values || []) {
      const s = LocalMinimaxService.readString(v);
      if (s) return s;
    }
    return null;
  }

  static pickFirstArray(obj, keys) {
    if (!obj || typeof obj !== 'object') return null;
    for (const k of keys) {
      const v = obj[k];
      if (Array.isArray(v)) return v;
    }
    return null;
  }

  static normalizePlanName(value) {
    const raw = LocalMinimaxService.readString(value);
    if (!raw) return null;
    const compact = raw.replace(/\s+/g, ' ').trim();
    const withoutPrefix = compact.replace(/^minimax\s+coding\s+plan\b[:\-]?\s*/i, '').trim();
    if (withoutPrefix) return withoutPrefix;
    if (/coding\s+plan/i.test(compact)) return 'Coding Plan';
    return compact;
  }

  static inferPlanNameFromLimit(totalCount, region) {
    const n = LocalMinimaxService.readNumber(totalCount);
    if (n === null || n <= 0) return null;

    // CN: 600/1500/4500 model-call counts → Starter/Plus/Max.
    if (region === 'CN') {
      const CN_TIERS = { 600: 'Starter', 1500: 'Plus', 4500: 'Max' };
      return CN_TIERS[Math.round(n)] || null;
    }

    // GLOBAL: 100/300/1000/2000 prompts directly.
    const GLOBAL_TIERS = { 100: 'Starter', 300: 'Plus', 1000: 'Max', 2000: 'Ultra' };
    if (GLOBAL_TIERS[Math.round(n)]) return GLOBAL_TIERS[Math.round(n)];

    // If a non-tier number is divisible by 15, try the scaled value as prompts.
    if (n % 15 === 0) {
      const prompts = n / 15;
      return GLOBAL_TIERS[Math.round(prompts)] || null;
    }
    return null;
  }

  static epochToMs(epoch) {
    const n = LocalMinimaxService.readNumber(epoch);
    if (n === null) return null;
    // < 1e10 → seconds (epoch seconds fit in 1e10 around year 2286).
    return Math.abs(n) < 1e10 ? n * 1000 : n;
  }

  static inferRemainsMs(remainsRaw, endMs, nowMs) {
    if (remainsRaw === null || remainsRaw <= 0) return null;
    const asSecondsMs = remainsRaw * 1000;
    const asMillisecondsMs = remainsRaw;

    // If end_time exists, pick the unit that lands closer to it.
    if (endMs !== null) {
      const toEndMs = endMs - nowMs;
      if (toEndMs > 0) {
        const secDelta = Math.abs(asSecondsMs - toEndMs);
        const msDelta = Math.abs(asMillisecondsMs - toEndMs);
        return secDelta <= msDelta ? asSecondsMs : asMillisecondsMs;
      }
    }

    // Coding Plan resets every 5h ± 10min.
    const maxExpectedMs = 5 * 60 * 60 * 1000 + 10 * 60 * 1000;
    const secondsLooksValid = asSecondsMs <= maxExpectedMs;
    const millisecondsLooksValid = asMillisecondsMs <= maxExpectedMs;
    if (secondsLooksValid && !millisecondsLooksValid) return asSecondsMs;
    if (millisecondsLooksValid && !secondsLooksValid) return asMillisecondsMs;
    if (secondsLooksValid && millisecondsLooksValid) return asSecondsMs;

    const secOverflow = Math.abs(asSecondsMs - maxExpectedMs);
    const msOverflow = Math.abs(asMillisecondsMs - maxExpectedMs);
    return secOverflow <= msOverflow ? asSecondsMs : asMillisecondsMs;
  }
}

module.exports = LocalMinimaxService;
