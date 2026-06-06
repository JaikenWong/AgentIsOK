const fs = require('fs');
const path = require('path');
const os = require('os');

class LocalClaudeService {
  constructor() {
    this.cacheDir = path.join(os.homedir(), '.claude');
    this.projectsDir = path.join(this.cacheDir, 'projects');
    this.statsPath = path.join(this.cacheDir, 'stats-cache.json');
    this.credentialsPath = path.join(this.cacheDir, '.credentials.json');
  }

  getSnapshot() {
    const stats = this.readJson(this.statsPath);
    const credentials = this.readJson(this.credentialsPath);
    const telemetryMeta = this.readTelemetryMeta();
    const recentSessions = this.getRecentSessions();

    if (!stats && !credentials && !telemetryMeta) {
      return null;
    }

    const today = this.getTodayStats(stats);
    const planType = telemetryMeta.subscriptionType || 'unknown';
    const modelSummary = this.getRecentModelSummary(stats);
    const tokenUsage = this.getTokenUsageFromTranscripts();

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
      lines: this.buildLines({ today, modelSummary, tokenUsage }),
      meta: {
        authMode: credentials && credentials.claudeAiOauth ? 'claude_oauth' : 'unknown',
        planType,
        model: telemetryMeta.model || null,
        todayMessages: today.messageCount,
        todaySessions: today.sessionCount,
        todayTools: today.toolCallCount,
        todayTokens: modelSummary.todayTokens,
        topModel: modelSummary.topModel,
        hasOauth: Boolean(credentials && credentials.claudeAiOauth),
        recentSessions
      }
    };
  }

  getRecentSessions() {
    if (!fs.existsSync(this.projectsDir)) {
      return [];
    }

    const sessions = [];
    try {
      const projectDirs = fs.readdirSync(this.projectsDir).slice(0, 5);

      for (const dir of projectDirs) {
        const projectPath = path.join(this.projectsDir, dir);
        if (!fs.statSync(projectPath).isDirectory()) {
          continue;
        }

        const jsonlFiles = fs.readdirSync(projectPath)
          .filter((f) => f.endsWith('.jsonl'))
          .map((f) => ({
            name: f,
            mtime: fs.statSync(path.join(projectPath, f)).mtimeMs
          }))
          .sort((a, b) => b.mtime - a.mtime)
          .slice(0, 2);

        for (const file of jsonlFiles) {
          const filePath = path.join(projectPath, file.name);
          const session = this.parseSessionFile(filePath);
          if (session) {
            sessions.push(session);
          }
        }
      }
    } catch (err) {
      // ignore errors
    }

    return sessions.slice(0, 5);
  }

  parseSessionFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      let sessionStart = null;
      let lastEvent = null;
      let messageCount = 0;
      let toolCallCount = 0;

      for (const line of lines.slice(-50)) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'session_start' || entry.event === 'session_start') {
            sessionStart = entry.timestamp || entry.ts;
          }
          if (entry.type === 'message' || entry.role === 'assistant') {
            messageCount++;
          }
          if (entry.type === 'tool_use' || entry.tool) {
            toolCallCount++;
          }
          lastEvent = entry;
        } catch (e) {
          // skip invalid lines
        }
      }

      return {
        file: path.basename(filePath),
        sessionStart,
        lastEvent: lastEvent?.timestamp || lastEvent?.ts || null,
        messageCount,
        toolCallCount
      };
    } catch (err) {
      return null;
    }
  }

  getTokenUsageFromTranscripts() {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCached = 0;

    if (!fs.existsSync(this.projectsDir)) {
      return { totalInput, totalOutput, totalCached };
    }

    try {
      const projectDirs = fs.readdirSync(this.projectsDir).slice(0, 10);

      for (const dir of projectDirs) {
        const projectPath = path.join(this.projectsDir, dir);
        if (!fs.statSync(projectPath).isDirectory()) {
          continue;
        }

        const jsonlFiles = fs.readdirSync(projectPath)
          .filter((f) => f.endsWith('.jsonl'))
          .slice(0, 5);

        for (const file of jsonlFiles) {
          const filePath = path.join(projectPath, file);
          const tokens = this.extractTokensFromFile(filePath);
          totalInput += tokens.input;
          totalOutput += tokens.output;
          totalCached += tokens.cached;
        }
      }
    } catch (err) {
      // ignore errors
    }

    return { totalInput, totalOutput, totalCached };
  }

  extractTokensFromFile(filePath) {
    let input = 0;
    let output = 0;
    let cached = 0;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const usage = entry.usage || entry.token_usage || entry.tokens;
          if (usage) {
            input += Number(usage.input_tokens || usage.input || 0);
            output += Number(usage.output_tokens || usage.output || 0);
            cached += Number(usage.cache_creation_input_tokens || usage.cached_tokens || 0);
          }
        } catch (e) {
          // skip invalid lines
        }
      }
    } catch (err) {
      // ignore errors
    }

    return { input, output, cached };
  }

  buildLines({ today, modelSummary, tokenUsage }) {
    const lines = [
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

    if (tokenUsage.totalInput > 0 || tokenUsage.totalOutput > 0) {
      lines.push({
        type: 'text',
        label: 'Total',
        value: `${this.formatCompactNumber(tokenUsage.totalInput + tokenUsage.totalOutput)}`,
        subtitle: `in ${this.formatCompactNumber(tokenUsage.totalInput)} · out ${this.formatCompactNumber(tokenUsage.totalOutput)}`
      });
    }

    return lines;
  }

  buildMessage(planType) {
    return `plan ${planType} · local usage stats`;
  }

  readTelemetryMeta() {
    const telemetryDir = path.join(this.cacheDir, 'telemetry');
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
