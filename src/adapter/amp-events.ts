import { createAgentSpanID, createRunKey, createSessionSpanID, type ThreadMessageID } from './ids'
import type { LangfuseExtensionConfig } from '../config/env'
import { createDefaultConfig } from '../config/env'
import { redactValue, relativePathMetadata } from '../redaction/redact'
import type { AgentTelemetryEvent, TelemetryStatus } from '../telemetry/agent-telemetry-event'

interface ThreadRef {
  thread: { id: string }
}

export interface AgentStartLikeEvent extends ThreadRef {
  id: ThreadMessageID
  message: string
}

export interface AgentEndLikeEvent extends AgentStartLikeEvent {
  status: 'done' | 'error' | 'cancelled'
  messages: unknown[]
}

export interface ToolCallLikeEvent extends ThreadRef {
  toolUseID: string
  tool: string
  input: Record<string, unknown>
}

export interface ToolResultLikeEvent extends ToolCallLikeEvent {
  status: 'done' | 'error' | 'cancelled'
  error?: string
  output?: unknown
}

interface ShellCommandMetadata {
  command: string
  dir?: string
}

interface URIish {
  toString(): string
}

export interface AmpTelemetryHelpers {
  shellCommandFromToolCall?: (event: ToolCallLikeEvent | ToolResultLikeEvent) => ShellCommandMetadata | null
  filesModifiedByToolCall?: (event: ToolCallLikeEvent | ToolResultLikeEvent) => URIish[] | null
  filePathFromURI?: (uri: URIish) => string
}

export interface AmpTelemetryAdapterOptions {
  config?: LangfuseExtensionConfig
  now?: () => string
  helpers?: AmpTelemetryHelpers
  workspaceRoot?: string
  pluginVersion?: string
}

interface RunState {
  threadID: string
  messageID: ThreadMessageID
  runID: string
  agentSpanID: string
}

export function createAmpTelemetryAdapter(options: AmpTelemetryAdapterOptions = {}) {
  const config = options.config ?? createDefaultConfig()
  const now = options.now ?? (() => new Date().toISOString())
  const pluginVersion = options.pluginVersion ?? '0.0.0'
  const activeRunsByThread = new Map<string, RunState>()

  function base(event: ThreadRef, fields: Omit<AgentTelemetryEvent, 'agent' | 'plugin_name' | 'plugin_version' | 'timestamp' | 'session_id'>): AgentTelemetryEvent {
    return {
      agent: 'ampcode',
      plugin_name: 'ampcode-langfuse-extension',
      plugin_version: pluginVersion,
      timestamp: now(),
      session_id: event.thread.id,
      ...fields,
    }
  }

  function currentRun(threadID: string): RunState | undefined {
    return activeRunsByThread.get(threadID)
  }

  function fallbackRun(threadID: string): RunState {
    const runID = createRunKey(threadID, 'unknown')
    return { threadID, messageID: 'unknown', runID, agentSpanID: createAgentSpanID(runID) }
  }

  function maybeRedact(value: unknown): unknown {
    return config.redactionMode === 'off' ? value : redactValue(value)
  }

  function metadataForTool(event: ToolCallLikeEvent | ToolResultLikeEvent): Record<string, unknown> | undefined {
    const metadata: Record<string, unknown> = {}
    const shell = options.helpers?.shellCommandFromToolCall?.(event)
    if (shell) {
      metadata.shell = config.captureCwd ? maybeRedact(shell) : { command: maybeRedact(shell.command) }
    }
    const files = options.helpers?.filesModifiedByToolCall?.(event)
    if (files?.length) {
      metadata.files = files.map((uri) => {
        const path = options.helpers?.filePathFromURI?.(uri) ?? uri.toString().replace(/^file:\/\//, '')
        return relativePathMetadata(path, options.workspaceRoot)
      })
    }
    return Object.keys(metadata).length ? metadata : undefined
  }

  return {
    onSessionStart(event: ThreadRef): AgentTelemetryEvent {
      return base(event, {
        event_type: 'session.start',
        run_id: createRunKey(event.thread.id, 'session'),
        span_id: createSessionSpanID(event.thread.id),
      })
    },

    onAgentStart(event: AgentStartLikeEvent): AgentTelemetryEvent {
      const runID = createRunKey(event.thread.id, event.id)
      const run: RunState = { threadID: event.thread.id, messageID: event.id, runID, agentSpanID: createAgentSpanID(runID) }
      activeRunsByThread.set(event.thread.id, run)
      return base(event, {
        event_type: 'agent.start',
        run_id: run.runID,
        span_id: run.agentSpanID,
        status: 'running',
        ...(config.captureInputs ? { input: maybeRedact({ message: event.message }) } : {}),
      })
    },

    onToolCall(event: ToolCallLikeEvent): AgentTelemetryEvent {
      const run = currentRun(event.thread.id) ?? fallbackRun(event.thread.id)
      const hasActiveRun = currentRun(event.thread.id) !== undefined
      const metadata = metadataForTool(event)
      return base(event, {
        event_type: 'tool.call',
        run_id: run.runID,
        span_id: event.toolUseID,
        ...(hasActiveRun ? { parent_span_id: run.agentSpanID } : {}),
        tool_name: event.tool,
        ...(metadata?.shell ? { command_kind: 'shell' } : {}),
        status: 'running',
        ...(config.captureToolIo ? { input: maybeRedact(event.input) } : {}),
        ...(metadata ? { metadata } : {}),
      })
    },

    onToolResult(event: ToolResultLikeEvent): AgentTelemetryEvent {
      const run = currentRun(event.thread.id) ?? fallbackRun(event.thread.id)
      const hasActiveRun = currentRun(event.thread.id) !== undefined
      const metadata = metadataForTool(event)
      return base(event, {
        event_type: 'tool.result',
        run_id: run.runID,
        span_id: event.toolUseID,
        ...(hasActiveRun ? { parent_span_id: run.agentSpanID } : {}),
        tool_name: event.tool,
        ...(metadata?.shell ? { command_kind: 'shell' } : {}),
        status: event.status as TelemetryStatus,
        ...(config.captureToolIo ? { input: maybeRedact(event.input), output: maybeRedact(event.output) } : {}),
        ...(event.error ? { error: maybeRedact(event.error) } : {}),
        ...(metadata ? { metadata } : {}),
      })
    },

    onAgentEnd(event: AgentEndLikeEvent): AgentTelemetryEvent {
      const run = currentRun(event.thread.id) ?? fallbackRun(event.thread.id)
      const telemetry = base(event, {
        event_type: 'agent.end',
        run_id: run.runID,
        span_id: run.agentSpanID,
        status: event.status,
        ...(config.captureOutputs ? { output: maybeRedact({ messages: event.messages }) } : {}),
      })
      activeRunsByThread.delete(event.thread.id)
      return telemetry
    },
  }
}
