const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { AGENT_CONFIG, orchestrateChat } = require('./orchestrator');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

function createApp() {
  const app = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/agents') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agents: AGENT_CONFIG }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/agents') {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        try {
          const { agents } = JSON.parse(body || '{}');

          if (!agents || typeof agents !== 'object') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'An agents object is required.' }));
            return;
          }

          Object.keys(AGENT_CONFIG).forEach((name) => {
            if (Object.prototype.hasOwnProperty.call(agents, name)) {
              AGENT_CONFIG[name].enabled = Boolean(agents[name]);
            }
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ agents: AGENT_CONFIG }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to update agent settings.' }));
        }
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/styles.css') {
      const filePath = path.join(__dirname, 'public', 'styles.css');
      const css = fs.readFileSync(filePath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/css',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache'
      });
      res.end(css);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/app.js') {
      const filePath = path.join(__dirname, 'public', 'app.js');
      const js = fs.readFileSync(filePath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache'
      });
      res.end(js);
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const filePath = path.join(__dirname, 'public', 'index.html');
      const html = fs.readFileSync(filePath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache'
      });
      res.end(html);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', async () => {
        try {
          const { message, disabledAgents } = JSON.parse(body || '{}');

          if (!message || typeof message !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'A message string is required.' }));
            return;
          }

          const result = await orchestrateChat(message, disabledAgents || Object.entries(AGENT_CONFIG)
            .filter(([, config]) => !config.enabled)
            .map(([name]) => name));

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            reply: result.reply,
            agent: result.agent,
            agents: result.agents || (result.agent ? [result.agent] : []),
            responses: result.responses || (result.agent ? [{ agent: result.agent, reply: result.reply }] : [])
          }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to process chat request.' }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return app;
}

async function getChatReply(message) {
  const result = await orchestrateChat(message);
  return result.reply;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Chat app listening on http://localhost:${PORT}`);
  });
}

module.exports = { createApp, getChatReply };
