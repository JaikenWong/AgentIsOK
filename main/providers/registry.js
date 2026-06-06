const providerConfig = require('../../config/providers.json');
const defaultsConfig = require('../../config/defaults.json');
const fs = require('fs');
const path = require('path');
const LocalCodexProvider = require('./local-codex');
const LocalClaudeProvider = require('./local-claude');
const LocalCursorProvider = require('./local-cursor');
const LocalMinimaxProvider = require('./local-minimax');

const PROVIDER_MAP = {
  codex: LocalCodexProvider,
  claude: LocalClaudeProvider,
  cursor: LocalCursorProvider,
  minimax: LocalMinimaxProvider
};

const DEFAULTS_PATH = path.join(__dirname, '..', '..', 'config', 'defaults.json');

class ProviderRegistry {
  constructor() {
    this.providerConfig = providerConfig;
    this.defaultsConfig = defaultsConfig;
  }

  getAccounts() {
    return this.providerConfig.accounts || [];
  }

  getVisibleAccounts() {
    const providers = this.defaultsConfig.providers || {};
    return this.getAccounts().filter((account) => {
      const setting = providers[account.provider];
      return setting ? setting.visible !== false : true;
    });
  }

  getProviderVisibility() {
    const providers = this.defaultsConfig.providers || {};
    const result = {};

    for (const account of this.getAccounts()) {
      const setting = providers[account.provider];
      result[account.provider] = {
        visible: setting ? setting.visible !== false : true,
        label: setting?.label || account.label || account.provider
      };
    }

    return result;
  }

  setProviderVisibility(provider, visible) {
    if (!this.defaultsConfig.providers) {
      this.defaultsConfig.providers = {};
    }
    if (!this.defaultsConfig.providers[provider]) {
      this.defaultsConfig.providers[provider] = { label: provider };
    }
    this.defaultsConfig.providers[provider].visible = visible;

    try {
      fs.writeFileSync(DEFAULTS_PATH, JSON.stringify(this.defaultsConfig, null, 2));
    } catch (err) {
      console.error('Failed to persist provider visibility:', err);
    }
  }

  createAdapter(account) {
    const ProviderClass = PROVIDER_MAP[account.provider];
    if (!ProviderClass) {
      return null;
    }

    return new ProviderClass(account, this.defaultsConfig);
  }
}

module.exports = ProviderRegistry;
