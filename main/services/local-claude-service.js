const fs = require('fs');
const path = require('path');
const os = require('os');

class LocalClaudeService {
  getSnapshot() {
    const stats = this.readJson(path.join(os.homedir(), '.claude', 'stats-cache.json'));
    const credentials = this.readJson(path.join(os.homedir(), '.claude', '.credentials.json'));
    const telemetryMeta = this.readTelemetryMeta();

    if (!stats && !credentials && !telemetryMeta) {
      return null;
    }

    const today = this.getTodayStats(stats);
    const planType = telemetryMeta.subscriptionType || 'unknown';
    const modelSummary = this.getRecentModelSummary(stats);

    return {
      accountId: 'claude-local',
      provider: 'claude',
      label: 'Claude Local',
      balanceUsd: null,
      creditTotalUsd: null,
      creditUsedUsd: null,
      status: 'live-local',
      message: this.buildMessage(planType),
      capturedAt: Date.now(),
      source: 'local_auth',
      plan: `${planType} plan`,
      lines: this.buildLines({ today, modelSummary }),
      meta: {
        authMode: credentials && credentials.claudeAiOauth ? 'claude_oauth' : 'unknown',
        planType,
        model: telemetryMeta.model || null,
        todayMessages: today.messageCount,
        todaySessions: today.sessionCount,
        todayTools: today.toolCallCount,
        todayTokens: modelSummary.todayTokens,
        topModel: modelSummary.topModel,
        hasOauth: Boolean(credentials && credentials.claudeAiOauth)
      }
    };
  }

  buildLines({ today, modelSummary }) {
    return [
      {
        type: 'text',
        label: 'Today',
        value: `${this.formatCompactNumber(today.messageCount)} msg`,
        subtitle: `${this.formatCompactNumber(today.toolCallCount)} tools · ${this.formatCompactNumber(today.sessionCount)} sess`
      },
      {
        type: 'text',
        label: 'Tokens',
        value: this.formatCompactNumber(modelSummary.todayTokens),
        subtitle: modelSummary.topModel ? `top ${modelSummary.topModel}` : 'Local stats'
      }
    ];
  }

  buildMessage(planType) {
    return `plan ${planType} · local usage stats`;
  }

  readTelemetryMeta() {
    const telemetryDir = path.join(os.homedir(), '.claude', 'telemetry');
    if (!fs.existsSync(telemetryDir)) {
      return {};
    }

    const files = fs.readdirSync(telemetryDir)
      .map((name) => path.join(telemetryDir, name))
      .filter((file) => fs.statSync(file).isFile())
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
      .slice(0, 8);

    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).reverse();
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const parsed = this.parseTelemetryMetadata(entry?.event_data?.additional_metadata);
          if (parsed.subscription_type || parsed.billingType) {
            return {
              subscriptionType: parsed.subscription_type || parsed.billingType || 'unknown',
              model: entry?.event_data?.model || null
            };
          }
        } catch (error) {
          continue;
        }
      }
    }

    return {};
  }

  parseTelemetryMetadata(encoded) {
    if (!encoded) {
      return {};
    }

    try {
      return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    } catch (error) {
      return {};
    }
  }

  getTodayStats(stats) {
    const todayKey = new Date().toISOString().slice(0, 10);
    const daily = stats && Array.isArray(stats.dailyActivity) ? stats.dailyActivity : [];
    return daily.find((item) => item.date === todayKey) || {
      date: todayKey,
      messageCount: 0,
      sessionCount: 0,
      toolCallCount: 0
    };
  }

  getRecentModelSummary(stats) {
    const todayKey = new Date().toISOString().slice(0, 10);
    const tokensSeries = stats && Array.isArray(stats.dailyModelTokens) ? stats.dailyModelTokens : [];
    const todayEntry = tokensSeries.find((item) => item.date === todayKey) || null;
    const tokensByModel = todayEntry && todayEntry.tokensByModel ? todayEntry.tokensByModel : {};
    const entries = Object.entries(tokensByModel)
      .map(([k, v]) => [k, Number(v) || 0])
      .sort((a, b) => b[1] - a[1]);

    return {
      todayTokens: entries.reduce((sum, [, v]) => sum + v, 0),
      topModel: entries.length ? entries[0][0] : null
    };
  }

  readJson(file) {
    try {
      if (!fs.existsSync(file)) {
        return null;
      }
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      return null;
    }
  }

  formatCompactNumber(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
      return '--';
    }

    if (numeric >= 1000000) {
      return `${(numeric / 1000000).toFixed(1)}M`;
    }
    if (numeric >= 1000) {
      return `${(numeric / 1000).toFixed(1)}k`;
    }
    return String(Math.round(numeric));
  }
}

module.exports = LocalClaudeService;
