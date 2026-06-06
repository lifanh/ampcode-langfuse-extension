export type ThreadMessageID = string | number

export function createRunKey(threadID: string, messageID: ThreadMessageID | 'unknown'): string {
  return `${threadID}:${String(messageID)}`
}

export function createAgentSpanID(runID: string): string {
  return `agent:${runID}`
}

export function createSessionSpanID(threadID: string): string {
  return `session:${threadID}`
}
