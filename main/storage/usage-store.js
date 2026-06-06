const ElectronStore = require('electron-store');
const ForecastService = require('../services/forecast-service');

const Store = ElectronStore.default || ElectronStore;

class UsageStore {
  constructor() {
    this.store = new Store({
      name: 'thatisok'
    });
    this.usageEvents = this.store.get('usage_events', []);
    this.balanceSnapshots = this.store.get('balance_snapshots', []);
  }

  recordUsageEvent(event) {
    const entry = {
      id: event.id || `evt_${Date.now()}`,
      timestamp: event.timestamp || Date.now(),
      source: event.source || 'local_hook',
      provider: event.provider || 'unknown',
      accountId: event.accountId || 'default',
      project: event.project || 'default',
      model: event.model || 'unknown',
      inputTokens: Number(event.inputTokens || 0),
      outputTokens: Number(event.outputTokens || 0),
      cachedTokens: Number(event.cachedTokens || 0),
      costUsd: Number(event.costUsd || 0)
    };

    this.usageEvents.push(entry);
    this.store.set('usage_events', this.usageEvents);
    return entry;
  }

  replaceProviderDailyCosts(accountId, events) {
    this.usageEvents = this.usageEvents.filter(
      (item) => !(item.accountId === accountId && item.source === 'provider_api_daily')
    );

    const normalized = events.map((event) => ({
      id: event.id || `evt_${Date.now()}`,
      timestamp: event.timestamp || Date.now(),
      source: event.source || 'provider_api_daily',
      provider: event.provider || 'unknown',
      accountId: event.accountId || accountId,
      project: event.project || 'provider-sync',
      model: event.model || 'all',
      inputTokens: Number(event.inputTokens || 0),
      outputTokens: Number(event.outputTokens || 0),
      cachedTokens: Number(event.cachedTokens || 0),
      costUsd: Number(event.costUsd || 0)
    }));

    this.usageEvents.push(...normalized);
    this.store.set('usage_events', this.usageEvents);
    return normalized;
  }

  saveBalanceSnapshot(snapshot) {
    const entry = {
      ...snapshot,
      capturedAt: snapshot.capturedAt || Date.now()
    };

    this.balanceSnapshots = this.balanceSnapshots.filter(
      (item) => item.accountId !== entry.accountId
    );
    this.balanceSnapshots.push(entry);
    this.store.set('balance_snapshots', this.balanceSnapshots);
    return entry;
  }

  getLatestBalances() {
    return [...this.balanceSnapshots].sort((a, b) => b.capturedAt - a.capturedAt);
  }

  getRecentUsageEvents(limit = 20) {
    return [...this.usageEvents]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  getCanonicalCostEvents() {
    const providerBackedAccounts = new Set(
      this.usageEvents
        .filter((item) => item.source === 'provider_api_daily')
        .map((item) => item.accountId)
    );

    return this.usageEvents.filter((item) => {
      if (item.source === 'provider_api_daily') {
        return true;
      }

      return !providerBackedAccounts.has(item.accountId);
    });
  }

  getDailySeries(days = 7) {
    const costEvents = this.getCanonicalCostEvents();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const buckets = new Map();
    for (let index = 0; index < days; index += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const key = day.toISOString().slice(0, 10);
      buckets.set(key, 0);
    }

    for (const event of costEvents) {
      const key = new Date(event.timestamp).toISOString().slice(0, 10);
      if (buckets.has(key)) {
        buckets.set(key, buckets.get(key) + Number(event.costUsd || 0));
      }
    }

    return Array.from(buckets.entries()).map(([date, costUsd]) => ({ date, costUsd }));
  }

  getOverview() {
    const costEvents = this.getCanonicalCostEvents();
    const balances = this.getLatestBalances();
    const totalBalanceUsd = balances.reduce((sum, item) => sum + (Number(item.balanceUsd) || 0), 0);

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const todayCostUsd = costEvents
      .filter((item) => item.timestamp >= todayStart.getTime())
      .reduce((sum, item) => sum + Number(item.costUsd || 0), 0);

    const monthCostUsd = costEvents
      .filter((item) => item.timestamp >= monthStart.getTime())
      .reduce((sum, item) => sum + Number(item.costUsd || 0), 0);

    const runwayDays = ForecastService.calculateRunwayDays(totalBalanceUsd, this.getDailySeries(7));

    return {
      totalBalanceUsd,
      todayCostUsd,
      monthCostUsd,
      runwayDays,
      runwayDaysLabel: runwayDays ? `${Math.floor(runwayDays)} days` : '--'
    };
  }

  getDashboardData() {
    return {
      overview: this.getOverview(),
      accounts: this.getLatestBalances(),
      dailySeries: this.getDailySeries(7),
      recentEvents: this.getRecentUsageEvents(20)
    };
  }
}

module.exports = UsageStore;
