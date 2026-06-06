class InterventionManager {
    constructor() {
        this.pending = null;
        this.queue = [];
        this.onChange = null;
    }

    setOnChange(handler) {
        this.onChange = handler;
    }

    request(request) {
        return new Promise((resolve) => {
            const entry = {
                id: request.id || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                source: request.source || 'unknown',
                event: request.event || 'PermissionRequest',
                title: request.title || 'Approval required',
                detail: request.detail || '',
                raw: request.raw || '',
                meta: request.meta || {},
                resolve
            };

            if (this.pending) {
                this.queue.push(entry);
                return;
            }

            this.activate(entry);
        });
    }

    activate(entry) {
        this.pending = entry;
        this.emitChange();
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
