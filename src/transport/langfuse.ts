import type { LangfuseExtensionConfig } from '../config/env'
import type { AgentTelemetryEvent } from '../telemetry/agent-telemetry-event'
import { createAgentSpanID, createRunKey } from '../adapter/ids'

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

interface LangfuseTransportOptions {
  config: LangfuseExtensionConfig
  fetch?: FetchLike
}

interface SpanDraft {
  first: AgentTelemetryEvent
  latest: AgentTelemetryEvent
  metadata: Record<string, unknown>
}

interface RunDraft {
  events: AgentTelemetryEvent[]
  spans: Map<string, SpanDraft>
}

export class LangfuseTransport {
  private readonly fetch: FetchLike
  private readonly runs = new Map<string, RunDraft>()

  constructor(private readonly options: LangfuseTransportOptions) {
    this.fetch = options.fetch ?? fetch
  }

  async emit(event: AgentTelemetryEvent): Promise<void> {
    if (!this.enabled()) return
    if (event.event_type === 'session.start') return

    const draft = this.draftFor(event.run_id)
    draft.events.push(event)
    const existing = draft.spans.get(event.span_id)
    draft.spans.set(event.span_id, {
      first: existing?.first ?? event,
      latest: event,
      metadata: { ...existing?.metadata, ...event.metadata },
    })

    if (event.event_type === 'agent.end') {
      this.mergeOrphanRunInto(event, draft)
      await this.sendRun(event.run_id, draft)
      this.runs.delete(event.run_id)
    }
  }

  async flush(): Promise<void> {
    if (!this.enabled()) return
    for (const [runID, draft] of [...this.runs.entries()]) {
      await this.sendRun(runID, draft)
      this.runs.delete(runID)
    }
  }

  private enabled(): boolean {
    return Boolean(this.options.config.publicKey && this.options.config.secretKey && this.options.config.baseUrl)
  }

  private draftFor(runID: string): RunDraft {
    const existing = this.runs.get(runID)
    if (existing) return existing
    const created: RunDraft = { events: [], spans: new Map() }
    this.runs.set(runID, created)
    return created
  }

  private mergeOrphanRunInto(event: AgentTelemetryEvent, draft: RunDraft): void {
    const orphanRunID = createRunKey(event.session_id, 'unknown')
    if (orphanRunID === event.run_id) return

    const orphan = this.runs.get(orphanRunID)
    if (!orphan) return

    draft.events = [...orphan.events, ...draft.events]
    draft.spans = new Map([...orphan.spans, ...draft.spans])
    this.runs.delete(orphanRunID)
  }

  private async sendRun(runID: string, draft: RunDraft): Promise<void> {
    if (!draft.events.length) return
    const first = draft.events[0]
    if (!first) return

    const payload = { batch: [this.traceCreate(runID, draft), ...[...draft.spans.values()].map((span) => this.spanCreate(runID, span))] }
    const response = await this.fetch(`${this.options.config.baseUrl?.replace(/\/$/, '')}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${this.options.config.publicKey}:${this.options.config.secretKey}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok && response.status !== 207) {
      throw new Error(`Langfuse ingestion failed with HTTP ${response.status}`)
    }
  }

  private traceCreate(runID: string, draft: RunDraft) {
    const first = draft.events[0]
    const end = lastEvent(draft.events, 'agent.end')
    if (!first) throw new Error('Cannot create Langfuse trace without events')
    return compact({
      id: `trace-create:${runID}`,
      type: 'trace-create',
      timestamp: first.timestamp,
      body: compact({
        id: runID,
        name: 'ampcode.agent',
        sessionId: first.session_id,
        input: first.input,
        output: end?.output,
        release: this.options.config.release,
        environment: this.options.config.environment,
        metadata: {
          agent: first.agent,
          plugin: first.plugin_name,
          pluginVersion: first.plugin_version,
        },
      }),
    })
  }

  private spanCreate(runID: string, span: SpanDraft) {
    const { first, latest } = span
    return compact({
      id: `span-create:${span.first.span_id}`,
      type: 'span-create',
      timestamp: first.timestamp,
      body: compact({
        id: first.span_id,
        traceId: runID,
        parentObservationId: first.parent_span_id ?? (first.event_type.startsWith('tool.') ? createAgentSpanID(runID) : undefined),
        name: observationName(latest),
        startTime: first.timestamp,
        endTime: latest.event_type.endsWith('.end') || latest.event_type.endsWith('.result') ? latest.timestamp : undefined,
        input: first.input,
        output: latest.output,
        metadata: compact({
          eventType: latest.event_type,
          status: latest.status,
          ...span.metadata,
        }),
      }),
    })
  }
}

function lastEvent(events: AgentTelemetryEvent[], eventType: AgentTelemetryEvent['event_type']): AgentTelemetryEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.event_type === eventType) return event
  }
  return undefined
}

function observationName(event: AgentTelemetryEvent): string {
  if (event.event_type.startsWith('agent.')) return 'agent'
  if (event.event_type.startsWith('tool.')) return `tool.${event.tool_name ?? 'unknown'}`
  return event.event_type
}

function compact<T extends Record<string, unknown>>(object: T): T {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as T
}
