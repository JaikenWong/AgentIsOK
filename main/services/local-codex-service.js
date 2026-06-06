const fs = require('fs');
const path = require('path');
const os = require('os');

class LocalCodexService {
  async fetchSnapshot() {
    const authPath = path.join(os.homedir(), '.codex', 'auth.json');
    if (!fs.existsSync(authPath)) {
      return null;
    }

    try {
      const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
      let accessToken = auth && auth.tokens && auth.tokens.access_token;
      const accountId = auth && auth.tokens && auth.tokens.account_id;
      const isStale = this.isStale(auth.last_refresh);

      let usageData = null;
      let refreshSuccess = false;
      if (accessToken) {
        try {
          usageData = await this.fetchUsageApi(accessToken, accountId);
        } catch (error) {
          const status = error.response?.status || error.status;
          if (status === 401 || error.message.includes('expired')) {
            const refreshedToken = await this.refreshToken(auth, authPath);
            if (refreshedToken) {
              accessToken = refreshedToken;
              usageData = await this.fetchUsageApi(accessToken, accountId);
              refreshSuccess = true;
            }
          }
        }
      }

      const idToken = auth && auth.tokens && auth.tokens.id_token;
      const payload = idToken ? this.decodeJwtPayload(idToken) : {};
      const authInfo = payload['https://api.openai.com/auth'] || {};
      
      const planType = (usageData && usageData.plan_type) || authInfo.chatgpt_plan_type || auth.auth_mode || 'unknown';
      const subscriptionUntil = authInfo.chatgpt_subscription_active_until || null;
      const hasApiKey = Boolean(auth.OPENAI_API_KEY);
      const displayPlan = this.getDisplayPlan(planType, hasApiKey, subscriptionUntil);

      const effectiveStale = isStale && !usageData && !refreshSuccess;

      return {
        accountId: 'codex-local',
        provider: 'codex',
        label: 'Codex Local',
        balanceUsd: null,
        creditTotalUsd: null,
        creditUsedUsd: null,
        status: effectiveStale ? 'stale' : 'live-local',
        message: this.buildMessage(planType, hasApiKey, effectiveStale, usageData),
        capturedAt: Date.now(),
        source: 'local_auth',
        plan: effectiveStale ? 'Codex auth stale' : displayPlan,
        usage: usageData,
        meta: {
          authMode: auth.auth_mode || 'unknown',
          planType,
          displayPlan,
          accountId: effectiveStale ? null : this.maskAccountId(accountId),
          subscriptionUntil,
          hasApiKey,
          lastRefresh: auth.last_refresh || null,
          isStale: effectiveStale
        }
      };
    } catch (error) {
      return {
        accountId: 'codex-local',
        provider: 'codex',
        label: 'Codex Local',
        status: 'error',
        message: `Codex fetch failed: ${error.message}`,
        capturedAt: Date.now(),
        source: 'local_auth'
      };
    }
  }

  async fetchUsageApi(accessToken, accountId) {
    const url = 'https://chatgpt.com/backend-api/wham/usage';
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'User-Agent': 'ThatIsOk'
    };
    if (accountId) {
      headers['ChatGPT-Account-Id'] = accountId;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  }

  async refreshToken(auth, authPath) {
    const refreshToken = auth && auth.tokens && auth.tokens.refresh_token;
    if (!refreshToken) return null;

    const url = 'https://auth.openai.com/oauth/token';
    const clientId = 'app_EMoamEEZ73f0CkXaXp7hrann';
    
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (data.access_token) {
        auth.tokens.access_token = data.access_token;
        if (data.refresh_token) auth.tokens.refresh_token = data.refresh_token;
        if (data.id_token) auth.tokens.id_token = data.id_token;
        auth.last_refresh = new Date().toISOString();

        fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
        return data.access_token;
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  buildMessage(planType, hasApiKey, isStale, usageData) {
    const plan = this.formatPlan(planType);
    if (hasApiKey) {
      return `plan ${plan} · api key linked`;
    }

    if (usageData && usageData.credits && usageData.credits.balance !== undefined) {
      return `plan ${plan} · ${usageData.credits.balance} credits`;
    }

    if (isStale) {
      return `cached login · verify in Codex dashboard`;
    }

    return `plan ${plan} · balance in Codex Usage Dashboard`;
  }

  formatPlan(planType) {
    if (!planType) return 'unknown';
    const raw = planType.toLowerCase();
    if (raw === 'prolite') return 'Pro 5x';
    if (raw === 'pro') return 'Pro 20x';
    if (raw === 'plus') return 'Plus';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  maskAccountId(value) {
    if (!value) {
      return null;
    }

    const text = String(value);
    return text.length > 10 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text;
  }

  getDisplayPlan(planType, hasApiKey, subscriptionUntil) {
    if (hasApiKey) {
      return 'API key';
    }

    const formattedPlan = this.formatPlan(planType);

    if (subscriptionUntil) {
      return `${formattedPlan} plan`;
    }

    if (planType && planType !== 'free' && planType !== 'unknown') {
      return `${formattedPlan} plan`;
    }

    return 'ChatGPT login';
  }

  isStale(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
      return true;
    }

    return Date.now() - date.getTime() > 7 * 24 * 60 * 60 * 1000;
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
