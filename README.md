# ampcode-langfuse-extension

Project-local Amp plugin prototype for exporting Amp agent telemetry in a Langfuse-compatible shape.

This repository currently implements the first usable Langfuse integration milestone from [`docs/initial-plan.md`](docs/initial-plan.md): it listens to Amp plugin lifecycle/tool events, normalizes them into `AgentTelemetryEvent` records, applies privacy defaults, writes local JSONL telemetry, and sends completed Amp turns to Langfuse when credentials are configured.

## Current capabilities

- Registers Amp plugin handlers for:
  - `session.start`
  - `agent.start`
  - `tool.call`
  - `tool.result`
  - `agent.end`
- Emits one normalized event stream per Amp thread/user turn.
- Correlates tool calls with the active agent turn using Amp thread/message IDs and `toolUseID`.
- Derives safe shell/file metadata using Amp plugin helper APIs when available.
- Writes newline-delimited JSON telemetry locally.
- Sends completed agent turns to Langfuse as one trace with child span observations when `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL` are set.
- Keeps prompt, assistant output, and tool I/O capture disabled by default.
- Redacts common secret-bearing fields and token-looking values before output.

## Requirements

- [Amp](https://ampcode.com/) with plugin support.
- [Bun](https://bun.sh/) for tests and the Amp plugin runtime.

For local development/typechecking:

```bash
bun install
```

## Installation

This plugin is already placed where Amp loads project plugins:

```text
.amp/plugins/langfuse.ts
```

To use it in this workspace:

1. Open this project in Amp.
2. Reload plugins from the Amp command palette:

   ```text
   plugins: reload
   ```

3. Start or continue an Amp thread in this workspace.
4. Inspect emitted telemetry at the configured JSONL path. By default:

   ```text
   .amp/langfuse/events.jsonl
   ```

Each line is one normalized telemetry event.

## Configuration

Configuration can be done from Amp or with environment variables.

Recommended first-time setup:

1. Reload plugins from the Amp command palette.
2. Run:

   ```text
   Langfuse: Configure
   ```

3. Enter your Langfuse base URL, public key, and secret key. The plugin stores these in Amp workspace configuration.
4. Run:

   ```text
   Langfuse: Status
   ```

   This reports whether Langfuse export is enabled and which required keys are missing without exposing secrets.

Environment variables are still supported and override Amp workspace configuration. Set variables before starting Amp so the plugin process can read them.

Example:

```bash
export LANGFUSE_DEBUG=true
export LANGFUSE_LOCAL_JSONL_PATH=.amp/langfuse/events.jsonl
amp
```

To send traces to Langfuse, also set your project credentials before starting Amp:

```bash
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_SECRET_KEY=sk-lf-...
export LANGFUSE_BASE_URL=https://cloud.langfuse.com
amp
```

### Environment variables

| Variable | Default | Current behavior |
| --- | --- | --- |
| `LANGFUSE_PUBLIC_KEY` | unset | Langfuse public key. Required for Langfuse export; not required for local JSONL mode. |
| `LANGFUSE_SECRET_KEY` | unset | Langfuse secret key. Required for Langfuse export; not required for local JSONL mode. |
| `LANGFUSE_BASE_URL` | unset | Langfuse host/base URL, for example `https://cloud.langfuse.com`. Required for Langfuse export. |
| `LANGFUSE_HOST` | unset | Backward-compatible alias for `LANGFUSE_BASE_URL`. |
| `LANGFUSE_ENVIRONMENT` | unset | Optional Langfuse trace environment. |
| `LANGFUSE_RELEASE` | unset | Optional Langfuse trace release. |
| `LANGFUSE_SAMPLE_RATE` | `1` | Parsed and clamped to `0..1`; sampling is not yet applied by the local transport. |
| `LANGFUSE_CAPTURE_INPUTS` | `false` | When `true`, captures redacted user prompt text on `agent.start`. |
| `LANGFUSE_CAPTURE_OUTPUTS` | `false` | When `true`, captures redacted `agent.end` messages. |
| `LANGFUSE_CAPTURE_TOOL_IO` | `false` | When `true`, captures redacted tool input/output on tool events. |
| `LANGFUSE_CAPTURE_CWD` | `false` | When `true`, includes redacted shell working-directory metadata. Otherwise shell metadata only includes the command. |
| `LANGFUSE_REDACTION_MODE` | `strict` | Use `off` to disable built-in redaction. Any other value keeps strict redaction. |
| `LANGFUSE_DEBUG` | `false` | When `true`, logs successful telemetry writes through the Amp plugin logger. |
| `LANGFUSE_LOCAL_JSONL_PATH` | `.amp/langfuse/events.jsonl` | Local output file for JSONL telemetry. |

Boolean variables accept `1`, `true`, `yes`, or `on` as true values. Other values are false.

### Amp workspace configuration

`Langfuse: Configure` writes this namespaced shape to Amp workspace configuration:

```ts
{
  langfuse: {
    baseUrl: 'https://cloud.langfuse.com',
    publicKey: 'pk-lf-...',
    secretKey: 'sk-lf-...'
  }
}
```

You can still use environment variables for CI/non-interactive launches or to override workspace configuration temporarily.

## Privacy defaults

The default mode is metadata-only:

```bash
LANGFUSE_CAPTURE_INPUTS=false
LANGFUSE_CAPTURE_OUTPUTS=false
LANGFUSE_CAPTURE_TOOL_IO=false
LANGFUSE_CAPTURE_CWD=false
LANGFUSE_REDACTION_MODE=strict
```

By default, the plugin does **not** capture raw prompts, assistant messages, tool input/output, or shell working directories. File metadata is stored as repo-relative paths when possible rather than absolute local paths.

The strict redactor replaces common credential fields and token-looking strings, including authorization headers, cookies, passwords, API keys, private-key fields, `sk-*` values, and `password=...` fragments.

Only set capture flags to `true` if you are comfortable writing that data to the local JSONL output.

## JSONL output shape

Events use the shared `AgentTelemetryEvent` envelope:

```ts
{
  agent: 'ampcode',
  plugin_name: 'ampcode-langfuse-extension',
  plugin_version: string,
  event_type: 'session.start' | 'agent.start' | 'tool.call' | 'tool.result' | 'agent.end',
  timestamp: string,
  session_id: string,
  run_id: string,
  span_id: string,
  parent_span_id?: string,
  tool_name?: string,
  command_kind?: string,
  status?: 'running' | 'done' | 'error' | 'cancelled',
  input?: unknown,
  output?: unknown,
  error?: unknown,
  metadata?: Record<string, unknown>
}
```

ID conventions:

- `session_id`: Amp thread ID.
- `run_id`: `${thread.id}:${agentStart.id}`.
- Agent span ID: `agent:${run_id}`.
- Tool span ID: Amp `toolUseID`.

## Langfuse output shape

When Langfuse credentials are configured, the plugin buffers events for each Amp user turn and sends them after `agent.end` using Langfuse's public ingestion endpoint:

- Trace name: `ampcode.agent`
- Trace ID: `${thread.id}:${agentStart.id}`
- Session ID: Amp thread ID
- Root span: `agent`
- Child spans: `tool.<tool_name>` for correlated tool calls

The local JSONL transport remains enabled even when Langfuse export is configured, so you can inspect the normalized event stream while debugging.

## Development

Run tests:

```bash
bun test
```

Run TypeScript checks:

```bash
bun run typecheck
```

## Limitations

This is an early integration prototype. It does not yet:

- Capture direct model-call telemetry.
- Capture model/provider parameters, token usage, costs, streaming deltas, or raw model latency.
- Guarantee session teardown, because Amp does not currently document a `session.end` plugin event.
- Emit approval-specific observations, because the plugin currently runs in observability-only mode and always allows tool calls.

Transport failures are caught and logged so telemetry issues do not break Amp execution.

## Roadmap

Next planned milestone: dogfood against a real Langfuse project, confirm the UI trace shape, and then move ingestion to Langfuse's recommended OpenTelemetry path if the Amp plugin runtime supports the required SDK setup cleanly.
