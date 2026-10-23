// @file: Whitelisted public terminal facts, without provider error bodies or private reasoning.
// @spec: AI-SKILLS
// @consumers: live calibration diagnostics; safe terminal projection tests

/** @purpose Preserve enough terminal identity to diagnose an empty reply before deleting its session. */
export function projectAuthoringJudgeTerminal(messages: unknown) {
  if (!Array.isArray(messages) || messages.length > 512)
    throw new Error('Missing or oversized judge message capture');
  const message = messages
    .slice()
    .reverse()
    .find((row) => row?.info?.role === 'assistant');
  const info = message?.info;
  for (const key of ['id', 'sessionID', 'providerID', 'modelID'])
    if (typeof info?.[key] !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(info[key]))
      throw new Error('Incomplete public judge terminal identity');
  if (!Array.isArray(message.parts)) throw new Error('Missing judge parts capture');
  const knownErrors = [
    'APIError',
    'ProviderAuthError',
    'UnknownError',
    'MessageAbortedError',
    'MessageOutputLengthError',
    'ContextOverflowError',
  ];
  return {
    messageId: info.id as string,
    sessionId: info.sessionID as string,
    model: `${info.providerID}/${info.modelID}`,
    finish: ['stop', 'length', 'tool-calls', 'error'].includes(info.finish)
      ? (info.finish as string)
      : 'unknown',
    errorPresent: info.error !== undefined && info.error !== null,
    errorName: info.error
      ? knownErrors.includes(info.error.name)
        ? (info.error.name as string)
        : 'unknown'
      : null,
    publicTextPresent: message.parts.some(
      (part: { type?: unknown; text?: unknown }) =>
        part?.type === 'text' && typeof part.text === 'string' && !!part.text.trim()
    ),
  };
}
