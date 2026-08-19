const PROXY_URL = 'https://vibe-proxy-gqv4.onrender.com/v1/chat/completions';
const PROXY_AUTH_TOKEN = 'sk-vibe-summer-2026';
const AGENT_INSTRUCTIONS = {
  comedian: 'You are the comedian specialist. Answer only the joke or humor portion of the user request. Do not answer medical, detective, or other unrelated portions. Be playful and lighthearted.',
  doctor: 'You are the doctor specialist. Answer only the health or medical portion of the user request. Be empathetic, knowledgeable, and careful. Do not tell jokes or answer detective or other unrelated portions.',
  detective: 'You are the detective specialist. Answer only the mystery, investigation, or crime portion of the user request. Be analytical and focused. Do not tell jokes, give medical advice, or answer other unrelated portions.'
};
const PLANNER_INSTRUCTION = `You are an agent-routing planner. Analyze every distinct task in the user's request and assign each task to the best specialist, in the same requested order. If a prompt asks for a joke AND health information, include both comedian and doctor; never merge distinct tasks into one task.
Available specialists: comedian, doctor, detective.
Return only valid JSON in this exact shape: {"agents":["comedian"],"tasks":{"comedian":"the exact task for the comedian"}}.
Include only specialists that have a meaningful task. Each task must contain only that specialist's portion of the request, with references such as "that" resolved to their subject. Never answer the user, explain your choices, or include any other keys.`;

async function callProxyCompletion({ message, agentName = 'general', systemInstruction: customInstruction }) {
  const systemInstruction = customInstruction || AGENT_INSTRUCTIONS[agentName];
  const requestBody = {
    model: 'class-chat-model',
    messages: [
      ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
      { role: 'user', content: message }
    ]
  };

  console.log(`[${agentName}] starting proxy call`, {
    url: PROXY_URL,
    requestBody
  });

  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PROXY_AUTH_TOKEN}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`[${agentName}] proxy response status`, response.status);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const messageText = errorBody?.error?.message || 'Proxy request failed';
      console.error(`[${agentName}] proxy request failed`, messageText);
      return `Echo: ${message}`;
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || 'No response from model.';
    console.log(`[${agentName}] proxy reply`, reply);
    return reply;
  } catch (error) {
    console.error(`[${agentName}] proxy fetch error`, error);
    return `Echo: ${message}`;
  }
}

module.exports = { AGENT_INSTRUCTIONS, PLANNER_INSTRUCTION, callProxyCompletion };
