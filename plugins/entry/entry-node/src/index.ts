import { createServiceRef, createExtensionPoint } from '@fasrun/backend-plugin-api';
import type { EntryOperation } from '@fasrun/plugin-entry-common';

export interface EntryService {
  register<TInput, TOutput>(operation: EntryOperation<TInput, TOutput>): void;
}
export const operations = createExtensionPoint<EntryService>({ id: 'entry.operations' });

/** Owner-bound root facade; its factory binds entry's repository, never the caller's schema. */
export const entryServiceRef = createServiceRef<EntryService>({ id: 'entry.service', scope: 'root' });
