import { createServiceRef, createExtensionPoint } from '@fasrun/backend-plugin-api';
import type { OperationContext, MutationOptions, JsonValue } from '@fasrun/contracts-core';
import type { z } from 'zod';
import type { SpecLayer, LayerRevision, LayerCheck } from '@fasrun/plugin-spec-common';

export interface SpecService {
  draftLayer(
    context: OperationContext,
    request: { workId: string; layer: SpecLayer; baseCommit: string; schemaVersion: string },
  ): Promise<LayerRevision>;
  validateLayer(context: OperationContext, revisionId: string): Promise<LayerCheck>;
  submitLayer(
    context: OperationContext,
    request: { revisionId: string; options: MutationOptions },
  ): Promise<{ pullRequestId: string; headCommit: string }>;
  reconcileReviews(
    context: OperationContext,
    revisionId: string,
  ): Promise<{ confirmed: boolean; merged: boolean; headCommit: string }>;
}
export interface LayerSchemas {
  register(layer: SpecLayer, version: string, schema: z.ZodType<JsonValue>): void;
}
export const layerSchemas = createExtensionPoint<LayerSchemas>({ id: 'spec.layerSchemas' });

/** Owner-bound root facade; its factory binds spec's repository, never the caller's schema. */
export const specServiceRef = createServiceRef<SpecService>({ id: 'spec.service', scope: 'root' });
