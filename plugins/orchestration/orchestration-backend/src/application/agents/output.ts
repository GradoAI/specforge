import { z } from 'zod';
import { jsonValueSchema, type JsonValue } from '@fasrun/contracts-core';

const MAX_PATHS = 128;
const pointer = (name: string) => name.replaceAll('~', '~0').replaceAll('/', '~1').slice(0, 128);
/** Project against the actual registered Zod branches before full validation. Audit paths contain no values. */
export function sanitizeOutput(schema: z.ZodType, input: unknown) {
  // Reject functions/effects and other non-JSON schemas rather than approximating their constraints.
  z.toJSONSchema(schema);
  jsonValueSchema.parse(input);
  const value = structuredClone(input) as JsonValue;
  function project(node: z.ZodType, candidate: JsonValue, prefix: string, paths: string[], depth = 0): JsonValue {
    if (depth > 64) throw new Error('Output nesting limit exceeded');
    if (
      node instanceof z.ZodOptional ||
      node instanceof z.ZodNullable ||
      node instanceof z.ZodDefault ||
      node instanceof z.ZodReadonly
    )
      return project(node.unwrap() as z.ZodType, candidate, prefix, paths, depth + 1);
    if (node instanceof z.ZodUnion) {
      for (const option of node.options as readonly z.ZodType[]) {
        const branch: string[] = [];
        const projected = project(option, candidate, prefix, branch, depth + 1);
        if (option.safeParse(projected).success) {
          paths.push(...branch.slice(0, MAX_PATHS - paths.length));
          return projected;
        }
      }
      throw new Error('Output does not match a declared union branch');
    }
    if (node instanceof z.ZodArray && Array.isArray(candidate))
      return candidate.map((item, index) =>
        project(node.element as z.ZodType, item, `${prefix}/${index}`, paths, depth + 1),
      );
    if (
      node instanceof z.ZodObject &&
      candidate !== null &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate)
    ) {
      const result: Record<string, JsonValue> = {};
      for (const [name, child] of Object.entries(candidate)) {
        const childPath = `${prefix}/${pointer(name)}`;
        if (Object.hasOwn(node.shape, name))
          Object.defineProperty(result, name, {
            value: project(node.shape[name] as z.ZodType, child, childPath, paths, depth + 1),
            enumerable: true,
          });
        else if (paths.length < MAX_PATHS) paths.push(childPath.slice(0, 512));
      }
      return result;
    }
    if (node instanceof z.ZodRecord && candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate))
      return Object.fromEntries(
        Object.entries(candidate).map(([name, child]) => [
          name,
          project(node.valueType as z.ZodType, child, `${prefix}/${pointer(name)}`, paths, depth + 1),
        ]),
      );
    if (node instanceof z.ZodIntersection || node instanceof z.ZodTuple || node instanceof z.ZodLazy)
      throw new Error('Unsupported output schema composition');
    return candidate;
  }
  const stripped: string[] = [];
  const output = jsonValueSchema.parse(schema.parse(project(schema, value, 'output', stripped)));
  return { output, stripped };
}
