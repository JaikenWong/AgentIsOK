const ProviderRegistry = require('../providers/registry');
const defaultsConfig = require('../../config/defaults.json');

class SyncService {
  constructor(usageStore) {
    this.usageStore = usageStore;
    this.registry = new ProviderRegistry();
    this.defaultsConfig = defaultsConfig;
  }

  async syncAllAccounts() {
    const accounts = this.registry.getAccounts();

    for (const account of accounts) {
      const adapter = this.registry.createAdapter(account);
      if (!adapter) {
        continue;
      }

      try {
        const balance = await adapter.fetchBalance();
        if (balance) {
          this.usageStore.saveBalanceSnapshot(balance);
        }

        const usageEvents = await adapter.fetchDailyCosts();
        if (usageEvents && usageEvents.length) {
          this.usageStore.replaceProviderDailyCosts(account.id, usageEvents);
        }
      } catch (error) {
        this.usageStore.saveBalanceSnapshot({
          accountId: account.id,
          provider: account.provider,
          label: account.label,
          balanceUsd: null,
          creditUsedUsd: null,
          creditTotalUsd: null,
          status: 'error',
          message: error.message,
          capturedAt: Date.now(),
          source: 'provider_api'
        });
      }
    }
  }
}

module.exports = SyncService;
