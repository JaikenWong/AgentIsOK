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

      // Gemini CLI doesn't have a simple usage API like Codex yet,
      // but we can show session stats from temporary directory
      const todayStats = this.getTodayStats();

      return {
        accountId: 'gemini-local',
        provider: 'gemini',
        label: 'Gemini',
        status: isStale ? 'stale' : 'live-local',
        capturedAt: Date.now(),
        source: 'local_auth',
        plan: 'Gemini CLI',
        usage: {
          todayMessages: todayStats.messageCount,
          todaySessions: todayStats.sessionCount,
          tokens: todayStats.tokens
        },
        meta: {
          expiryDate,
          isStale,
          todayMessages: todayStats.messageCount,
          todaySessions: todayStats.sessionCount,
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

  getTodayStats() {
    const tmpDir = path.join(this.geminiDir, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      return { messageCount: 0, sessionCount: 0, tokens: { input: 0, output: 0, cached: 0 } };
    }

    let messageCount = 0;
    let sessionCount = 0;
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
      tokens: { input: totalInput, output: totalOutput, cached: totalCached }
    };
  }

  parseSessionFile(filePath, todayStr) {
    let messageCount = 0;
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

          if (entry.type === 'user' || entry.type === 'gemini') {
            messageCount++;
          }

          if (entry.tokens) {
            input += Number(entry.tokens.input || 0);
            output += Number(entry.tokens.output || 0);
            cached += Number(entry.tokens.cached || 0);
          }
        } catch (e) {}
      }
    } catch (e) {}

    return { isToday, messageCount, tokens: { input, output, cached } };
  }

  // Remove old countMessagesInFile as it's merged into parseSessionFile
}

module.exports = LocalGeminiService;
