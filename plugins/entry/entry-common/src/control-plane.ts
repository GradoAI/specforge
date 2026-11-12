import type { z } from 'zod';
import type { OperationContext, JsonValue } from '@fasrun/contracts-core';
/** Both transports dispatch the same use case. Actor identity is supplied by authentication, outside input. */
export interface EntryOperation<TInput = JsonValue, TOutput = JsonValue> {
  readonly id: string;
  readonly http: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string };
  readonly mcpTool: string;
  readonly permission: string;
  readonly risk: 'read' | 'write' | 'sensitive';
  readonly input: z.ZodType<TInput>;
  readonly output: z.ZodType<TOutput>;
  execute(context: OperationContext, input: TInput): Promise<TOutput>;
}
