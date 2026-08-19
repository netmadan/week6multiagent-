const { callProxyCompletion } = require('./shared');

async function detectiveReply(message) {
  console.log('[detective] agent selected for message:', message);
  return callProxyCompletion({
    message,
    agentName: 'detective'
  });
}

module.exports = { detectiveReply };
