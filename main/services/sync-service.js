const ProviderRegistry = require('../providers/registry');
const defaultsConfig = require('../../config/defaults.json');

class SyncService {
  constructor(usageStore) {
    this.usageStore = usageStore;
    this.registry = new ProviderRegistry();
    this.defaultsConfig = defaultsConfig;
  }

  async syncAllAccounts() {
    const accounts = this.registry.getVisibleAccounts();

    for (const account of accounts) {
      const adapter = this.registry.createAdapter(account);
      if (!adapter) {
        continue;
      }

      try {
        console.log(`Syncing account: ${account.id} (${account.provider})`);
        const balance = await adapter.fetchBalance();
        if (balance) {
          console.log(`Successfully fetched balance for ${account.id}: ${balance.plan || balance.status}`);
          this.usageStore.saveBalanceSnapshot(balance);
        }

        const usageEvents = await adapter.fetchDailyCosts();
        if (usageEvents && usageEvents.length) {
          this.usageStore.replaceProviderDailyCosts(account.id, usageEvents);
        }
      } catch (error) {
        console.error(`Failed to sync account ${account.id}:`, error);
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
