const messagesEl = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const agentListEl = document.getElementById('agent-list');
const traceListEl = document.getElementById('trace-list');

const PROXY_URL = 'https://vibe-proxy-gqv4.onrender.com/v1/chat/completions';
const PROXY_AUTH_TOKEN = 'sk-vibe-summer-2026';

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
