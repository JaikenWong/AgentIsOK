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

    lines.push({
      type: 'text',
      label: 'Today',
      value: `${usage.todayMessages || 0} messages`,
      subtitle: `${usage.todaySessions || 0} sessions`
    });

    return lines;
  }
}

module.exports = LocalGeminiProvider;
