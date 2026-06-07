const LocalGeminiService = require('../services/local-gemini-service');

class LocalGeminiProvider {
  constructor(account) {
    this.account = account;
    this.service = new LocalGeminiService();
  }

  async fetchBalance() {
    const snapshot = await this.service.fetchSnapshot();
    if (!snapshot) {
      return null;
    }

    return {
      ...snapshot,
      accountId: this.account.id,
      provider: this.account.provider,
      label: this.account.label,
      lines: this.buildLines(snapshot)
    };
  }

  async fetchDailyCosts() {
    return [];
  }

  buildLines(snapshot) {
    const lines = [];
    const usage = snapshot.usage || {};
    const tokens = usage.tokens || { input: 0, output: 0, cached: 0 };

    lines.push({
      type: 'text',
      label: 'Today',
      value: `${usage.todayMessages || 0} msg`,
      subtitle: `${usage.todaySessions || 0} sessions`
    });

    if (tokens.input > 0 || tokens.output > 0) {
      lines.push({
        type: 'text',
        label: 'Tokens',
        value: this.formatCompactNumber(tokens.input + tokens.output),
        subtitle: `in ${this.formatCompactNumber(tokens.input)} · out ${this.formatCompactNumber(tokens.output)}`
      });
    }

    return lines;
  }

  formatCompactNumber(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return '--';
    if (numeric >= 1000000) return `${(numeric / 1000000).toFixed(1)}M`;
    if (numeric >= 1000) return `${(numeric / 1000).toFixed(1)}k`;
    return String(Math.round(numeric));
  }
}

module.exports = LocalGeminiProvider;
