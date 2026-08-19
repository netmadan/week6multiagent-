const { callProxyCompletion } = require('./shared');

async function comedianReply(message) {
  console.log('[comedian] agent selected for message:', message);
  return callProxyCompletion({
    message,
    agentName: 'comedian'
  });
}

module.exports = { comedianReply };
