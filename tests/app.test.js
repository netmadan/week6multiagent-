const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, getChatReply } = require('../src/server');
const { orchestrateChat, parsePlannerResponse } = require('../src/orchestrator');

(async () => {
  test('health endpoint responds successfully', async () => {
    const app = createApp();
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.status, 'ok');
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  test('chat endpoint accepts prompt and returns a response', async () => {
    const app = createApp();
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello from test' })
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.ok(typeof body.reply === 'string');
      assert.ok(body.reply.length > 0);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  test('accepts only valid ordered planner agents and tasks', () => {
    assert.deepEqual(parsePlannerResponse(JSON.stringify({
      agents: ['detective', 'comedian', 'unknown', 'detective'],
      tasks: {
        detective: 'Investigate the room.',
        comedian: 'Tell a joke about the investigation.',
        unknown: 'Do something else.'
      }
    })), {
      agents: ['detective', 'comedian'],
      tasks: {
        detective: 'Investigate the room.',
        comedian: 'Tell a joke about the investigation.'
      }
    });
  });

  test('orchestrator selects the right specialist and returns a reply', async () => {
    const originalFetch = global.fetch;
    let callCount = 0;
    global.fetch = async () => ({
      ok: true,
      async json() {
        callCount += 1;
        return {
          choices: [{
            message: {
              content: callCount === 1
                ? '{"agents":["comedian"],"tasks":{"comedian":"Tell me a joke"}}'
                : 'A classic one-liner for you.'
            }
          }]
        };
      }
    });

    try {
      const result = await orchestrateChat('Tell me a joke');
      assert.equal(result.agent, 'comedian');
      assert.equal(result.reply, 'A classic one-liner for you.');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('uses the planner order and planner-owned task text', async () => {
    const originalFetch = global.fetch;
    const requests = [];
    global.fetch = async (url, options) => {
      const request = JSON.parse(options.body);
      requests.push(request);
      const content = requests.length === 1
        ? '{"agents":["detective","comedian"],"tasks":{"detective":"Detect who was in the room.","comedian":"Tell a joke about someone being in the room."}}'
        : `Reply for ${request.messages.at(-1).content}`;
      return { ok: true, async json() { return { choices: [{ message: { content } }] }; } };
    };

    try {
      const result = await orchestrateChat('Tell me how to detect if someone was in your room, then tell a joke about that');
      assert.deepEqual(result.agents, ['detective', 'comedian']);
      assert.match(requests[1].messages.at(-1).content, /Detect who was in the room/);
      assert.match(requests[2].messages.at(-1).content, /someone being in the room/);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('routes compound prompts to all matching specialists', async () => {
    const originalFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, options) => {
      const request = JSON.parse(options.body);
      calls.push(request.messages.at(-1).content);
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: calls.length === 1
                  ? '{"agents":["comedian","doctor"],"tasks":{"comedian":"Tell a joke","doctor":"Explain the bleeding and wound."}}'
                  : `Model response for: ${request.messages.at(-1).content}`
              }
            }]
          };
        }
      };
    };

    try {
      const result = await orchestrateChat('Tell a joke, and my leg is bleeding a lot — should I wrap it tight above the wound?');
      assert.deepEqual(result.agents, ['comedian', 'doctor']);
      assert.equal(result.agent, 'comedian');
      assert.match(result.reply, /comedian/i);
      assert.match(result.reply, /doctor/i);
      assert.equal(calls.length, 3);
      assert.match(calls[1], /joke/i);
      assert.doesNotMatch(calls[1], /bleeding|wound|wrap/i);
      assert.match(calls[2], /bleeding|wound/i);
      assert.doesNotMatch(calls[2], /joke/i);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('respects disabled agents when routing a prompt', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      async json() {
        return {
          choices: [{
            message: {
              content: 'A general answer.'
            }
          }]
        };
      }
    });

    try {
      const result = await orchestrateChat('Tell me a joke', ['comedian']);
      assert.equal(result.agent, null);
      assert.equal(result.reply, 'No specialist agent matched this prompt.');
      assert.deepEqual(result.agents, []);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('returns a specialist-not-found message when no agent matches', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: false,
      async json() {
        return {
          error: {
            message: 'Proxy request failed'
          }
        };
      }
    });

    try {
      const reply = await getChatReply('hello there');
      assert.equal(reply, 'No specialist agent matched this prompt.');
    } finally {
      global.fetch = originalFetch;
    }
  });
})();
