import { describe, expect, test } from 'bun:test'

import { buildTraceTree } from '../src/telemetry/trace-builder'
import type { AgentTelemetryEvent } from '../src/telemetry/agent-telemetry-event'

describe('trace builder', () => {
  test('builds one trace with child tool observations for a turn', () => {
    const events: AgentTelemetryEvent[] = [
      {
        agent: 'ampcode',
        plugin_name: 'ampcode-langfuse-extension',
        plugin_version: '0.0.0',
        event_type: 'agent.start',
        timestamp: '2026-05-30T00:00:00.000Z',
        session_id: 'T-thread',
        run_id: 'T-thread:msg-1',
        span_id: 'agent:T-thread:msg-1',
        status: 'running',
      },
      {
        agent: 'ampcode',
        plugin_name: 'ampcode-langfuse-extension',
        plugin_version: '0.0.0',
        event_type: 'tool.result',
        timestamp: '2026-05-30T00:00:01.000Z',
        session_id: 'T-thread',
        run_id: 'T-thread:msg-1',
        span_id: 'tool-1',
        parent_span_id: 'agent:T-thread:msg-1',
        tool_name: 'Read',
        status: 'done',
      },
      {
        agent: 'ampcode',
        plugin_name: 'ampcode-langfuse-extension',
        plugin_version: '0.0.0',
        event_type: 'agent.end',
        timestamp: '2026-05-30T00:00:02.000Z',
        session_id: 'T-thread',
        run_id: 'T-thread:msg-1',
        span_id: 'agent:T-thread:msg-1',
        status: 'done',
      },
    ]

    expect(buildTraceTree(events)).toEqual({
      session_id: 'T-thread',
      trace_id: 'T-thread:msg-1',
      status: 'done',
      observations: [
        { id: 'agent:T-thread:msg-1', name: 'agent', type: 'agent', status: 'done', children: ['tool-1'] },
        { id: 'tool-1', name: 'tool.Read', type: 'tool', parent_id: 'agent:T-thread:msg-1', status: 'done', children: [] },
      ],
    })
  })
})
