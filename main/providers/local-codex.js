const LocalCodexService = require('../services/local-codex-service');

class LocalCodexProvider {
  constructor(account) {
    this.account = account;
    this.service = new LocalCodexService();
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

module.exports = LocalCodexProvider;
