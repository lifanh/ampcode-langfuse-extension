## Context

This page tracks the AmpCode-specific Langfuse extension work. Keep implementation details here so the parent project page can remain the shared cross-agent plan.

## Current Direction

Build an Amp plugin MVP using the public Plugin API.

Primary objective:

- Implement handlers for `session.start`, `agent.start`, `tool.call`, `tool.result`, and `agent.end`.
- Build a thin adapter that translates Amp-native plugin events into the shared `AgentTelemetryEvent` contract.
- Emit one trace per Amp user turn, with child observations for tool calls and safely derived shell/file metadata.
- Keep Langfuse transport, redaction, config, and tests aligned with the cross-agent extension plan.
- Treat direct model-call telemetry, token usage, streaming deltas, and guaranteed session teardown as future API-dependent enhancements.

## Initial Repository Shape

Recommended standalone repo:

```
/ampcode-langfuse
  /src
    plugin.ts
    adapter/
      amp-events.ts
      event-store.ts
      ids.ts
    config/
    redaction/
    telemetry/
      agent-telemetry-event.ts
      trace-builder.ts
    transport/
      langfuse.ts
      noop.ts
  /test
    fixtures/
    golden/
  /examples
  /docs
    trace-schema.md
    redaction-policy.md
    release-checklist.md
```

## Resolved API Findings

Public Amp Plugin API findings:

1. Extension API
    - Amp exposes an official TypeScript plugin API via `@ampcode/plugin`.
    - Plugins are TypeScript files loaded by Amp and executed with Bun.
    - Plugins register event handlers with `amp.on(...)`.
    - Plugin-load initialization belongs in the exported function body.
2. Agent lifecycle
    - `session.start` fires when a thread session starts.
    - There is no documented `session.end` event.
    - `agent.start` and `agent.end` bracket each user turn.
    - `agent.end` exposes turn status: `done`, `error`, or `cancelled`.
3. Tool calls
    - `tool.call` fires before a tool runs.
    - `tool.result` fires after a tool runs.
    - `toolUseID` is the stable correlation ID.
    - Tool name, input, status, output, and error are available.
4. File and shell activity
    - `amp.helpers.shellCommandFromToolCall(...)` can derive shell commands from supported tool calls.
    - `amp.helpers.filesModifiedByToolCall(...)` can derive modified files from supported edit/create/patch tools and some shell commands.
    - Treat file activity as safely derived metadata, not as a complete file access audit.
5. LLM calls
    - The public Plugin API does not expose direct model-call hooks.
    - Do not promise provider, model, parameters, token usage, streaming deltas, or raw model latency in the MVP.
    - Final assistant output may be reconstructed from `agent.end` messages only when output capture is explicitly enabled.
6. Permissions and approvals
    - `tool.call` can allow, reject, modify, synthesize, or error a tool call.
    - In observability-only mode, always return `{ action: "allow" }`.
    - Only emit approval-specific observations if this plugin later adds its own approval policy.
7. Shutdown and flushing
    - There is no documented session teardown hook.
    - Flush after `agent.end`.
    - Also flush on process exit if available, but do not rely on it.

## Adapter Strategy

Keep the AmpCode adapter thin.

Responsibilities:

- Extract AmpCode-native event fields.
- Validate event shape at runtime.
- Normalize to `AgentTelemetryEvent`.
- Preserve stable IDs and parent/child relationships.
- Avoid Langfuse-specific logic inside the adapter.

Non-responsibilities:

- Redaction implementation
- Langfuse SDK setup
- Retry/queue behavior
- Config file loading
- Score calculation

## Shared Event Mapping Target

Map AmpCode events into the shared envelope:

```
AgentTelemetryEvent {
  agent
  plugin_name
  plugin_version
  event_type
  timestamp
  session_id
  run_id
  span_id
  parent_span_id
  user_id_hash?
  repo_hash?
  cwd_hash?
  model?
  provider?
  tool_name?
  command_kind?
  status?
  latency_ms?
  usage?
  cost?
  input?
  output?
  error?
  metadata?
  tags?
}
```

## Trace Model

Target Langfuse shape:

- Session: one Langfuse session per Amp thread.
- Trace: one trace per user prompt / agent turn.
- Root observation: `agent`.
- Child observations:
    - `tool.<tool_name>`
    - `shell.command` when derived from a tool call
    - `file.write` / `file.patch` when derived from a tool call
    - `agent.cancelled`
    - `agent.error`

Optional future observations:

- `llm.generate` if Amp exposes model-call hooks later.
- `approval.request`, `approval.granted`, and `approval.denied` if this plugin later enforces an approval policy.

ID model:

```
session_id = amp.thread.id
run_id = `${thread.id}:${agentStart.id}`
tool_span_id = toolUseID
```

Because Amp plugins are long-lived and may handle multiple threads concurrently, keep run state in a map keyed by `thread.id + agent.start.id`, not in a single global current trace.

## Privacy Defaults

Use the same safe defaults as the Pi extension plan:

- Metadata-only tracing by default.
- `LANGFUSE_CAPTURE_INPUTS=false`
- `LANGFUSE_CAPTURE_OUTPUTS=false`
- `LANGFUSE_CAPTURE_TOOL_IO=false`
- `LANGFUSE_CAPTURE_SYSTEM_PROMPT=false`
- `LANGFUSE_CAPTURE_CWD=false`
- Use repo-relative file paths by default when file-path metadata is captured.
- Hash or redact repository, branch, cwd, and absolute local path values by default.
- Never capture environment variables wholesale.
- Never emit raw credentials, auth headers, cookies, private keys, `.env` content, or token-looking values.

## Config

Support environment variables first:

```
LANGFUSE_PUBLIC_KEY
LANGFUSE_SECRET_KEY
LANGFUSE_BASE_URL
LANGFUSE_ENVIRONMENT
LANGFUSE_RELEASE
LANGFUSE_SAMPLE_RATE
LANGFUSE_CAPTURE_INPUTS
LANGFUSE_CAPTURE_OUTPUTS
LANGFUSE_CAPTURE_TOOL_IO
LANGFUSE_CAPTURE_CWD
LANGFUSE_REDACTION_MODE
LANGFUSE_DEBUG
```

Support `LANGFUSE_HOST` only as a backward-compatible alias for `LANGFUSE_BASE_URL`.

If Amp local plugin configuration is useful later, add namespaced config keys via `amp.configuration`. Environment variables should remain the CI/non-interactive path.

## Test Plan

Minimum tests before adoption:

- Adapter event-shape tests for every observed AmpCode hook.
- Golden trace-shape tests for:
    - Prompt-only run
    - Tool-using run
    - Failed tool
    - Shell command
    - File edit
    - Provider error
    - Approval denied
    - Cancellation/interruption
    - Multi-turn session
- Redaction tests with seeded secrets in:
    - Prompts
    - Tool arguments
    - Tool output
    - Shell output
    - File paths
    - Error stacks
    - Headers
- Capture-flag tests proving disabled fields are absent.
- Shutdown/flush tests.
- Transport-failure tests proving AmpCode execution is never broken by Langfuse failures.

## First Implementation Milestone

Milestone 0: Amp plugin observability prototype.

Deliverables:

- `.amp/plugins/langfuse.ts` plugin entry.
- Handlers for `session.start`, `agent.start`, `tool.call`, `tool.result`, and `agent.end`.
- In-memory run/span correlation by thread ID, message ID, and `toolUseID`.
- Local JSONL output of normalized `AgentTelemetryEvent` objects.
- Privacy defaults enforced before writing JSONL.
- Fixture events saved under `/test/fixtures`.
- Initial golden trace JSON under `/test/golden`.

Golden scenarios:

- Prompt-only turn
- Successful tool call
- Failed tool call
- Shell command tool
- File-modifying tool
- Cancelled/error agent turn

Exit criteria:

- One real Amp turn produces a complete local trace tree.
- Langfuse credentials are not required.
- Unknown or missing fields are handled safely.
- No sensitive content is emitted unless explicitly enabled.

Milestone 1: Langfuse transport.

Deliverables:

- Validate Langfuse JS/TS SDK compatibility inside Amp’s Bun plugin runtime.
- Prefer `@langfuse/tracing` + `@langfuse/otel` if compatible.
- Fall back to direct Langfuse API/client transport if OpenTelemetry setup is not compatible.
- Keep a no-op/local transport available for missing credentials or failures.
- Emit one Langfuse trace per Amp user turn.
- Emit child observations for paired `tool.call` / `tool.result` events.
- Flush after `agent.end`.

Exit criteria:

- Missing Langfuse credentials are a no-op.
- Transport failures never affect Amp execution.
- At least one real Amp run produces a verified Langfuse trace.

## Release Criteria

Do not publish a stable release until:

- Amp Plugin API hook coverage is documented.
- Unsupported telemetry is explicitly documented: direct model calls, token usage, streaming deltas, and session teardown.
- Privacy defaults are safe.
- Redaction tests pass.
- Content capture is opt-in and documented.
- Missing Langfuse credentials are a no-op.
- Transport failures never affect Amp execution.
- At least one real Amp run produces a verified Langfuse trace.
- README explains install, config, privacy controls, limitations, and troubleshooting.

## Decisions

- Final package name: `ampcode-langfuse-extension`.
- Integration approach: use Amp’s public extension hooks through the Plugin API; no wrapper approach for the MVP.
- Model output capture: metadata-only by default. Do not capture streaming deltas or final model output unless future API support and explicit opt-in settings justify it.
- File paths: use repo-relative paths when file-path metadata is captured; continue to avoid absolute local paths by default.
