const { callProxyCompletion } = require('./shared');

async function doctorReply(message) {
  console.log('[doctor] agent selected for message:', message);
  return callProxyCompletion({
    message,
    agentName: 'doctor'
  });
}

module.exports = { doctorReply };
