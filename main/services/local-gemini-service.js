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
          todaySessions: todayStats.sessionCount
        },
        meta: {
          expiryDate,
          isStale,
          todayMessages: todayStats.messageCount,
          todaySessions: todayStats.sessionCount
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
      return { messageCount: 0, sessionCount: 0 };
    }

    let messageCount = 0;
    let sessionCount = 0;
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    try {
      const projects = fs.readdirSync(tmpDir);
      for (const project of projects) {
        const projectPath = path.join(tmpDir, project);
        if (!fs.statSync(projectPath).isDirectory()) continue;

        const chatsPath = path.join(projectPath, 'chats');
        if (!fs.existsSync(chatsPath)) continue;

        const sessionFiles = fs.readdirSync(chatsPath).filter(f => f.endsWith('.jsonl'));
        for (const file of sessionFiles) {
          if (file.includes(todayStr)) {
            sessionCount++;
            const filePath = path.join(chatsPath, file);
            messageCount += this.countMessagesInFile(filePath);
          }
        }
      }
    } catch (e) {
      // ignore
    }

    return { messageCount, sessionCount };
  }

  countMessagesInFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      let count = 0;
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'user' || entry.type === 'gemini') {
            count++;
          }
        } catch (e) { }
      }
      return count;
    } catch (e) {
      return 0;
    }
  }
}

module.exports = LocalGeminiService;
