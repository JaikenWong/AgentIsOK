const fs = require('fs');
const path = require('path');
const os = require('os');

class LocalGeminiService {
  constructor() {
    this.geminiDir = path.join(os.homedir(), '.gemini');
    this.credsPath = path.join(this.geminiDir, 'oauth_creds.json');
  }

  async fetchSnapshot() {
    if (!fs.existsSync(this.credsPath)) {
      return null;
    }

    try {
      const creds = JSON.parse(fs.readFileSync(this.credsPath, 'utf8'));
      const accessToken = creds.access_token;
      const expiryDate = creds.expiry_date;
      const isStale = expiryDate ? Date.now() > expiryDate : true;

      const todayStats = this.getTodayStats();
      const dailyLimit = this.getDailyLimit();
      const usedToday = todayStats.modelRequests;
      const remainingToday = Math.max(0, dailyLimit - usedToday);

      return {
        accountId: 'gemini-local',
        provider: 'gemini',
        label: 'Gemini',
        status: isStale ? 'stale' : 'live-local',
        capturedAt: Date.now(),
        source: 'local_auth',
        plan: dailyLimit >= 1000 ? 'Gemini Code Assist' : 'Gemini CLI',
        usage: {
          used: usedToday,
          total: dailyLimit,
          remaining: remainingToday,
          remainingPercent: dailyLimit > 0 ? (remainingToday / dailyLimit) * 100 : 0,
          todayMessages: todayStats.messageCount,
          todaySessions: todayStats.sessionCount,
          tokens: todayStats.tokens
        },
        meta: {
          expiryDate,
          isStale,
          dailyLimit,
          todayMessages: todayStats.messageCount,
          todaySessions: todayStats.sessionCount,
          modelRequests: todayStats.modelRequests,
          tokens: todayStats.tokens
        }
      };
    } catch (err) {
      return {
        accountId: 'gemini-local',
        provider: 'gemini',
        label: 'Gemini',
        status: 'error',
        message: `Gemini fetch failed: ${err.message}`,
        capturedAt: Date.now(),
        source: 'local_auth'
      };
    }
  }

  getDailyLimit() {
    // Google account (OAuth) → Gemini Code Assist Individual → 1000 req/day
    // Gemini API key (free) → 250 req/day
    // We detect OAuth by checking if oauth_creds.json has an id_token (Google account)
    // vs no id_token (API key auth wouldn't use oauth_creds.json at all)
    try {
      if (fs.existsSync(this.credsPath)) {
        const creds = JSON.parse(fs.readFileSync(this.credsPath, 'utf8'));
        if (creds.id_token) {
          return 1000; // Google account → Code Assist Individual
        }
      }
    } catch (e) {}

    // Check for API key in .env
    const envPath = path.join(this.geminiDir, '.env');
    if (fs.existsSync(envPath)) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        if (/GEMINI_API_KEY\s*=/.test(envContent)) {
          return 250; // API key free tier
        }
      } catch (e) {}
    }

    // Check environment variable
    if (process.env.GEMINI_API_KEY) {
      return 250;
    }

    // Default: assume Google account
    return 1000;
  }

  getTodayStats() {
    const tmpDir = path.join(this.geminiDir, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      return { messageCount: 0, sessionCount: 0, modelRequests: 0, tokens: { input: 0, output: 0, cached: 0 } };
    }

    let messageCount = 0;
    let sessionCount = 0;
    let modelRequests = 0;
    let totalInput = 0;
    let totalOutput = 0;
    let totalCached = 0;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    try {
      const projects = fs.readdirSync(tmpDir);
      for (const project of projects) {
        const projectPath = path.join(tmpDir, project);
        if (!fs.statSync(projectPath).isDirectory()) continue;

        const chatsPath = path.join(projectPath, 'chats');
        if (!fs.existsSync(chatsPath)) continue;

        const sessionFiles = fs.readdirSync(chatsPath).filter(f => f.endsWith('.jsonl'));
        for (const file of sessionFiles) {
          const filePath = path.join(chatsPath, file);
          const stats = this.parseSessionFile(filePath, todayStr);
          if (stats.isToday) {
            sessionCount++;
            messageCount += stats.messageCount;
            modelRequests += stats.modelRequests;
            totalInput += stats.tokens.input;
            totalOutput += stats.tokens.output;
            totalCached += stats.tokens.cached;
          }
        }
      }
    } catch (e) {
      // ignore
    }

    return {
      messageCount,
      sessionCount,
      modelRequests,
      tokens: { input: totalInput, output: totalOutput, cached: totalCached }
    };
  }

  parseSessionFile(filePath, todayStr) {
    let messageCount = 0;
    let modelRequests = 0;
    let isToday = false;
    let input = 0;
    let output = 0;
    let cached = 0;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const timestamp = entry.timestamp || entry.ts;
          if (timestamp) {
            const localDate = new Date(timestamp).toLocaleDateString('en-CA'); // YYYY-MM-DD
            if (localDate === todayStr) {
              isToday = true;
            }
          }

          if (entry.type === 'user') {
            const content = entry.content;
            const hasText = Array.isArray(content) && content.some(c => c.text && !c.text.startsWith('<function_response'));
            if (hasText) {
              messageCount++;
            }
          }

          // Each 'gemini' type response = one model API call
          if (entry.type === 'gemini') {
            modelRequests++;
          }

          // Also count from $set blocks (batched message updates)
          if (entry.$set && Array.isArray(entry.$set.messages)) {
            for (const msg of entry.$set.messages) {
              if (msg.type === 'gemini') modelRequests++;
            }
          }

          if (entry.tokens) {
            input += Number(entry.tokens.input || 0);
            output += Number(entry.tokens.output || 0);
            cached += Number(entry.tokens.cached || 0);
          }
        } catch (e) {}
      }
    } catch (e) {}

    return { isToday, messageCount, modelRequests, tokens: { input, output, cached } };
  }

  // Remove old countMessagesInFile as it's merged into parseSessionFile
}

module.exports = LocalGeminiService;
