const providerConfig = require('../../config/providers.json');
const defaultsConfig = require('../../config/defaults.json');
const OpenAIProvider = require('./openai');
const AnthropicProvider = require('./anthropic');
const LocalCodexProvider = require('./local-codex');
const LocalClaudeProvider = require('./local-claude');

const PROVIDER_MAP = {
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
  codex: LocalCodexProvider,
  claude: LocalClaudeProvider
};

class ProviderRegistry {
  constructor() {
    this.providerConfig = providerConfig;
    this.defaultsConfig = defaultsConfig;
  }

  getAccounts() {
    return this.providerConfig.accounts || [];
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
