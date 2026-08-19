const messagesEl = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const agentListEl = document.getElementById('agent-list');
const traceListEl = document.getElementById('trace-list');

const PROXY_URL = 'https://vibe-proxy-gqv4.onrender.com/v1/chat/completions';
const PROXY_AUTH_TOKEN = 'sk-vibe-summer-2026';
const STATIC_SITE = window.location.hostname.endsWith('github.io');
const AGENT_INSTRUCTIONS = {
  comedian: 'You are the comedian specialist. Answer only the joke or humor portion of the user request. Do not answer medical, detective, or other unrelated portions. Be playful and lighthearted.',
  doctor: 'You are the doctor specialist. Answer only the health or medical portion of the user request. Be empathetic, knowledgeable, and careful. Do not tell jokes or answer detective or other unrelated portions.',
  detective: 'You are the detective specialist. Answer only the mystery, investigation, or crime portion of the user request. Be analytical and focused. Do not tell jokes, give medical advice, or answer other unrelated portions.'
};
const PLANNER_INSTRUCTION = 'You are an agent-routing planner. Analyze the user request and decide which specialists should respond, in order. Available specialists: comedian, doctor, detective. Return only valid JSON in this exact shape: {"agents":["comedian"],"tasks":{"comedian":"the exact task for the comedian"}}. Include only specialists with a meaningful task. Each task must contain only that specialist portion, with references such as that resolved to their subject. Never answer the user or explain your choices.';

const AGENT_DEFAULTS = {
  comedian: true,
  doctor: true,
  detective: true
};

const agentState = { ...AGENT_DEFAULTS };

function syncAgentState(serverAgents) {
  Object.entries(AGENT_DEFAULTS).forEach(([agentName]) => {
    const enabled = Boolean(serverAgents?.[agentName]?.enabled ?? serverAgents?.[agentName] ?? true);
    agentState[agentName] = enabled;
  });
}

function appendMessage(text, role = 'bot', agentName = '') {
  const item = document.createElement('div');
  item.className = `message ${role}`;

  if (role === 'system') {
    const dots = document.createElement('span');
    dots.className = 'typing-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';
    item.appendChild(dots);
  } else {
    if (role === 'bot' && agentName) {
      item.dataset.agent = `[${agentName}]`;
      item.textContent = `${item.dataset.agent} ${text}`;
    } else {
      item.textContent = text;
    }
  }

  messagesEl.appendChild(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  return item;
}

function addTraceEntry(label, detail) {
  const item = document.createElement('div');
  item.className = 'trace-item';
  item.innerHTML = `<strong>${label}</strong><span>${detail}</span>`;
  traceListEl.prepend(item);

  while (traceListEl.children.length > 6) {
    traceListEl.removeChild(traceListEl.lastChild);
  }
}

function renderAgentList() {
  agentListEl.innerHTML = '';

  Object.entries(agentState).forEach(([agentName, enabled]) => {
    const wrapper = document.createElement('div');
    wrapper.className = `agent-toggle ${enabled ? '' : 'disabled'}`;

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = enabled;
    checkbox.name = agentName;
    checkbox.addEventListener('change', async () => {
      const nextState = checkbox.checked;
      agentState[agentName] = nextState;
      wrapper.classList.toggle('disabled', !nextState);

      if (STATIC_SITE) {
        localStorage.setItem('agentState', JSON.stringify(agentState));
        return;
      }

      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: agentState })
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        syncAgentState(data.agents || agentState);
        renderAgentList();
      }
    });

    const text = document.createElement('span');
    text.textContent = agentName.charAt(0).toUpperCase() + agentName.slice(1);

    label.appendChild(checkbox);
    label.appendChild(text);
    wrapper.appendChild(label);
    agentListEl.appendChild(wrapper);
  });
}

async function getAgentReply(userMessage) {
  const disabledAgents = Object.entries(agentState)
    .filter(([, enabled]) => !enabled)
    .map(([name]) => name);

  console.log('[app] user input and current agent state', { userMessage, disabledAgents });
  addTraceEntry('Prompt', userMessage);
  addTraceEntry('Routing', disabledAgents.length ? `Skipped: ${disabledAgents.join(', ')}` : 'No agents skipped');

  if (STATIC_SITE) {
    return getStaticAgentReply(userMessage, disabledAgents);
  }

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: userMessage, disabledAgents })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error || 'Request failed');
  }

  const data = await response.json();
  const responses = Array.isArray(data.responses) && data.responses.length
    ? data.responses
    : (data.agent ? [{ agent: data.agent, reply: data.reply || '' }] : []);

  addTraceEntry('Selected', responses.map(({ agent }) => agent).join(', ') || 'None');

  return {
    reply: data.reply,
    agent: data.agent || responses[0]?.agent || null,
    agents: data.agents || responses.map(({ agent }) => agent),
    responses
  };
}

async function callStaticProxy(message, systemInstruction) {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PROXY_AUTH_TOKEN}`
    },
    body: JSON.stringify({
      model: 'class-chat-model',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: message }
      ]
    })
  });

  if (!response.ok) {
    throw new Error('The language model could not be reached.');
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || '';
}

function parseStaticPlan(text, disabledAgents) {
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) {
    return { agents: [], tasks: {} };
  }

  try {
    const plan = JSON.parse(jsonText);
    const disabled = new Set(disabledAgents);
    const agents = Array.isArray(plan.agents)
      ? plan.agents.filter((agent, index, list) => ['comedian', 'doctor', 'detective'].includes(agent)
        && !disabled.has(agent)
        && list.indexOf(agent) === index
        && typeof plan.tasks?.[agent] === 'string'
        && plan.tasks[agent].trim())
      : [];
    return {
      agents,
      tasks: Object.fromEntries(agents.map((agent) => [agent, plan.tasks[agent].trim()]))
    };
  } catch (error) {
    return { agents: [], tasks: {} };
  }
}

async function getStaticAgentReply(userMessage, disabledAgents) {
  const plannerText = await callStaticProxy(userMessage, PLANNER_INSTRUCTION);
  const plan = parseStaticPlan(plannerText, disabledAgents);
  addTraceEntry('Selected', plan.agents.join(', ') || 'None');

  const responses = [];
  for (const agent of plan.agents) {
    const reply = await callStaticProxy(plan.tasks[agent], AGENT_INSTRUCTIONS[agent]);
    responses.push({ agent, reply });
  }

  return {
    reply: responses.map(({ agent, reply }) => `[${agent}] ${reply}`).join('\n\n'),
    agent: plan.agents[0] || null,
    agents: plan.agents,
    responses
  };
}

async function sendMessage(event) {
  event.preventDefault();
  const text = input.value.trim();

  if (!text) {
    return;
  }

  appendMessage(text, 'user');
  input.value = '';
  input.disabled = true;
  form.querySelector('button').disabled = true;

  const typingMessage = appendMessage('', 'system');

  try {
    const result = await getAgentReply(text);
    typingMessage.remove();

    if (Array.isArray(result.responses) && result.responses.length > 0) {
      result.responses.forEach(({ agent, reply }) => appendMessage(reply, 'bot', agent));
    } else if (result?.reply) {
      appendMessage(result.reply, 'bot', result.agent || 'orchestrator');
    } else {
      appendMessage('No specialist matched this prompt.', 'bot', 'orchestrator');
    }
  } catch (error) {
    typingMessage.remove();
    appendMessage(`Oops! ${error.message}`, 'bot', 'system');
  } finally {
    input.disabled = false;
    form.querySelector('button').disabled = false;
    input.focus();
  }
}

async function loadAgentStateFromServer() {
  if (STATIC_SITE) {
    try {
      syncAgentState(JSON.parse(localStorage.getItem('agentState') || '{}'));
    } catch (error) {
      syncAgentState(AGENT_DEFAULTS);
    }
    renderAgentList();
    return;
  }

  try {
    const response = await fetch('/api/agents');
    if (!response.ok) {
      return;
    }

    const data = await response.json().catch(() => ({}));
    syncAgentState(data.agents || AGENT_DEFAULTS);
    renderAgentList();
  } catch (error) {
    renderAgentList();
  }
}

form.addEventListener('submit', sendMessage);
loadAgentStateFromServer();
appendMessage('Hey! I am your classroom AI buddy. Ask me anything.', 'bot', 'general');
