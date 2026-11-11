// Tables of the entry plugin live only in its own schema (tech plan 2.1); row types stay in this layer.
import { pgSchema } from 'drizzle-orm/pg-core';

export const entrySchema = pgSchema('entry');
