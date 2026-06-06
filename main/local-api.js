const http = require('http');

class LocalAPI {
    constructor(usageStore, interventionManager) {
        this.usageStore = usageStore;
        this.interventionManager = interventionManager;
        this.server = null;
        this.port = 45874;
        this.host = '127.0.0.1';
    }

    start() {
        this.server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });

        this.server.listen(this.port, this.host, () => {
            console.log(`Local API listening on http://${this.host}:${this.port}`);
        });

        this.server.on('error', (err) => {
            console.error('Local API error:', err.message);
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }

    handleRequest(req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathname = url.pathname;

        if (pathname === '/api/usage') {
            this.handleUsage(req, res);
            return;
        }

        if (pathname === '/api/overview') {
            this.handleOverview(req, res);
            return;
        }

        if (pathname === '/api/accounts') {
            this.handleAccounts(req, res);
            return;
        }

        if (pathname === '/api/intervention') {
            this.handleIntervention(req, res);
            return;
        }

        if (pathname === '/api/health') {
            this.handleHealth(req, res);
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }

    handleUsage(req, res) {
        const data = this.usageStore.getDashboardData();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    handleOverview(req, res) {
        const overview = this.usageStore.getOverview();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(overview));
    }

    handleAccounts(req, res) {
        const accounts = this.usageStore.getLatestBalances();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(accounts));
    }

    handleIntervention(req, res) {
        const pending = this.interventionManager
            ? this.interventionManager.getPending()
            : null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pending }));
    }

    handleHealth(req, res) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            version: require('../../package.json').version,
            uptime: process.uptime()
        }));
    }
}

module.exports = { LocalAPI };
