const { comedianReply } = require('./agents/comedian');
const { doctorReply } = require('./agents/doctor');
const { detectiveReply } = require('./agents/detective');
const { PLANNER_INSTRUCTION, callProxyCompletion } = require('./agents/shared');

const AGENT_NAMES = ['comedian', 'doctor', 'detective'];

const AGENT_CONFIG = {
  comedian: { label: 'Comedian', enabled: true },
  doctor: { label: 'Doctor', enabled: true },
  detective: { label: 'Detective', enabled: true }
};

function normalizeAgentState(agentState = []) {
  return new Set((agentState || []).map((agent) => String(agent).toLowerCase()));
}

function parsePlannerResponse(responseText, disabledAgents = []) {
  const jsonText = responseText.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) {
    return { agents: [], tasks: {} };
  }

  try {
    const plan = JSON.parse(jsonText);
    const disabledSet = normalizeAgentState(disabledAgents);
    const agents = Array.isArray(plan.agents)
      ? plan.agents.filter((agent, index, list) => AGENT_NAMES.includes(agent)
        && !disabledSet.has(agent)
        && list.indexOf(agent) === index
        && typeof plan.tasks?.[agent] === 'string'
        && plan.tasks[agent].trim())
      : [];
    const tasks = Object.fromEntries(agents.map((agent) => [agent, plan.tasks[agent].trim()]));
    return { agents, tasks };
  } catch (error) {
    return { agents: [], tasks: {} };
  }
}

async function planAgents(message, disabledAgents = []) {
  const plannerReply = await callProxyCompletion({
    message,
    agentName: 'planner',
    systemInstruction: PLANNER_INSTRUCTION
  });
  return parsePlannerResponse(plannerReply, disabledAgents);
}

async function runAgent(message, agentName) {
  switch (agentName) {
    case 'comedian':
      return comedianReply(message);
    case 'doctor':
      return doctorReply(message);
    case 'detective':
      return detectiveReply(message);
    default:
      throw new Error(`Unsupported agent: ${agentName}`);
  }
}

async function orchestrateChat(message, disabledAgents = []) {
  const plan = await planAgents(message, disabledAgents);
  const { agents } = plan;
  console.log('[orchestrator] selected agents for prompt:', agents, '| prompt:', message);

  if (agents.length === 0) {
    const fallbackReply = 'No specialist agent matched this prompt.';
    return {
      agent: null,
      agents: [],
      reply: fallbackReply,
      responses: []
    };
  }

  const responses = [];

  for (const agent of agents) {
    const reply = await runAgent(plan.tasks[agent], agent);
    responses.push({ agent, reply });
  }

  if (responses.length === 1) {
    const [{ agent, reply }] = responses;
    return {
      agent,
      agents,
      reply,
      responses
    };
  }

  const reply = responses
    .map(({ agent, reply: responseText }) => `[${agent}] ${responseText}`)
    .join('\n\n');

  return {
    agent: agents[0],
    agents,
    reply,
    responses
  };
}

module.exports = {
  AGENT_CONFIG,
  parsePlannerResponse,
  planAgents,
  orchestrateChat,
};
