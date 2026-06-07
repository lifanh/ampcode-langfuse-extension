# Amp Langfuse Extension Onboarding

This guide explains how to install the standalone Amp Langfuse extension artifact and connect Amp telemetry to Langfuse.

## What you are installing

The distributable plugin is a single bundled TypeScript file:

```text
dist/langfuse.ts
```

Amp loads plugin files directly from one of these locations:

- Global/user-wide: `~/.config/amp/plugins/*.ts`
- Project-local: `.amp/plugins/*.ts`

Use the global install if you want telemetry in every Amp workspace. Use the project-local install if you only want this extension in one repository.

> Plugins execute code in your Amp environment. Only install plugin files from sources you trust.

## Install globally

From a released copy of this repository, copy the bundled artifact into Amp's global plugin directory:

```bash
mkdir -p ~/.config/amp/plugins
cp dist/langfuse.ts ~/.config/amp/plugins/langfuse.ts
```

If installing from a GitHub release or raw URL, download the release artifact to the same path:

```bash
mkdir -p ~/.config/amp/plugins
curl -fsSL https://raw.githubusercontent.com/<owner>/ampcode-langfuse-extension/v0.1.0/dist/langfuse.ts \
  -o ~/.config/amp/plugins/langfuse.ts
```

Then reload plugins in Amp:

```text
plugins: reload
```

## Install in one project

From the target project root:

```bash
mkdir -p .amp/plugins
cp /path/to/ampcode-langfuse-extension/dist/langfuse.ts .amp/plugins/langfuse.ts
```

Or download a released artifact:

```bash
mkdir -p .amp/plugins
curl -fsSL https://raw.githubusercontent.com/<owner>/ampcode-langfuse-extension/v0.1.0/dist/langfuse.ts \
  -o .amp/plugins/langfuse.ts
```

Then reload plugins in Amp:

```text
plugins: reload
```

## Configure Langfuse

After reloading plugins, run this Amp command from the command palette:

```text
Langfuse: Configure
```

Enter:

- Langfuse base URL, for example `https://cloud.langfuse.com` or `https://us.cloud.langfuse.com`
- Langfuse public key
- Langfuse secret key

Then verify the configuration:

```text
Langfuse: Status
```

The status message reports whether Langfuse export is enabled, which required settings are missing, and the current capture settings. It does not display secrets.

## Configure content capture

By default, the extension is metadata-only. It does not capture raw prompts, assistant outputs, tool input/output, or shell working directories.

To opt into richer capture, run:

```text
Langfuse: Configure Capture
```

You can toggle:

- User prompt capture
- Assistant output capture
- Tool input/output capture
- Shell working-directory capture

Only enable these settings if you are comfortable writing that data to local JSONL telemetry and sending it to Langfuse. Strict redaction remains enabled unless explicitly disabled.

## Environment-variable configuration

Environment variables override Amp workspace configuration and are useful for CI or non-interactive launches:

```bash
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_SECRET_KEY=sk-lf-...
export LANGFUSE_BASE_URL=https://cloud.langfuse.com
amp
```

Optional capture flags:

```bash
export LANGFUSE_CAPTURE_INPUTS=false
export LANGFUSE_CAPTURE_OUTPUTS=false
export LANGFUSE_CAPTURE_TOOL_IO=false
export LANGFUSE_CAPTURE_CWD=false
```

## Verify telemetry

Start or continue an Amp thread after reloading the plugin. The extension always writes local JSONL telemetry, even when Langfuse export is disabled.

Default JSONL path:

```text
.amp/langfuse/events.jsonl
```

If you installed the plugin globally and the runtime resolves relative paths differently, set an explicit path before starting Amp:

```bash
export LANGFUSE_LOCAL_JSONL_PATH=/absolute/path/to/events.jsonl
amp
```

Langfuse traces are sent after each Amp turn ends. A trace uses:

- Name: `ampcode.agent`
- Trace ID: `<amp-thread-id>:<amp-message-id>`
- Session ID: Amp thread ID
- Child spans for correlated tool calls

## Build the distributable artifact

For maintainers, build the standalone plugin artifact with:

```bash
bun run build:plugin
```

Before publishing a release, run:

```bash
bun run release:check
```

This runs tests, TypeScript checks, and produces `dist/langfuse.ts`.

## Upgrade

Replace the installed plugin file with a newer `dist/langfuse.ts`, then reload plugins:

```text
plugins: reload
```

Existing Amp workspace configuration remains in place.

## Uninstall

Global install:

```bash
rm ~/.config/amp/plugins/langfuse.ts
```

Project-local install:

```bash
rm .amp/plugins/langfuse.ts
```

Then reload plugins:

```text
plugins: reload
```
