const { ipcRenderer } = require('electron');

const island = document.getElementById('island');
const expandedContent = document.getElementById('expandedContent');
const primaryLabel = document.getElementById('primaryLabel');
const primaryValue = document.getElementById('primaryValue');
const sessionsList = document.getElementById('sessionsList');
const accountsList = document.getElementById('accountsList');
const syncButton = document.getElementById('syncButton');
const interventionPanel = document.getElementById('interventionPanel');
const interventionSource = document.getElementById('interventionSource');
const interventionTool = document.getElementById('interventionTool');
const interventionTitle = document.getElementById('interventionTitle');
const interventionCommand = document.getElementById('interventionCommand');
const interventionDetail = document.getElementById('interventionDetail');
const interventionMeta = document.getElementById('interventionMeta');
const approveButton = document.getElementById('approveButton');
const approveAlwaysButton = document.getElementById('approveAlwaysButton');
const denyButton = document.getElementById('denyButton');

let currentData = null;
let pendingIntervention = null;

function expandIsland() {
    island.classList.remove('pill');
    island.classList.add('expanded');
    expandedContent.classList.remove('hidden');
    ipcRenderer.send('island:set-mode', 'expanded');
}

function collapseIsland() {
    if (pendingIntervention) {
        return;
    }

    island.classList.remove('expanded');
    island.classList.add('pill');
    expandedContent.classList.add('hidden');
    ipcRenderer.send('island:set-mode', 'pill');
}

island.addEventListener('click', (event) => {
    if (event.target.tagName === 'BUTTON') {
        return;
    }

    if (island.classList.contains('pill')) {
        expandIsland();
    } else {
        collapseIsland();
    }
});

function formatUsd(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return '--';
    }

    return `$${value.toFixed(1)}`;
}

function getAccountPriority(account) {
    if (account && account.id === 'codex-local') {
        return 0;
    }

    if (account && account.id === 'claude-local') {
        return 1;
    }

    if (account && account.status === 'stale') {
        return 2;
    }

    return 3;
}

function getTone(data) {
    if (pendingIntervention) {
        return 'tone-danger';
    }

    if (!data) {
        return 'tone-neutral';
    }

    if (Number.isFinite(data.overview.totalBalanceUsd) && (data.overview.totalBalanceUsd <= 20 || data.overview.runwayDays <= 3)) {
        return 'tone-danger';
    }

    if (Number.isFinite(data.overview.totalBalanceUsd) && (data.overview.totalBalanceUsd <= 50 || data.overview.runwayDays <= 7)) {
        return 'tone-warn';
    }

    return 'tone-good';
}

function renderAccounts(accounts) {
    if (!accounts.length) {
        accountsList.innerHTML = '';
        return;
    }

    const prioritizedAccounts = [...accounts].sort((left, right) => getAccountPriority(left) - getAccountPriority(right));

    accountsList.innerHTML = prioritizedAccounts
        .slice(0, 3)
        .map((account) => renderAccountCard(account))
        .join('');
}

function renderSummary(data) {
    currentData = data;
    const codexAccount = data.accounts.find(a => a.id === 'codex-local');
    if (codexAccount) {
        primaryLabel.innerText = 'Codex Plan';
        primaryValue.innerText = codexAccount.plan || 'Live';
    } else {
        primaryLabel.innerText = 'Codex Status';
        primaryValue.innerText = 'Live';
    }
    renderSessions(data.sessions || []);
    renderAccounts(data.accounts || []);
    updateCompactVisibility();

    island.classList.remove('tone-neutral', 'tone-good', 'tone-warn', 'tone-danger');
    island.classList.add(getTone(data));
}

function renderAccountCard(account) {
    const plan = account.plan ? `<span class="accountPlan">${escapeHtml(account.plan)}</span>` : '';
    const lines = Array.isArray(account.lines) ? account.lines.slice(0, 2).map((line) => renderAccountLine(line)).join('') : '';
    const statusClass = account.status ? ` account-${escapeHtml(account.status)}` : '';

    return `
        <div class="accountCard${statusClass}">
            <div class="accountHead">
                <span class="accountName">${escapeHtml(account.label || account.provider || 'Account')}</span>
                <span class="accountValue">${renderAccountHeadline(account)}</span>
            </div>
            ${plan}
            <div class="accountLines">${lines}</div>
        </div>
    `;
}

function renderAccountHeadline(account) {
    if (account.status === 'stale') {
        return 'Stale';
    }

    if (typeof account.balanceUsd === 'number' && !Number.isNaN(account.balanceUsd)) {
        return formatUsd(account.balanceUsd);
    }

    if (account.provider === 'codex' && account.meta && account.meta.planType) {
        return account.plan || 'ChatGPT login';
    }

    if (account.provider === 'claude' && account.plan) {
        return account.plan;
    }

    return '--';
}

function renderAccountLine(line) {
    if (!line) {
        return '';
    }

    if (line.type === 'progress') {
        return renderProgressLine(line);
    }

    return `
        <div class="accountLine accountTextLine">
            <span class="lineLabel">${escapeHtml(line.label || '')}</span>
            <span class="lineValue">${escapeHtml(line.value || '--')}</span>
        </div>
        ${line.subtitle ? `<div class="lineSub">${escapeHtml(line.subtitle)}</div>` : ''}
    `;
}

function renderProgressLine(line) {
    const limit = Number(line.limit || 0);
    const used = Number(line.used || 0);
    const percent = limit > 0 ? Math.max(0, Math.min(100, (used / limit) * 100)) : 0;
    const resetText = line.resetsAt ? ` · reset ${formatResetDate(line.resetsAt)}` : '';
    
    let valueLabel = '';
    const format = line.format || { kind: 'currency', currency: 'USD' };
    
    if (format.kind === 'percent') {
        valueLabel = `${Math.round(used)}%`;
    } else if (format.kind === 'count') {
        valueLabel = `${used}${format.suffix ? ` ${format.suffix}` : ''}`;
    } else {
        valueLabel = formatUsd(used);
    }

    let limitLabel = '';
    if (format.kind === 'percent') {
        limitLabel = '100%';
    } else if (format.kind === 'count') {
        limitLabel = `${limit}${format.suffix ? ` ${format.suffix}` : ''}`;
    } else {
        limitLabel = formatUsd(limit);
    }

    const subtitle = `${line.subtitle || `${valueLabel} / ${limitLabel}`}${resetText}`;

    return `
        <div class="accountLine accountProgressLine">
            <span class="lineLabel">${escapeHtml(line.label || 'Usage')}</span>
            <span class="lineValue">${format.kind === 'percent' ? valueLabel : `${Math.round(percent)}%`}</span>
        </div>
        <div class="progressTrack"><div class="progressFill" style="width:${percent}%"></div></div>
        <div class="lineSub">${escapeHtml(subtitle)}</div>
    `;
}

function renderSessions(sessions) {
    if (!sessions.length) {
        sessionsList.classList.add('hidden');
        sessionsList.innerHTML = '';
        return;
    }

    sessionsList.classList.remove('hidden');
    sessionsList.innerHTML = sessions.slice(0, 2).map((session) => `
        <div class="sessionRow">
            <span class="sessionName">${formatSource(session.source)}</span>
            <span class="sessionValue">${session.status || '--'}</span>
        </div>
    `).join('');
}

function renderIntervention(intervention) {
    pendingIntervention = intervention;

    if (!intervention) {
        interventionPanel.classList.add('hidden');
        updateCompactVisibility();
        if (currentData) {
            island.classList.remove('tone-neutral', 'tone-good', 'tone-warn', 'tone-danger');
            island.classList.add(getTone(currentData));
        }
        return;
    }

    interventionPanel.classList.remove('hidden');
    interventionSource.innerText = formatSource(intervention.source);
    interventionTool.innerText = formatTool(intervention.toolName);
    interventionTitle.innerText = intervention.title || 'Approval required';
    renderInterventionCommand(intervention.command);
    interventionDetail.innerText = renderDetailText(intervention);
    renderInterventionMeta(intervention);
    updateCompactVisibility();
    applySourceTheme(intervention.source);
    island.classList.remove('tone-neutral', 'tone-good', 'tone-warn', 'tone-danger');
    island.classList.add('tone-danger');
    expandIsland();
}

function formatSource(source) {
    if (source === 'claude') {
        return 'Claude';
    }
    if (source === 'codex') {
        return 'Codex';
    }
    return 'Agent';
}

function formatTool(toolName) {
    if (!toolName) {
        return 'permission';
    }
    return String(toolName).replace(/_/g, ' ');
}

function renderInterventionMeta(intervention) {
    const items = [];

    if (intervention.prefixRule) {
        items.push(`rule ${compactText(intervention.prefixRule, 28)}`);
    }

    if (intervention.sandbox) {
        items.push(`perm ${compactText(intervention.sandbox, 18)}`);
    }

    if (!items.length) {
        interventionMeta.classList.add('hidden');
        interventionMeta.innerText = '';
        return;
    }

    interventionMeta.classList.remove('hidden');
    interventionMeta.innerText = items.join(' · ');
}

function renderInterventionCommand(command) {
    if (!command) {
        interventionCommand.classList.add('hidden');
        interventionCommand.textContent = '';
        return;
    }

    const text = String(command);
    interventionCommand.classList.remove('hidden');
    interventionCommand.textContent = compactText(text, 132);
}

function renderDetailText(intervention) {
    if (!intervention) {
        return '--';
    }

    if (intervention.command && intervention.detail === intervention.command) {
        return `${formatSource(intervention.source)} requested action`;
    }

    return compactText(intervention.detail || '--', 64);
}

function compactText(value, maxLength) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) {
        return '--';
    }
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatResetDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '--';
    }

    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function updateCompactVisibility() {
    const compact = Boolean(pendingIntervention);
    sessionsList.classList.toggle('hidden', compact || !sessionsList.innerHTML);
    accountsList.classList.toggle('compactHidden', compact);
    syncButton.classList.toggle('compactHidden', compact);
}

function applySourceTheme(source) {
    interventionPanel.classList.remove('source-claude', 'source-codex', 'source-agent');

    if (source === 'claude') {
        interventionPanel.classList.add('source-claude');
        return;
    }

    if (source === 'codex') {
        interventionPanel.classList.add('source-codex');
        return;
    }

    interventionPanel.classList.add('source-agent');
}

ipcRenderer.on('island-data', (_event, data) => {
    renderSummary(data);
});

ipcRenderer.on('island-force-expand', () => {
    expandIsland();
});

ipcRenderer.on('intervention-state', (_event, intervention) => {
    renderIntervention(intervention);
});

syncButton.addEventListener('click', async () => {
    syncButton.disabled = true;
    try {
        const data = await ipcRenderer.invoke('island:sync-now');
        renderSummary(data);
    } finally {
        syncButton.disabled = false;
    }
});

approveButton.addEventListener('click', () => {
    ipcRenderer.send('intervention:respond', 'approve');
});

approveAlwaysButton.addEventListener('click', () => {
    ipcRenderer.send('intervention:respond', 'approve_always');
});

denyButton.addEventListener('click', () => {
    ipcRenderer.send('intervention:respond', 'deny');
});

Promise.all([
    ipcRenderer.invoke('island:get-data'),
    ipcRenderer.invoke('island:get-intervention')
]).then(([data, intervention]) => {
    renderSummary(data);
    renderIntervention(intervention);
});
