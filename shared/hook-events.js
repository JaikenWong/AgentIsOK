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

function isPreToolUseEvent(eventData) {
  return String(eventData.event).toLowerCase() === 'pretooluse';
}

function formatSourceLabel(source) {
  if (source === 'claude') {
    return 'Claude';
  }
  if (source === 'codex') {
    return 'Codex';
  }
  if (source === 'gemini') {
    return 'Gemini';
  }
  if (source === 'minimax') {
    return 'MiniMax';
  }
  if (source === 'opencode') {
    return 'OpenCode';
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

function extractFilePath(eventData) {
  const payload = eventData.payload || {};
  return payload.file_path || payload.filePath || payload.path || null;
}

function buildInterventionModel(eventData) {
  const payload = eventData.payload || {};
  const command = extractCommand(eventData);
  const filePath = extractFilePath(eventData);
  const fallback = [payload.matcher, payload.reason, payload.message, payload.prompt].filter(Boolean)[0];

  const toolName = extractToolName(eventData);
  const title = filePath
    ? `${formatSourceLabel(eventData.source)} wants to edit ${basename(filePath)}`
    : `${formatSourceLabel(eventData.source)} needs approval`;

  return {
    source: eventData.source,
    event: eventData.event,
    title,
    detail: String(command || fallback || eventData.raw || '--').slice(0, 240),
    command,
    filePath,
    toolName,
    sandbox: extractSandbox(eventData),
    prefixRule: extractPrefixRule(eventData),
    raw: eventData.raw,
    meta: payload
  };
}

function basename(filePath) {
  if (!filePath) return '';
  const parts = String(filePath).replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
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
  isPreToolUseEvent,
  buildInterventionModel,
  buildHookDecisionResponse
};
