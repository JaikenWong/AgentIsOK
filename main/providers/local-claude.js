const LocalClaudeService = require('../services/local-claude-service');

class LocalClaudeProvider {
  constructor(account) {
    this.account = account;
    this.service = new LocalClaudeService();
  }

  async fetchBalance() {
    const snapshot = this.service.getSnapshot();
    if (!snapshot) {
      return null;
    }

    return {
      ...snapshot,
      accountId: this.account.id,
      provider: this.account.provider,
      label: this.account.label
    };
  }

  async fetchDailyCosts() {
    return [];
  }
}

module.exports = LocalClaudeProvider;
