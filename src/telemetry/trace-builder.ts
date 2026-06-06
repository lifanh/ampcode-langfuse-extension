import type { AgentTelemetryEvent } from './agent-telemetry-event'

export interface TraceObservation {
  id: string
  name: string
  type: 'agent' | 'tool' | 'event'
  parent_id?: string
  status?: string
  children: string[]
}

export interface TraceTree {
  session_id: string
  trace_id: string
  status?: string
  observations: TraceObservation[]
}

export function buildTraceTree(events: AgentTelemetryEvent[]): TraceTree {
  if (!events[0]) throw new Error('Cannot build a trace from no events')
  const observations = new Map<string, TraceObservation>()
  let status: string | undefined

  for (const event of events) {
    if (event.event_type === 'session.start') continue
    const existing = observations.get(event.span_id)
    const observation: TraceObservation = existing ?? {
      id: event.span_id,
      name: observationName(event),
      type: observationType(event),
      ...(event.parent_span_id ? { parent_id: event.parent_span_id } : {}),
      children: [],
    }
    if (event.status) observation.status = event.status
    observations.set(event.span_id, observation)
    if (event.event_type === 'agent.end') status = event.status
  }

  for (const observation of observations.values()) {
    if (observation.parent_id) observations.get(observation.parent_id)?.children.push(observation.id)
  }

  return {
    session_id: events[0].session_id,
    trace_id: events[0].run_id,
    ...(status ? { status } : {}),
    observations: [...observations.values()],
  }
}

function observationName(event: AgentTelemetryEvent): string {
  if (event.event_type.startsWith('agent.')) return 'agent'
  if (event.event_type.startsWith('tool.')) return `tool.${event.tool_name ?? 'unknown'}`
  return event.event_type
}

function observationType(event: AgentTelemetryEvent): TraceObservation['type'] {
  if (event.event_type.startsWith('agent.')) return 'agent'
  if (event.event_type.startsWith('tool.')) return 'tool'
  return 'event'
}
