const LocalDeepSeekService = require('../services/local-deepseek-service');

class LocalDeepSeekProvider {
  constructor(account) {
    this.account = account;
    this.service = new LocalDeepSeekService();
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
    const currency = usage.currency || 'CNY';
    const total = Number(usage.totalBalance);
    const granted = Number(usage.grantedBalance);
    const toppedUp = Number(usage.toppedUpBalance);

    if (Number.isFinite(total)) {
      lines.push({
        type: 'text',
        label: 'Balance',
        value: this.formatMoney(total, currency),
        subtitle: usage.isAvailable === false ? 'not available' : 'available'
      });
    }

    if (Number.isFinite(granted) || Number.isFinite(toppedUp)) {
      lines.push({
        type: 'text',
        label: 'Split',
        value: [
          Number.isFinite(granted) ? `grant ${this.formatMoney(granted, currency)}` : null,
          Number.isFinite(toppedUp) ? `topup ${this.formatMoney(toppedUp, currency)}` : null
        ].filter(Boolean).join(' · '),
        subtitle: 'DeepSeek API balance'
      });
    }

    return lines;
  }

  formatMoney(value, currency) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return '--';
    }
    const symbol = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : `${currency} `;
    return `${symbol}${numeric.toFixed(2)}`;
  }
}

module.exports = LocalDeepSeekProvider;
