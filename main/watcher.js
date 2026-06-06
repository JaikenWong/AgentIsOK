const hookEvents = require('../shared/hook-events');

class Watcher {
    constructor(usageStore) {
        this.usageStore = usageStore;
    }

    async handleHookEvent(eventData, interventionManager) {
        const normalized = hookEvents.normalizeHookEnvelope(eventData);
        const eventName = String(normalized.event || '').toLowerCase();

        if (eventName === 'sessionstart') {
            return { ok: true, recorded: false, action: 'session_started' };
        }

        if (eventName === 'stop' || eventName === 'sessionend') {
            return { ok: true, recorded: false, action: 'session_ended' };
        }

        if (eventName === 'userpromptsubmit') {
            return { ok: true, recorded: false, action: 'prompt_submitted' };
        }

        if (hookEvents.isPermissionLikeEvent(normalized)) {
            const response = await interventionManager.request(
                hookEvents.buildInterventionModel(normalized)
            );

            return hookEvents.buildHookDecisionResponse({
                requiresDecision: true,
                approved: response.approved,
                allowPersistent: response.allowPersistent
            });
        }

        if (eventName === 'pretooluse') {
            const response = await interventionManager.request(
                hookEvents.buildInterventionModel(normalized)
            );

            return hookEvents.buildHookDecisionResponse({
                requiresDecision: true,
                approved: response.approved,
                allowPersistent: response.allowPersistent
            });
        }

        if (eventName === 'posttooluse') {
            return { ok: true, recorded: false, action: 'tool_completed' };
        }

        const usageEvent = this.parseContent(normalized.raw);
        return {
            ok: true,
            recorded: Boolean(usageEvent)
        };
    }

    parseContent(content) {
        if (!content || typeof content !== 'string') {
            return null;
        }

        const provider = this.extractMatch(content, /provider[:=]\s*([a-z0-9_-]+)/i) || 'unknown';
        const model = this.extractMatch(content, /model[:=]\s*([a-z0-9._-]+)/i) || 'unknown';
        const project = this.extractMatch(content, /project[:=]\s*([a-z0-9._/-]+)/i) || 'default';
        const inputTokens = this.extractNumber(content, /input[_\s-]?tokens?[:=]\s*([\d,]+)/i);
        const outputTokens = this.extractNumber(content, /output[_\s-]?tokens?[:=]\s*([\d,]+)/i);
        const totalTokens = this.extractNumber(content, /tokens?[:=]\s*([\d,]+)/i);
        const costUsd = this.extractDecimal(content, /(cost|usd|price)[:=\s$]*([\d.]+)/i);

        if (!inputTokens && !outputTokens && !totalTokens && !costUsd) {
            return null;
        }

        return this.usageStore.recordUsageEvent({
            provider,
            model,
            project,
            inputTokens: inputTokens || totalTokens || 0,
            outputTokens,
            costUsd
        });
    }

    extractMatch(content, pattern) {
        const match = content.match(pattern);
        return match ? match[1] : null;
    }

    extractNumber(content, pattern) {
        const raw = this.extractMatch(content, pattern);
        return raw ? Number(raw.replace(/,/g, '')) : 0;
    }

    extractDecimal(content, pattern) {
        const match = content.match(pattern);
        return match ? Number(match[2]) : 0;
    }
}

module.exports = Watcher;
