const { Notification } = require('electron');

class InterventionManager {
    constructor() {
        this.pending = null;
        this.queue = [];
        this.onChange = null;
        this.notificationEnabled = true;
        this.soundEnabled = true;
    }

    setOnChange(handler) {
        this.onChange = handler;
    }

    setNotificationEnabled(enabled) {
        this.notificationEnabled = enabled;
    }

    setSoundEnabled(enabled) {
        this.soundEnabled = enabled;
    }

    request(request) {
        return new Promise((resolve) => {
            const entry = {
                id: request.id || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                source: request.source || 'unknown',
                event: request.event || 'PermissionRequest',
                title: request.title || 'Approval required',
                detail: request.detail || '',
                command: request.command || '',
                filePath: request.filePath || '',
                toolName: request.toolName || 'permission',
                raw: request.raw || '',
                meta: request.meta || {},
                createdAt: Date.now(),
                resolve
            };

            if (this.pending) {
                this.queue.push(entry);
                this.sendNotification(entry);
                return;
            }

            this.activate(entry);
        });
    }

    activate(entry) {
        this.pending = entry;
        this.sendNotification(entry);
        this.emitChange();
    }

    sendNotification(entry) {
        if (!this.notificationEnabled) {
            return;
        }

        try {
            const notification = new Notification({
                title: entry.title || 'Approval required',
                body: this.formatNotificationBody(entry),
                silent: !this.soundEnabled,
                timeoutType: 'never'
            });

            notification.on('click', () => {
                this.emitChange();
            });

            notification.show();
        } catch (err) {
            console.error('Failed to show notification:', err);
        }
    }

    formatNotificationBody(entry) {
        const parts = [];
        if (entry.toolName && entry.toolName !== 'permission') {
            parts.push(`Tool: ${entry.toolName}`);
        }
        if (entry.command) {
            const cmd = String(entry.command).slice(0, 80);
            parts.push(cmd);
        } else if (entry.detail) {
            parts.push(String(entry.detail).slice(0, 80));
        }
        return parts.join('\n') || 'Click to review';
    }

    getPending() {
        if (!this.pending) {
            return null;
        }

        const { resolve, ...rest } = this.pending;
        return rest;
    }

    respond(decision) {
        if (!this.pending) {
            return;
        }

        const current = this.pending;
        this.pending = null;
        const approved = decision === 'approve' || decision === 'approve_always';
        current.resolve({
            approved,
            decision,
            allowPersistent: decision === 'approve_always'
        });
        this.emitChange();

        const next = this.queue.shift();
        if (next) {
            this.activate(next);
        }
    }

    emitChange() {
        if (typeof this.onChange === 'function') {
            this.onChange(this.getPending());
        }
    }
}

module.exports = InterventionManager;
