# ampcode-langfuse-extension

Amp plugin for exporting Amp agent telemetry to [Langfuse](https://langfuse.com/).

Install the bundled plugin file, reload Amp plugins, run `Langfuse: Configure`, and each completed Amp turn is sent to Langfuse as a trace with child spans for tool calls.

## Quick start: install and configure

### 1. Download or copy the plugin file

The file end users need is:

```text
dist/langfuse.ts
```

You do **not** need to install this whole repository to use the extension. Download `dist/langfuse.ts` from the latest release, or from this repository if you cloned it.

If you downloaded it to your Downloads folder, the source path is probably:

```text
~/Downloads/langfuse.ts
```

Maintainers can rebuild the artifact with:

```bash
bun run build:plugin
```

### 2. Copy it to an Amp plugins/extensions folder

For a user-wide install, copy it to Amp's global plugins folder. Use this if you want Langfuse telemetry in every Amp workspace:

```bash
mkdir -p ~/.config/amp/plugins
cp dist/langfuse.ts ~/.config/amp/plugins/langfuse.ts
```

If you downloaded the file instead of cloning the repo:

```bash
mkdir -p ~/.config/amp/plugins
cp ~/Downloads/langfuse.ts ~/.config/amp/plugins/langfuse.ts
```

Or, for a single-workspace install, copy it into that repository. Use this if you only want the extension enabled for one project:

```bash
mkdir -p .amp/plugins
cp dist/langfuse.ts .amp/plugins/langfuse.ts
```

If installing directly from GitHub, replace `<owner>` and `<version>` with the repository owner and release tag:

```bash
mkdir -p ~/.config/amp/plugins
curl -fsSL https://raw.githubusercontent.com/<owner>/ampcode-langfuse-extension/<version>/dist/langfuse.ts \
  -o ~/.config/amp/plugins/langfuse.ts
```

### 3. Reload Amp plugins

In Amp, open the command palette and run:

```text
plugins: reload
```

### 4. Configure Langfuse credentials

Run this command from the Amp command palette:

```text
Langfuse: Configure
```

Enter:

- Langfuse base URL, for example `https://cloud.langfuse.com` or `https://us.cloud.langfuse.com`
- Langfuse public key
- Langfuse secret key

Then confirm setup with:

```text
Langfuse: Status
```

The status command reports whether Langfuse export is enabled, which required settings are missing, and the current capture settings without exposing secrets.

### 5. Start using Amp

Start or continue an Amp thread in the workspace. After each Amp turn ends, the plugin sends one Langfuse trace:

- Trace name: `ampcode.agent`
- Trace ID: `<amp-thread-id>:<amp-message-id>`
- Session ID: Amp thread ID
- Child spans: correlated tool calls

The plugin also writes local JSONL telemetry for debugging. By default:

```text
.amp/langfuse/events.jsonl
```

For the full onboarding guide, including upgrade and uninstall steps, see [`docs/onboarding.md`](docs/onboarding.md).

## What gets captured

By default, this plugin is metadata-only:

- It records Amp session, agent, and tool lifecycle events.
- It records safe derived metadata such as tool names, statuses, shell command strings, and repo-relative modified file paths when available.
- It does **not** capture raw prompts, assistant output, tool input/output, or shell working directories by default.
- It redacts common credential fields and token-looking values before local JSONL output or Langfuse export.

To opt into richer content capture, run:

```text
Langfuse: Configure Capture
```

You can toggle:

- user prompt capture (`captureInputs`)
- assistant output capture (`captureOutputs`)
- tool input/output capture (`captureToolIo`)
- shell working-directory capture (`captureCwd`)

Only enable these if you are comfortable writing that data to local JSONL telemetry and sending it to Langfuse.

## Configuration

Most users should configure from Amp with `Langfuse: Configure`. Environment variables are also supported and override Amp workspace configuration. Set variables before starting Amp so the plugin process can read them.

To send traces to Langfuse without using the command-palette setup:

```bash
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_SECRET_KEY=sk-lf-...
export LANGFUSE_BASE_URL=https://cloud.langfuse.com
amp
```

Optional local-debug settings:

```bash
export LANGFUSE_DEBUG=true
export LANGFUSE_LOCAL_JSONL_PATH=.amp/langfuse/events.jsonl
amp
```

If you install the plugin globally and relative JSONL paths resolve somewhere unexpected, set `LANGFUSE_LOCAL_JSONL_PATH` to an absolute path.

### Command-palette commands

- `Langfuse: Configure` — save Langfuse base URL, public key, and secret key in Amp workspace configuration.
- `Langfuse: Status` — show export status, missing settings, local JSONL path, and capture settings without exposing secrets.
- `Langfuse: Configure Capture` — opt into or out of prompt/output/tool/cwd capture.

### Environment variables

| Variable | Default | Current behavior |
| --- | --- | --- |
| `LANGFUSE_PUBLIC_KEY` | unset | Langfuse public key. Required for Langfuse export; not required for local JSONL mode. |
| `LANGFUSE_SECRET_KEY` | unset | Langfuse secret key. Required for Langfuse export; not required for local JSONL mode. |
| `LANGFUSE_BASE_URL` | unset | Langfuse host/base URL, for example `https://cloud.langfuse.com`. Required for Langfuse export. |
| `LANGFUSE_HOST` | unset | Backward-compatible alias for `LANGFUSE_BASE_URL`. |
| `LANGFUSE_ENVIRONMENT` | unset | Optional Langfuse trace environment. |
| `LANGFUSE_RELEASE` | unset | Optional Langfuse trace release. |
| `LANGFUSE_SAMPLE_RATE` | `1` | Parsed and clamped to `0..1`; sampling is not yet applied by the current transports. |
| `LANGFUSE_CAPTURE_INPUTS` | `false` | When `true`, captures redacted user prompt text on `agent.start`. |
| `LANGFUSE_CAPTURE_OUTPUTS` | `false` | When `true`, captures redacted `agent.end` messages. |
| `LANGFUSE_CAPTURE_TOOL_IO` | `false` | When `true`, captures redacted tool input/output on tool events. |
| `LANGFUSE_CAPTURE_CWD` | `false` | When `true`, includes redacted shell working-directory metadata. Otherwise shell metadata only includes the command. |
| `LANGFUSE_REDACTION_MODE` | `strict` | Use `off` to disable built-in redaction. Any other value keeps strict redaction. |
| `LANGFUSE_DEBUG` | `false` | When `true`, logs successful telemetry writes through the Amp plugin logger. |
| `LANGFUSE_LOCAL_JSONL_PATH` | `.amp/langfuse/events.jsonl` | Local output file for JSONL telemetry. |

Boolean variables accept `1`, `true`, `yes`, or `on` as true values. Other values are false.

### Amp workspace configuration

`Langfuse: Configure` and `Langfuse: Configure Capture` write Langfuse settings through Amp workspace configuration. Depending on how Amp stores plugin settings, the persisted key may be `langfuse` or the namespaced `amp.langfuse`; the plugin reads both forms.

```ts
{
  'amp.langfuse': {
    baseUrl: 'https://cloud.langfuse.com',
    publicKey: 'pk-lf-...',
    secretKey: 'sk-lf-...',
    captureInputs: false,
    captureOutputs: false,
    captureToolIo: false,
    captureCwd: false
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

Only set capture flags to `true` if you are comfortable writing that data to the local JSONL output and sending it to Langfuse when export is configured.

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

End users only need [Amp](https://ampcode.com/) with plugin support. Development requires [Bun](https://bun.sh/).

Install dependencies:

```bash
bun install
```

Build the standalone plugin artifact:

```bash
bun run build:plugin
```

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
