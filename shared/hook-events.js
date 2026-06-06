function normalizeHookEnvelope(eventData) {
  if (!eventData || typeof eventData !== 'object') {
    return {
      source: 'unknown',
      event: 'unknown',
      payload: null,
      raw: typeof eventData === 'string' ? eventData : ''
    };
  }

  return {
    source: eventData.source || 'unknown',
    event: eventData.event || 'unknown',
    payload: eventData.payload || null,
    raw: eventData.raw || JSON.stringify(eventData.payload || eventData)
  };
}

function isPermissionLikeEvent(eventData) {
  if (String(eventData.event).toLowerCase() === 'permissionrequest') {
    return true;
  }

  const raw = String(eventData.raw || '').toLowerCase();
  return raw.includes('permission') || raw.includes('approval');
}

function formatSourceLabel(source) {
  if (source === 'claude') {
    return 'Claude Code';
  }
  if (source === 'codex') {
    return 'Codex';
  }
  return 'Agent';
}

function extractCommand(eventData) {
  const payload = eventData.payload || {};
  const direct = [payload.command, payload.cmd].find(Boolean);
  if (direct) {
    return String(direct);
  }

  if (payload.tool_input && typeof payload.tool_input === 'object') {
    if (payload.tool_input.command) {
      return String(payload.tool_input.command);
    }
    if (payload.tool_input.cmd) {
      return String(payload.tool_input.cmd);
    }
  }

  return null;
}

function extractToolName(eventData) {
  const payload = eventData.payload || {};
  return payload.tool_name || payload.toolName || payload.tool || payload.matcher || 'permission';
}

function extractSandbox(eventData) {
  const payload = eventData.payload || {};
  return payload.sandbox_permissions || payload.sandbox || payload.permission_mode || null;
}

function extractPrefixRule(eventData) {
  const payload = eventData.payload || {};
  const rule = payload.prefix_rule || payload.prefixRule;
  if (Array.isArray(rule)) {
    return rule.join(' ');
  }
  return rule ? String(rule) : null;
}

function buildInterventionModel(eventData) {
  const payload = eventData.payload || {};
  const command = extractCommand(eventData);
  const fallback = [payload.matcher, payload.reason, payload.message, payload.prompt].filter(Boolean)[0];

  return {
    source: eventData.source,
    event: eventData.event,
    title: `${formatSourceLabel(eventData.source)} needs approval`,
    detail: String(command || fallback || eventData.raw || '--').slice(0, 240),
    command,
    toolName: extractToolName(eventData),
    sandbox: extractSandbox(eventData),
    prefixRule: extractPrefixRule(eventData),
    raw: eventData.raw,
    meta: payload
  };
}

function buildHookDecisionResponse({ approved, allowPersistent, requiresDecision }) {
  return {
    ok: true,
    requiresDecision: Boolean(requiresDecision),
    approved: Boolean(approved),
    allowPersistent: Boolean(allowPersistent)
  };
}

module.exports = {
  normalizeHookEnvelope,
  isPermissionLikeEvent,
  buildInterventionModel,
  buildHookDecisionResponse
};
