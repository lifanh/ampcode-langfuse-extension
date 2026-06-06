declare module '@ampcode/plugin' {
  export interface PluginAPI {
    logger: { log: (...args: unknown[]) => void }
    configuration: PluginConfiguration<Record<string, unknown>>
    helpers: {
      shellCommandFromToolCall: (event: {
        toolUseID: string
        tool: string
        input: Record<string, unknown>
      }) => { command: string; dir?: string } | null
      filesModifiedByToolCall: (event: {
        toolUseID: string
        tool: string
        input: Record<string, unknown>
      }) => Array<{ toString(): string }> | null
      filePathFromURI: (uri: { toString(): string }) => string
    }
    on<E extends keyof PluginEventMap>(event: E, handler: (event: PluginEventMap[E]) => PluginHandlerResult<E>): void
    registerCommand(id: string, options: PluginCommandOptions, handler: (ctx: PluginCommandContext) => void | Promise<void>): void
  }

  export type PluginConfigurationTarget = 'workspace' | 'global'

  export interface PluginConfiguration<T> {
    get(): Promise<T>
    update(partial: Partial<T>, target?: PluginConfigurationTarget): Promise<void>
    subscribe(onNext: (value: T) => void): { unsubscribe(): void }
  }

  export interface PluginCommandOptions {
    title: string
    category?: string
    description?: string
  }

  export interface PluginCommandContext {
    ui: PluginUI
  }

  export interface PluginUI {
    notify(message: string): Promise<void>
    input(options: PluginInputOptions): Promise<string | undefined>
  }

  export interface PluginInputOptions {
    title?: string
    helpText?: string
    initialValue?: string
    submitButtonText?: string
  }

  export interface SessionStartEvent {
    thread: { id: string }
  }

  export interface AgentStartEvent {
    thread: { id: string }
    id: string | number
    message: string
  }

  export interface ToolCallEvent {
    thread: { id: string }
    toolUseID: string
    tool: string
    input: Record<string, unknown>
  }

  export interface ToolResultEvent extends ToolCallEvent {
    status: 'done' | 'error' | 'cancelled'
    error?: string
    output?: unknown
  }

  export interface AgentEndEvent extends AgentStartEvent {
    status: 'done' | 'error' | 'cancelled'
    messages: unknown[]
  }

  export interface PluginEventMap {
    'session.start': SessionStartEvent
    'agent.start': AgentStartEvent
    'tool.call': ToolCallEvent
    'tool.result': ToolResultEvent
    'agent.end': AgentEndEvent
  }

  export type PluginHandlerResult<E extends keyof PluginEventMap> = E extends 'tool.call'
    ? { action: 'allow' } | Promise<{ action: 'allow' }>
    : E extends 'agent.start'
      ? Record<string, never> | Promise<Record<string, never>>
      : void | Promise<void>
}
