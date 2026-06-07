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
      const balance = await this.withTimeout(adapter.fetchBalance(), 15000, `${account.id} balance timeout`);
      if (balance) {
        if (balance.status === 'error') {
          console.warn(`Balance fetch returned error for ${account.id}: ${balance.message || 'unknown'}`);
        } else {
          console.log(`Successfully fetched balance for ${account.id}: ${balance.plan || balance.status}`);
        }
        this.usageStore.saveBalanceSnapshot(balance);
      }

      const usageEvents = await this.withTimeout(adapter.fetchDailyCosts(), 15000, `${account.id} usage timeout`);
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
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
}

module.exports = SyncService;
