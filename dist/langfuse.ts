// @bun
// .amp/plugins/langfuse.ts
import { dirname as dirname2, sep } from "path";

// src/adapter/ids.ts
function createRunKey(threadID, messageID) {
  return `${threadID}:${String(messageID)}`;
}
function createAgentSpanID(runID) {
  return `agent:${runID}`;
}
function createSessionSpanID(threadID) {
  return `session:${threadID}`;
}

// src/config/env.ts
var TRACE_UPLOAD_TIMING_MESSAGE = "Langfuse traces upload after each Amp turn completes.";
function createDefaultConfig() {
  return {
    publicKey: undefined,
    secretKey: undefined,
    baseUrl: undefined,
    environment: undefined,
    release: undefined,
    sampleRate: 1,
    captureInputs: false,
    captureOutputs: false,
    captureToolIo: false,
    captureCwd: false,
    redactionMode: "strict",
    debug: false,
    localJsonlPath: ".amp/langfuse/events.jsonl"
  };
}
function configFromSources(env = process.env, settings = {}) {
  const defaults = createDefaultConfig();
  const langfuse = settings.langfuse ?? settings["amp.langfuse"] ?? {};
  return {
    ...defaults,
    publicKey: env.LANGFUSE_PUBLIC_KEY ?? langfuse.publicKey,
    secretKey: env.LANGFUSE_SECRET_KEY ?? langfuse.secretKey,
    baseUrl: env.LANGFUSE_BASE_URL ?? env.LANGFUSE_HOST ?? langfuse.baseUrl,
    environment: env.LANGFUSE_ENVIRONMENT ?? langfuse.environment,
    release: env.LANGFUSE_RELEASE ?? langfuse.release,
    sampleRate: parseSampleRate(env.LANGFUSE_SAMPLE_RATE ?? stringValue(langfuse.sampleRate), defaults.sampleRate),
    captureInputs: parseBoolean(env.LANGFUSE_CAPTURE_INPUTS ?? stringValue(langfuse.captureInputs), defaults.captureInputs),
    captureOutputs: parseBoolean(env.LANGFUSE_CAPTURE_OUTPUTS ?? stringValue(langfuse.captureOutputs), defaults.captureOutputs),
    captureToolIo: parseBoolean(env.LANGFUSE_CAPTURE_TOOL_IO ?? stringValue(langfuse.captureToolIo), defaults.captureToolIo),
    captureCwd: parseBoolean(env.LANGFUSE_CAPTURE_CWD ?? stringValue(langfuse.captureCwd), defaults.captureCwd),
    redactionMode: env.LANGFUSE_REDACTION_MODE === "off" || langfuse.redactionMode === "off" ? "off" : defaults.redactionMode,
    debug: parseBoolean(env.LANGFUSE_DEBUG ?? stringValue(langfuse.debug), defaults.debug),
    localJsonlPath: env.LANGFUSE_LOCAL_JSONL_PATH ?? langfuse.localJsonlPath ?? defaults.localJsonlPath
  };
}
function describeConfigStatus(config) {
  const missingLangfuseKeys = [
    ...!config.publicKey ? ["LANGFUSE_PUBLIC_KEY"] : [],
    ...!config.secretKey ? ["LANGFUSE_SECRET_KEY"] : [],
    ...!config.baseUrl ? ["LANGFUSE_BASE_URL"] : []
  ];
  const langfuseExportEnabled = missingLangfuseKeys.length === 0;
  return {
    langfuseExportEnabled,
    missingLangfuseKeys,
    message: langfuseExportEnabled ? `Langfuse export enabled for ${config.baseUrl}. Local JSONL telemetry enabled at ${config.localJsonlPath}. ${TRACE_UPLOAD_TIMING_MESSAGE}` : `Langfuse export disabled; missing ${missingLangfuseKeys.join(", ")}. Local JSONL telemetry enabled at ${config.localJsonlPath}. ${TRACE_UPLOAD_TIMING_MESSAGE}`
  };
}
function describeCaptureSettings(config) {
  return `Capture settings: inputs ${onOff(config.captureInputs)}, outputs ${onOff(config.captureOutputs)}, tool I/O ${onOff(config.captureToolIo)}, cwd ${onOff(config.captureCwd)}.`;
}
function onOff(value) {
  return value ? "on" : "off";
}
function stringValue(value) {
  return value == null ? undefined : String(value);
}
function parseBoolean(value, fallback) {
  if (value == null)
    return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
function parseSampleRate(value, fallback) {
  if (value == null)
    return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    return fallback;
  return Math.min(1, Math.max(0, parsed));
}

// src/redaction/redact.ts
import { relative } from "path";
var SECRET_KEY_RE = /authorization|cookie|token|secret|password|api[_-]?key|private[_-]?key/i;
var SECRET_VALUE_RE = /(Bearer\s+)[^\s]+|\b(sk-[A-Za-z0-9_-]+)\b|\b(password\s*=\s*)[^\s&]+/gi;
function redactValue(value) {
  if (typeof value === "string")
    return redactString(value);
  if (Array.isArray(value))
    return value.map((item) => redactValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY_RE.test(key) ? "[REDACTED]" : redactValue(entry)
    ]));
  }
  return value;
}
function redactString(value) {
  return value.replace(SECRET_VALUE_RE, (_match, bearerPrefix, skToken, passwordPrefix) => {
    if (bearerPrefix)
      return `${bearerPrefix}[REDACTED]`;
    if (skToken)
      return "[REDACTED]";
    if (passwordPrefix)
      return `${passwordPrefix}[REDACTED]`;
    return "[REDACTED]";
  });
}
function relativePathMetadata(path, workspaceRoot) {
  if (!workspaceRoot)
    return { path: basenameOnly(path) };
  const relativePath = relative(workspaceRoot, path);
  if (relativePath.startsWith("..") || relativePath === "")
    return { path: basenameOnly(path) };
  return { path: relativePath };
}
function basenameOnly(path) {
  const parts = path.split(/[\\/]/);
  return parts.at(-1) || path;
}

// src/adapter/amp-events.ts
function createAmpTelemetryAdapter(options = {}) {
  const config = options.config ?? createDefaultConfig();
  const now = options.now ?? (() => new Date().toISOString());
  const pluginVersion = options.pluginVersion ?? "0.0.0";
  const activeRunsByThread = new Map;
  function base(event, fields) {
    return {
      agent: "ampcode",
      plugin_name: "ampcode-langfuse-extension",
      plugin_version: pluginVersion,
      timestamp: now(),
      session_id: event.thread.id,
      ...fields
    };
  }
  function currentRun(threadID) {
    return activeRunsByThread.get(threadID);
  }
  function fallbackRun(threadID) {
    const runID = createRunKey(threadID, "unknown");
    return { threadID, messageID: "unknown", runID, agentSpanID: createAgentSpanID(runID) };
  }
  function maybeRedact(value) {
    return config.redactionMode === "off" ? value : redactValue(value);
  }
  function metadataForTool(event) {
    const metadata = {};
    const shell = options.helpers?.shellCommandFromToolCall?.(event);
    if (shell) {
      metadata.shell = config.captureCwd ? maybeRedact(shell) : { command: maybeRedact(shell.command) };
    }
    const files = options.helpers?.filesModifiedByToolCall?.(event);
    if (files?.length) {
      metadata.files = files.map((uri) => {
        const path = options.helpers?.filePathFromURI?.(uri) ?? uri.toString().replace(/^file:\/\//, "");
        return relativePathMetadata(path, options.workspaceRoot);
      });
    }
    return Object.keys(metadata).length ? metadata : undefined;
  }
  return {
    onSessionStart(event) {
      return base(event, {
        event_type: "session.start",
        run_id: createRunKey(event.thread.id, "session"),
        span_id: createSessionSpanID(event.thread.id)
      });
    },
    onAgentStart(event) {
      const runID = createRunKey(event.thread.id, event.id);
      const run = { threadID: event.thread.id, messageID: event.id, runID, agentSpanID: createAgentSpanID(runID) };
      activeRunsByThread.set(event.thread.id, run);
      return base(event, {
        event_type: "agent.start",
        run_id: run.runID,
        span_id: run.agentSpanID,
        status: "running",
        ...config.captureInputs ? { input: maybeRedact({ message: event.message }) } : {}
      });
    },
    onToolCall(event) {
      const run = currentRun(event.thread.id) ?? fallbackRun(event.thread.id);
      const hasActiveRun = currentRun(event.thread.id) !== undefined;
      const metadata = metadataForTool(event);
      return base(event, {
        event_type: "tool.call",
        run_id: run.runID,
        span_id: event.toolUseID,
        ...hasActiveRun ? { parent_span_id: run.agentSpanID } : {},
        tool_name: event.tool,
        ...metadata?.shell ? { command_kind: "shell" } : {},
        status: "running",
        ...config.captureToolIo ? { input: maybeRedact(event.input) } : {},
        ...metadata ? { metadata } : {}
      });
    },
    onToolResult(event) {
      const run = currentRun(event.thread.id) ?? fallbackRun(event.thread.id);
      const hasActiveRun = currentRun(event.thread.id) !== undefined;
      const metadata = metadataForTool(event);
      return base(event, {
        event_type: "tool.result",
        run_id: run.runID,
        span_id: event.toolUseID,
        ...hasActiveRun ? { parent_span_id: run.agentSpanID } : {},
        tool_name: event.tool,
        ...metadata?.shell ? { command_kind: "shell" } : {},
        status: event.status,
        ...config.captureToolIo ? { input: maybeRedact(event.input), output: maybeRedact(event.output) } : {},
        ...event.error ? { error: maybeRedact(event.error) } : {},
        ...metadata ? { metadata } : {}
      });
    },
    onAgentEnd(event) {
      const run = currentRun(event.thread.id) ?? {
        threadID: event.thread.id,
        messageID: event.id,
        runID: createRunKey(event.thread.id, event.id),
        agentSpanID: createAgentSpanID(createRunKey(event.thread.id, event.id))
      };
      const telemetry = base(event, {
        event_type: "agent.end",
        run_id: run.runID,
        span_id: run.agentSpanID,
        status: event.status,
        ...config.captureOutputs ? { output: maybeRedact({ messages: event.messages }) } : {}
      });
      activeRunsByThread.delete(event.thread.id);
      return telemetry;
    }
  };
}

// src/transport/jsonl.ts
import { mkdir, appendFile } from "fs/promises";
import { dirname, isAbsolute, resolve } from "path";

class JsonlTransport {
  path;
  constructor(path, options = {}) {
    this.path = options.baseDirectory && !isAbsolute(path) ? resolve(options.baseDirectory, path) : path;
  }
  async emit(event) {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(event)}
`, "utf8");
  }
  async flush() {}
}

// src/transport/langfuse.ts
class LangfuseTransport {
  options;
  fetch;
  runs = new Map;
  constructor(options) {
    this.options = options;
    this.fetch = options.fetch ?? fetch;
  }
  async emit(event) {
    if (!this.enabled())
      return;
    if (event.event_type === "session.start")
      return;
    const draft = this.draftFor(event.run_id);
    draft.events.push(event);
    const existing = draft.spans.get(event.span_id);
    draft.spans.set(event.span_id, {
      first: existing?.first ?? event,
      latest: event,
      metadata: { ...existing?.metadata, ...event.metadata }
    });
    if (event.event_type === "agent.end") {
      this.mergeOrphanRunInto(event, draft);
      await this.sendRun(event.run_id, draft);
      this.runs.delete(event.run_id);
    }
  }
  async flush() {
    if (!this.enabled())
      return;
    for (const [runID, draft] of [...this.runs.entries()]) {
      await this.sendRun(runID, draft);
      this.runs.delete(runID);
    }
  }
  enabled() {
    return Boolean(this.options.config.publicKey && this.options.config.secretKey && this.options.config.baseUrl);
  }
  draftFor(runID) {
    const existing = this.runs.get(runID);
    if (existing)
      return existing;
    const created = { events: [], spans: new Map };
    this.runs.set(runID, created);
    return created;
  }
  mergeOrphanRunInto(event, draft) {
    const orphanRunID = createRunKey(event.session_id, "unknown");
    if (orphanRunID === event.run_id)
      return;
    const orphan = this.runs.get(orphanRunID);
    if (!orphan)
      return;
    draft.events = [...orphan.events, ...draft.events];
    draft.spans = new Map([...orphan.spans, ...draft.spans]);
    this.runs.delete(orphanRunID);
  }
  async sendRun(runID, draft) {
    if (!draft.events.length)
      return;
    const first = draft.events[0];
    if (!first)
      return;
    const payload = { batch: [this.traceCreate(runID, draft), ...[...draft.spans.values()].map((span) => this.spanCreate(runID, span))] };
    const response = await this.fetch(`${this.options.config.baseUrl?.replace(/\/$/, "")}/api/public/ingestion`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${this.options.config.publicKey}:${this.options.config.secretKey}`)}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok && response.status !== 207) {
      throw new Error(`Langfuse ingestion failed with HTTP ${response.status}`);
    }
  }
  traceCreate(runID, draft) {
    const first = draft.events[0];
    const end = lastEvent(draft.events, "agent.end");
    if (!first)
      throw new Error("Cannot create Langfuse trace without events");
    return compact({
      id: `trace-create:${runID}`,
      type: "trace-create",
      timestamp: first.timestamp,
      body: compact({
        id: runID,
        name: "ampcode.agent",
        sessionId: first.session_id,
        input: first.input,
        output: end?.output,
        release: this.options.config.release,
        environment: this.options.config.environment,
        metadata: {
          agent: first.agent,
          plugin: first.plugin_name,
          pluginVersion: first.plugin_version
        }
      })
    });
  }
  spanCreate(runID, span) {
    const { first, latest } = span;
    return compact({
      id: `span-create:${span.first.span_id}`,
      type: "span-create",
      timestamp: first.timestamp,
      body: compact({
        id: first.span_id,
        traceId: runID,
        parentObservationId: first.parent_span_id ?? (first.event_type.startsWith("tool.") ? createAgentSpanID(runID) : undefined),
        name: observationName(latest),
        startTime: first.timestamp,
        endTime: latest.event_type.endsWith(".end") || latest.event_type.endsWith(".result") ? latest.timestamp : undefined,
        input: first.input,
        output: latest.output,
        metadata: compact({
          eventType: latest.event_type,
          status: latest.status,
          ...span.metadata
        })
      })
    });
  }
}
function lastEvent(events, eventType) {
  for (let index = events.length - 1;index >= 0; index -= 1) {
    const event = events[index];
    if (event?.event_type === eventType)
      return event;
  }
  return;
}
function observationName(event) {
  if (event.event_type.startsWith("agent."))
    return "agent";
  if (event.event_type.startsWith("tool."))
    return `tool.${event.tool_name ?? "unknown"}`;
  return event.event_type;
}
function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

// .amp/plugins/langfuse.ts
function langfuse_default(amp) {
  const workspaceRoot = inferWorkspaceRoot(process.cwd());
  let config = configFromSources();
  let adapter = createAdapter(config);
  let transports = createTransports(config);
  function createAdapter(nextConfig) {
    return createAmpTelemetryAdapter({
      config: nextConfig,
      helpers: amp.helpers,
      workspaceRoot
    });
  }
  function createTransports(nextConfig) {
    return [new JsonlTransport(nextConfig.localJsonlPath, { baseDirectory: workspaceRoot }), new LangfuseTransport({ config: nextConfig })];
  }
  function applyConfig(nextConfig) {
    config = nextConfig;
    adapter = createAdapter(nextConfig);
    transports = createTransports(nextConfig);
  }
  async function loadConfigFromAmp() {
    const settings = await amp.configuration.get();
    applyConfig(configFromSources(process.env, settings));
  }
  async function emit(event) {
    try {
      await Promise.all(transports.map((transport) => transport.emit(event)));
      if (config.debug)
        amp.logger.log("Langfuse telemetry event written", event.event_type, event.run_id);
    } catch (error) {
      amp.logger.log("Langfuse telemetry write failed; Amp execution continues", error);
    }
  }
  async function flush() {
    try {
      await Promise.all(transports.map((transport) => transport.flush()));
    } catch (error) {
      amp.logger.log("Langfuse telemetry flush failed; Amp execution continues", error);
    }
  }
  amp.registerCommand("langfuse-status", { title: "Status", category: "Langfuse", description: "Show Langfuse telemetry configuration status" }, async (ctx) => {
    await loadConfigFromAmp();
    await ctx.ui.notify(`${describeConfigStatus(config).message} ${describeCaptureSettings(config)}`);
  });
  amp.registerCommand("langfuse-configure-capture", { title: "Configure Capture", category: "Langfuse", description: "Configure prompt, output, tool I/O, and cwd capture" }, async (ctx) => {
    await loadConfigFromAmp();
    const settings = await amp.configuration.get();
    const current = settings.langfuse ?? settings["amp.langfuse"] ?? {};
    const next = {
      ...current,
      captureInputs: await selectBoolean(ctx, "Capture user prompts?", config.captureInputs),
      captureOutputs: await selectBoolean(ctx, "Capture assistant outputs?", config.captureOutputs),
      captureToolIo: await selectBoolean(ctx, "Capture tool input/output?", config.captureToolIo),
      captureCwd: await selectBoolean(ctx, "Capture shell working directories?", config.captureCwd)
    };
    await amp.configuration.update({ langfuse: next }, "workspace");
    await loadConfigFromAmp();
    await ctx.ui.notify(describeCaptureSettings(config));
  });
  amp.registerCommand("langfuse-configure", { title: "Configure", category: "Langfuse", description: "Configure Langfuse export for this workspace" }, async (ctx) => {
    await loadConfigFromAmp();
    const baseUrl = await ctx.ui.input({
      title: "Langfuse base URL",
      helpText: "For Langfuse Cloud EU use https://cloud.langfuse.com. US cloud uses https://us.cloud.langfuse.com.",
      initialValue: config.baseUrl ?? "https://cloud.langfuse.com",
      submitButtonText: "Next"
    });
    if (!baseUrl)
      return;
    const publicKey = await ctx.ui.input({
      title: "Langfuse public key",
      helpText: "Starts with pk-lf-. Environment variables still override workspace configuration.",
      initialValue: config.publicKey ?? "",
      submitButtonText: "Next"
    });
    if (!publicKey)
      return;
    const secretKey = await ctx.ui.input({
      title: "Langfuse secret key",
      helpText: "Leave blank to keep an existing configured secret. Do not paste this key into chat.",
      submitButtonText: "Save"
    });
    if (secretKey === undefined)
      return;
    const settings = await amp.configuration.get();
    const current = settings.langfuse ?? settings["amp.langfuse"] ?? {};
    await amp.configuration.update({
      langfuse: {
        ...current,
        baseUrl,
        publicKey,
        secretKey: secretKey || current.secretKey
      }
    }, "workspace");
    await loadConfigFromAmp();
    await ctx.ui.notify(describeConfigStatus(config).message);
  });
  amp.configuration.subscribe(() => {
    loadConfigFromAmp();
  });
  loadConfigFromAmp().then(() => {
    amp.logger.log("ampcode-langfuse-extension initialized;", describeConfigStatus(config).message);
  });
  amp.on("session.start", async (event) => {
    await emit(adapter.onSessionStart(event));
  });
  amp.on("agent.start", async (event) => {
    await emit(adapter.onAgentStart(event));
    return {};
  });
  amp.on("tool.call", async (event) => {
    await emit(adapter.onToolCall(event));
    return { action: "allow" };
  });
  amp.on("tool.result", async (event) => {
    await emit(adapter.onToolResult(event));
  });
  amp.on("agent.end", async (event) => {
    await emit(adapter.onAgentEnd(event));
    await flush();
  });
  process.once("beforeExit", () => {
    flush();
  });
}
async function selectBoolean(ctx, title, current) {
  const selected = await ctx.ui.select({
    title,
    message: "These settings can send sensitive prompt, response, tool, or local-path data to Langfuse. Strict redaction remains enabled unless disabled separately.",
    initialValue: current ? "on" : "off",
    options: ["off", "on"]
  });
  return selected ? selected === "on" : current;
}
function inferWorkspaceRoot(currentDirectory) {
  return currentDirectory.endsWith(`${sep}.amp${sep}plugins`) ? dirname2(dirname2(currentDirectory)) : currentDirectory;
}
export {
  langfuse_default as default
};
