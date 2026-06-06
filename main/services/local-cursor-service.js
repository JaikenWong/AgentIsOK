const fs = require('fs');
const path = require('path');
const os = require('os');

class LocalCursorService {
  constructor() {
    this.dbPath = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Cursor',
      'User',
      'globalStorage',
      'state.vscdb'
    );
    this.authPath = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Cursor',
      'User',
      'globalStorage',
      'cursorAuth'
    );
  }

  async fetchSnapshot() {
    const token = this.readToken();
    if (!token) {
      return null;
    }

    try {
      const usage = await this.fetchUsage(token);
      const plan = await this.fetchPlan(token);
      return this.buildSnapshot(usage, plan);
    } catch (err) {
      return {
        accountId: 'cursor-local',
        provider: 'cursor',
        label: 'Cursor',
        status: 'error',
        message: `Cursor fetch failed: ${err.message}`,
        capturedAt: Date.now(),
        source: 'local_auth'
      };
    }
  }

  readToken() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const { execSync } = require('child_process');
        const result = execSync(
          `sqlite3 "${this.dbPath}" "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'"`,
          { encoding: 'utf8', timeout: 5000 }
        ).trim();
        if (result) return result;
      }
    } catch (e) {}

    try {
      const { execSync } = require('child_process');
      const result = execSync(
        'security find-generic-password -s cursor-access-token -w 2>/dev/null',
        { encoding: 'utf8', timeout: 5000 }
      ).trim();
      if (result) return result;
    } catch (e) {}

    return null;
  }

  async fetchUsage(token) {
    const res = await fetch('https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1'
      },
      body: '{}'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async fetchPlan(token) {
    const res = await fetch('https://api2.cursor.sh/aiserver.v1.DashboardService/GetPlanInfo', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1'
      },
      body: '{}'
    });
    if (!res.ok) return null;
    return res.json();
  }

  buildSnapshot(usage, plan) {
    const planInfo = plan?.planInfo;
    const planUsage = usage?.planUsage || {};
    const spendLimit = usage?.spendLimitUsage || {};

    const limit = Number(planUsage.limit || 0);
    const included = Number(planUsage.includedSpend || 0);
    const totalPercent = Number(planUsage.totalPercentUsed || 0);
    const autoPercent = Number(planUsage.autoPercentUsed || 0);
    const apiPercent = Number(planUsage.apiPercentUsed || 0);

    const includedDollars = limit > 0 ? included / 100 : null;
    const limitDollars = limit > 0 ? limit / 100 : null;
    const remainingDollars = limit > 0 ? Number(planUsage.remaining || 0) / 100 : null;

    return {
      accountId: 'cursor-local',
      provider: 'cursor',
      label: 'Cursor',
      balanceUsd: remainingDollars,
      creditTotalUsd: limitDollars,
      creditUsedUsd: includedDollars,
      status: 'live-local',
      capturedAt: Date.now(),
      source: 'local_auth',
      plan: planInfo?.planName || 'Cursor',
      usage: {
        totalPercent,
        autoPercent,
        apiPercent,
        spendLimit
      },
      meta: {
        planName: planInfo?.planName,
        price: planInfo?.price,
        billingCycleEnd: planInfo?.billingCycleEnd
      }
    };
  }
}

module.exports = LocalCursorService;
