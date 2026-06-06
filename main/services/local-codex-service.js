const fs = require('fs');
const path = require('path');
const os = require('os');

class LocalCodexService {
  getSnapshot() {
    const authPath = path.join(os.homedir(), '.codex', 'auth.json');
    if (!fs.existsSync(authPath)) {
      return null;
    }

    try {
      const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
      const token = auth && auth.tokens && auth.tokens.id_token;
      const payload = token ? this.decodeJwtPayload(token) : {};
      const authInfo = payload['https://api.openai.com/auth'] || {};
      const organizations = Array.isArray(authInfo.organizations) ? authInfo.organizations : [];
      const defaultOrg = organizations.find((item) => item.is_default) || organizations[0] || null;
      const planType = authInfo.chatgpt_plan_type || auth.auth_mode || 'unknown';
      const subscriptionUntil = authInfo.chatgpt_subscription_active_until || null;
      const hasApiKey = Boolean(auth.OPENAI_API_KEY);

      return {
        accountId: 'codex-local',
        provider: 'codex',
        label: 'Codex Local',
        balanceUsd: null,
        creditTotalUsd: null,
        creditUsedUsd: null,
        status: 'live-local',
        message: this.buildMessage(planType, hasApiKey),
        capturedAt: Date.now(),
        source: 'local_auth',
        meta: {
          authMode: auth.auth_mode || 'unknown',
          planType,
          accountId: auth.tokens && auth.tokens.account_id ? auth.tokens.account_id : null,
          organizationTitle: defaultOrg ? defaultOrg.title : null,
          organizationId: defaultOrg ? defaultOrg.id : null,
          subscriptionUntil,
          hasApiKey,
          lastRefresh: auth.last_refresh || null
        }
      };
    } catch (error) {
      return {
        accountId: 'codex-local',
        provider: 'codex',
        label: 'Codex Local',
        balanceUsd: null,
        creditTotalUsd: null,
        creditUsedUsd: null,
        status: 'error',
        message: `auth parse failed: ${error.message}`,
        capturedAt: Date.now(),
        source: 'local_auth'
      };
    }
  }

  buildMessage(planType, hasApiKey) {
    const plan = planType || 'unknown';
    if (hasApiKey) {
      return `plan ${plan} · api key linked`;
    }

    return `plan ${plan} · balance in Codex Usage Dashboard`;
  }

  decodeJwtPayload(token) {
    const parts = String(token).split('.');
    if (parts.length < 2) {
      return {};
    }

    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const normalized = payload + '='.repeat((4 - (payload.length % 4 || 4)) % 4);
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
  }
}

module.exports = LocalCodexService;
