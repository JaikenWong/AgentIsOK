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
    await Promise.allSettled(accounts.map((account) => this.syncAccount(account)));
  }

  async syncAccount(account) {
    const adapter = this.registry.createAdapter(account);
    if (!adapter) {
      return;
    }

    try {
      console.log(`Syncing account: ${account.id} (${account.provider})`);
      const balance = await this.withTimeout(adapter.fetchBalance(), 6000, `${account.id} balance timeout`);
      if (balance) {
        console.log(`Successfully fetched balance for ${account.id}: ${balance.plan || balance.status}`);
        this.usageStore.saveBalanceSnapshot(balance);
      }

      const usageEvents = await this.withTimeout(adapter.fetchDailyCosts(), 6000, `${account.id} usage timeout`);
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

  withTimeout(promise, timeoutMs, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  }
}

module.exports = SyncService;
