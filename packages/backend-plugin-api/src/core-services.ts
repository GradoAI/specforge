import type { AuditContext } from '@fasrun/contracts-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { FastifyPluginAsync } from 'fastify';
import { createServiceRef } from './services.js';

/** Configuration of one component, read from FASRUN_<COMPONENT>_<NAME> environment variables. */
export interface RootConfigService {
  /** Component segment of the variable names, e.g. "CORE". */
  readonly component: string;
  /** Value of FASRUN_<COMPONENT>_<name>. */
  get(name: string): string | undefined;
  /** Like `get`, but throws FASRUN_CONFIG_INVALID when the variable is missing or empty. */
  getRequired(name: string): string;
  /** Validates all of the component's variables (keys without the prefix) with a schema such as Zod's. */
  parse<T>(schema: { parse(input: unknown): T }): T;
}

export type LogFields = Record<string, unknown>;

export interface LoggerService {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): LoggerService;
}

/** The plugin's database access; each plugin reads and writes only its own schema (tech plan 2.1). */
export interface DatabaseService {
  /** PostgreSQL schema owned by the plugin. */
  readonly schema: string;
  readonly db: NodePgDatabase;
}

/** Routes registered here are served under /api/<pluginId>/v1. */
export interface HttpRouterService {
  use(routes: FastifyPluginAsync): void;
}

// The following services are declared now and implemented in later milestones (tech plan 2.5).

export interface SecretsService {
  get(name: string): Promise<string>;
}

export interface TelemetryService {
  recordMetric(name: string, value: number, attributes?: Record<string, string>): void;
}

export interface FileStorageService {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
}

export interface DataRefService {
  read(ref: string): Promise<unknown>;
}

export interface AuthService {
  /** Resolves the principal of a request credential. */
  authenticate(credential: string): Promise<{ principalId: string; orgId: string }>;
}

export interface AuditService {
  record(context: AuditContext, action: string, details?: Record<string, unknown>): Promise<void>;
}

export interface EventsService {
  publish(topic: string, payload: unknown): Promise<void>;
  subscribe(topic: string, handler: (payload: unknown) => Promise<void>): void;
}

export interface OutboundService {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

export const coreServices = {
  rootConfig: createServiceRef<RootConfigService>({ id: 'core.rootConfig', scope: 'root' }),
  rootLogger: createServiceRef<LoggerService>({ id: 'core.rootLogger', scope: 'root' }),
  logger: createServiceRef<LoggerService>({ id: 'core.logger' }),
  database: createServiceRef<DatabaseService>({ id: 'core.database' }),
  httpRouter: createServiceRef<HttpRouterService>({ id: 'core.httpRouter' }),
  secrets: createServiceRef<SecretsService>({ id: 'core.secrets' }),
  telemetry: createServiceRef<TelemetryService>({ id: 'core.telemetry' }),
  fileStorage: createServiceRef<FileStorageService>({ id: 'core.fileStorage' }),
  dataRef: createServiceRef<DataRefService>({ id: 'core.dataRef' }),
  auth: createServiceRef<AuthService>({ id: 'core.auth' }),
  audit: createServiceRef<AuditService>({ id: 'core.audit' }),
  events: createServiceRef<EventsService>({ id: 'core.events' }),
  outbound: createServiceRef<OutboundService>({ id: 'core.outbound' }),
} as const;
