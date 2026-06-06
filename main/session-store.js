const ElectronStore = require('electron-store');

const Store = ElectronStore.default || ElectronStore;

class SessionStore {
  constructor() {
    this.store = new Store({
      name: 'thatisok-sessions'
    });
    this.sessions = this.store.get('sessions', {});
  }

  upsertSession(event) {
    const sessionId = this.getSessionId(event);
    if (!sessionId) {
      return null;
    }

    const current = this.sessions[sessionId] || {};
    const next = {
      id: sessionId,
      source: event.source || current.source || 'unknown',
      status: this.mapStatus(event.event, current.status),
      updatedAt: Date.now(),
      lastEvent: event.event,
      meta: {
        ...(current.meta || {}),
        ...(event.payload || {})
      }
    };

    this.sessions[sessionId] = next;
    this.store.set('sessions', this.sessions);
    return next;
  }

  getActiveSessions() {
    return Object.values(this.sessions)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);
  }

  getSessionId(event) {
    const payload = event && event.payload ? event.payload : {};
    return payload.session_id || payload.sessionId || payload.run_id || payload.runId || null;
  }

  mapStatus(eventName, previous = 'idle') {
    const event = String(eventName || '').toLowerCase();
    if (event === 'sessionstart') return 'active';
    if (event === 'stop' || event === 'sessionend') return 'done';
    if (event === 'permissionrequest') return 'waiting';
    if (event === 'posttooluse' || event === 'userpromptsubmit') return 'active';
    return previous;
  }
}

module.exports = SessionStore;
