export type TelemetryEventType = 'session.start' | 'agent.start' | 'tool.call' | 'tool.result' | 'agent.end'

export type TelemetryStatus = 'running' | 'done' | 'error' | 'cancelled'

export interface AgentTelemetryEvent {
  agent: 'ampcode'
  plugin_name: 'ampcode-langfuse-extension'
  plugin_version: string
  event_type: TelemetryEventType
  timestamp: string
  session_id: string
  run_id: string
  span_id: string
  parent_span_id?: string
  user_id_hash?: string
  repo_hash?: string
  cwd_hash?: string
  model?: string
  provider?: string
  tool_name?: string
  command_kind?: string
  status?: TelemetryStatus
  latency_ms?: number
  usage?: unknown
  cost?: unknown
  input?: unknown
  output?: unknown
  error?: unknown
  metadata?: Record<string, unknown>
  tags?: string[]
}
