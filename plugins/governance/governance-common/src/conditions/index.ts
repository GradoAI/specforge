/** Versioned, closed structured-field catalog. No expression strings or object paths are executed. */
export const CONDITION_CATALOG = {
  subject_in_domain: {
    domain: [
      'member',
      'team',
      'group',
      'role',
      'trigger',
      'requirements_reviewer',
      'design_reviewer',
      'independent_reviewer',
      'machine_owner',
      'subscriber',
    ],
    id: 'string?',
  },
  not_a_relation: { relation: ['trigger', 'proposer', 'applicant'] },
  issue_field: { field: ['type', 'labels', 'status', 'priority'], value: 'string' },
  source: { field: ['repository', 'path', 'external_system', 'event_type'], value: 'string' },
  sender_is_bot: {},
  work_attribute: { field: ['size', 'confidence', 'team', 'project'], value: 'string|number' },
  number_compare: {
    field: ['budget_usage_ratio', 'queue_duration', 'retry_count', 'risk_score'],
    operator: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'],
    value: 'number',
  },
  time_window: { weekdays: 'integer[1..7][]', start: 'HH:mm', end: 'HH:mm', timezone: 'IANA timezone or UTC offset' },
} as const;
export const CONDITION_CATALOG_VERSION = 1;
type Domain = (typeof CONDITION_CATALOG.subject_in_domain.domain)[number];
type Relation = (typeof CONDITION_CATALOG.not_a_relation.relation)[number];
type IssueField = (typeof CONDITION_CATALOG.issue_field.field)[number];
type SourceField = (typeof CONDITION_CATALOG.source.field)[number];
type WorkField = (typeof CONDITION_CATALOG.work_attribute.field)[number];
type NumberField = (typeof CONDITION_CATALOG.number_compare.field)[number];
type Operator = (typeof CONDITION_CATALOG.number_compare.operator)[number];
export type ConditionLeaf =
  | { condition: 'subject_in_domain'; params: { domain: Domain; id?: string } }
  | { condition: 'not_a_relation'; params: { relation: Relation } }
  | { condition: 'issue_field'; params: { field: IssueField; value: string } }
  | { condition: 'source'; params: { field: SourceField; value: string } }
  | { condition: 'sender_is_bot'; params: Record<string, never> }
  | { condition: 'work_attribute'; params: { field: WorkField; value: string | number } }
  | { condition: 'number_compare'; params: { field: NumberField; operator: Operator; value: number } }
  | { condition: 'time_window'; params: { weekdays: number[]; start: string; end: string; timezone: string } };
export type ConditionExpression =
  { must: ConditionNode[] } | { should: ConditionNode[] } | { must_not: ConditionNode[] };
export type ConditionNode = ConditionExpression | ConditionLeaf;
/** Trusted adapter supplies these facts for the current object; absent facts are errors, never false facts. */
export interface ConditionContext {
  subject?: { id: string; teamIds: string[]; groupIds: string[]; roles: string[] };
  domains?: Partial<Record<Exclude<Domain, 'member' | 'team' | 'group' | 'role'>, string[]>>;
  relations?: Partial<Record<Relation, string | null>>;
  issue?: Partial<Record<IssueField, string | string[]>>;
  source?: Partial<Record<SourceField, string>>;
  senderIsBot?: boolean;
  work?: Partial<Record<WorkField, string | number>>;
  numbers?: Partial<Record<NumberField, number>>;
  /** Epoch milliseconds, supplied by caller. Never reads the wall clock. */
  instant?: number;
}
export interface ConditionError {
  path: string;
  message: string;
}
export type ConditionValidationResult =
  { valid: true; expression: ConditionExpression } | { valid: false; errors: ConditionError[] };
export interface ConditionExplanation {
  path: string;
  condition: string;
  matched: boolean;
  children?: ConditionExplanation[];
}
export type ConditionEvaluationResult =
  | { valid: true; matched: boolean; explanation: ConditionExplanation }
  | { valid: false; matched: false; errors: ConditionError[] };
const STATIC_DOMAINS = ['member', 'team', 'group', 'role'];
const COMBINATIONS = ['must', 'should', 'must_not'];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
  Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    return typeof key === 'string' && descriptor.enumerable === true && Object.hasOwn(descriptor, 'value');
  });
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 1024;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const member = (values: readonly string[], value: unknown): boolean =>
  typeof value === 'string' && values.includes(value);
const time = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
function timezone(value: unknown): boolean {
  if (!text(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
/** Depth counts every node, including the root and leaves. Bounded size prevents resource-exhaustion input. */
export function validateConditionExpression(input: unknown): ConditionValidationResult {
  const errors: ConditionError[] = [];
  let count = 0;
  const error = (path: string, message: string) => {
    errors.push({ path, message });
  };
  function visit(value: unknown, path: string, depth: number): void {
    if (++count > 1024 || depth > 5) {
      error(path, 'Expression exceeds 1024 nodes or five levels');
      return;
    }
    if (!isRecord(value)) {
      error(path, 'Expected a structured object');
      return;
    }
    const keys = Object.keys(value);
    if (keys.length === 1 && member(COMBINATIONS, keys[0])) {
      const key = keys[0]!;
      const children = value[key];
      if (!Array.isArray(children) || children.length > 1024) {
        error(`${path}.${key}`, 'Expected at most 1024 children');
        return;
      }
      for (let index = 0; index < children.length; index++)
        visit(children[index], `${path}.${key}[${index}]`, depth + 1);
      return;
    }
    if (depth === 1 || keys.length !== 2 || !keys.includes('condition') || !keys.includes('params')) {
      error(path, 'Expected one root operator or a condition with params');
      return;
    }
    if (!text(value.condition) || !Object.hasOwn(CONDITION_CATALOG, value.condition)) {
      error(`${path}.condition`, 'Unknown condition');
      return;
    }
    if (!isRecord(value.params)) {
      error(`${path}.params`, 'Expected parameters object');
      return;
    }
    const params = value.params;
    const schema = CONDITION_CATALOG[value.condition as keyof typeof CONDITION_CATALOG];
    for (const key of Object.keys(params))
      if (!Object.hasOwn(schema, key)) error(`${path}.params.${key}`, 'Unknown parameter');
    const check = (key: string, valid: boolean) => {
      if (!valid) error(`${path}.params.${key}`, 'Missing or invalid parameter');
    };
    for (const [key, rule] of Object.entries(schema)) {
      const item = params[key];
      if (Array.isArray(rule)) check(key, member(rule, item));
      else if (rule === 'string') check(key, text(item));
      else if (rule === 'number') check(key, finite(item));
      else if (rule === 'string|number') check(key, params.field === 'confidence' ? finite(item) : text(item));
      else if (rule === 'string?')
        check(key, STATIC_DOMAINS.includes(String(params.domain)) ? text(item) : item === undefined);
      else if (rule === 'HH:mm') check(key, time(item));
      else if (rule === 'IANA timezone or UTC offset') check(key, timezone(item));
      else
        check(
          key,
          Array.isArray(item) &&
            item.length > 0 &&
            item.length <= 7 &&
            item.every((day: unknown) => Number.isInteger(day) && Number(day) >= 1 && Number(day) <= 7),
        );
    }
  }
  visit(input, '$', 1);
  return errors.length ? { valid: false, errors } : { valid: true, expression: input as ConditionExpression };
}
/** '*' matches zero or more characters (including '/'); all other characters are literal. No regex execution. */
function wildcard(pattern: string, value: string): boolean {
  let previous = new Array<boolean>(value.length + 1).fill(false);
  previous[0] = true;
  for (const character of pattern) {
    const current = new Array<boolean>(value.length + 1).fill(false);
    current[0] = character === '*' && previous[0]!;
    for (let index = 1; index <= value.length; index++)
      current[index] =
        character === '*'
          ? previous[index]! || current[index - 1]!
          : previous[index - 1]! && character === value[index - 1];
    previous = current;
  }
  return previous[value.length]!;
}
function compare(left: number, operator: Operator, right: number): boolean {
  switch (operator) {
    case 'eq':
      return left === right;
    case 'ne':
      return left !== right;
    case 'gt':
      return left > right;
    case 'gte':
      return left >= right;
    case 'lt':
      return left < right;
    case 'lte':
      return left <= right;
  }
}
/** Always validates before evaluation. All children are evaluated so missing facts cannot hide in OR/NOT. */
export function evaluateConditionExpression(input: unknown, context: ConditionContext): ConditionEvaluationResult {
  const validation = validateConditionExpression(input);
  if (!validation.valid) return { valid: false, matched: false, errors: validation.errors };
  const errors: ConditionError[] = [];
  function leaf(node: ConditionLeaf, path: string): boolean {
    const missing = () => {
      errors.push({ path, message: 'Missing or invalid trusted context for condition' });
      return false;
    };
    switch (node.condition) {
      case 'subject_in_domain': {
        const { domain, id } = node.params;
        const subject = context.subject;
        if (!subject || !text(subject.id)) return missing();
        if (domain === 'member') return subject.id === id;
        const ids =
          domain === 'team'
            ? subject.teamIds
            : domain === 'group'
              ? subject.groupIds
              : domain === 'role'
                ? subject.roles
                : context.domains?.[domain];
        if (!Array.isArray(ids) || !ids.every(text)) return missing();
        return ids.includes(STATIC_DOMAINS.includes(domain) ? id! : subject.id);
      }
      case 'not_a_relation': {
        const related = context.relations?.[node.params.relation];
        if (!context.subject || !text(context.subject.id) || !(related === null || text(related))) return missing();
        return related !== context.subject.id;
      }
      case 'issue_field': {
        const { field, value } = node.params;
        const actual = context.issue?.[field];
        if (field === 'labels') return Array.isArray(actual) && actual.every(text) ? actual.includes(value) : missing();
        return text(actual) ? actual === value : missing();
      }
      case 'source': {
        const { field, value } = node.params;
        const actual = context.source?.[field];
        if (!text(actual)) return missing();
        return field === 'repository' ? wildcard(value, actual) : actual === value;
      }
      case 'sender_is_bot':
        return typeof context.senderIsBot === 'boolean' ? context.senderIsBot : missing();
      case 'work_attribute': {
        const { field, value } = node.params;
        const actual = context.work?.[field];
        return (field === 'confidence' ? finite(actual) : text(actual)) ? actual === value : missing();
      }
      case 'number_compare': {
        const { field, operator, value } = node.params;
        const actual = context.numbers?.[field];
        return finite(actual) ? compare(actual, operator, value) : missing();
      }
      case 'time_window': {
        if (!finite(context.instant) || Math.abs(context.instant) > 8.64e15) return missing();
        const { weekdays, start, end, timezone: zone } = node.params;
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: zone,
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).formatToParts(context.instant);
        const day =
          ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(
            parts.find((part) => part.type === 'weekday')!.value,
          ) + 1;
        const clock = `${parts.find((part) => part.type === 'hour')!.value}:${parts.find((part) => part.type === 'minute')!.value}`;
        // Start inclusive, end exclusive. Overnight windows attach to each selected local calendar day; equal endpoints are empty.
        return weekdays.includes(day) && (start <= end ? clock >= start && clock < end : clock >= start || clock < end);
      }
    }
  }
  function visit(node: ConditionNode, path: string): ConditionExplanation {
    if ('condition' in node) return { path, condition: node.condition, matched: leaf(node, path) };
    const operator = Object.keys(node)[0] as 'must' | 'should' | 'must_not';
    const children = (node as Record<string, ConditionNode[]>)[operator]!.map((child, index) =>
      visit(child, `${path}.${operator}[${index}]`),
    );
    const matched =
      operator === 'must'
        ? children.every((child) => child.matched)
        : operator === 'should'
          ? children.some((child) => child.matched)
          : !children.some((child) => child.matched);
    return { path, condition: operator, matched, children };
  }
  const explanation = visit(validation.expression, '$');
  return errors.length
    ? { valid: false, matched: false, errors }
    : { valid: true, matched: explanation.matched, explanation };
}
