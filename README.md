# week6multiagent-

week6multiagent🦾

A small Node.js chat app that routes prompts through an LLM planner and delegates response generation to separate comedian, doctor, and detective specialists.

## What changed

- Added an orchestrator in [src/orchestrator.js](src/orchestrator.js)
- Added agent-specific modules:
  - [src/agents/comedian.js](src/agents/comedian.js)
  - [src/agents/doctor.js](src/agents/doctor.js)
  - [src/agents/detective.js](src/agents/detective.js)
- Added shared LLM logic in [src/agents/shared.js](src/agents/shared.js)
- Updated the main HTTP app in [src/server.js](src/server.js) to call the orchestrator instead of making a single direct LLM request

## Agent routing

The orchestrator makes a dedicated LLM planning call for each user prompt. The planner returns an ordered list of specialists and an isolated task for each selected specialist. Only the available specialists (`comedian`, `doctor`, and `detective`) are accepted, and disabled specialists are removed before execution.

The specialist tasks are then sent to their respective agents in the planner's order. The planner does not answer the user, and each specialist is instructed to stay within its assigned task.

## App behavior

The app still exposes the same server endpoints:

- GET /health
- GET /
- GET /app.js
- GET /styles.css
- POST /api/chat

The POST /api/chat route accepts JSON like:

```json
{
  "message": "Tell me a joke"
}
```

and returns:

```json
{
  "reply": "...",
  "agent": "comedian"
}
```

## LLM logic

The planner and each agent use proxy-based completion calls through the shared helper. Planner output is validated as JSON before any specialist is invoked. The helper sends requests to the classroom proxy endpoint and falls back to an echo-style response if the proxy request fails.

## Run locally

```bash
npm install
npm start
```

Then open the app in a browser at:

```text
http://localhost:3000
```

## Test

```bash
npm test
```

The test suite checks:

- health endpoint
- chat endpoint response
- LLM planner agent selection and ordering
- planner task isolation and orchestrator delegation results
- quota-exhausted fallback behavior
