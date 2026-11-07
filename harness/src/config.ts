import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { rubricSchema } from './domain.ts';

export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const objectHash = (value: unknown) => hash(JSON.stringify(value));
export const loadRubric = (path = process.env.BETTER_RUBRIC_PATH || 'config/rubric.json') => rubricSchema.parse(JSON.parse(readFileSync(resolve(path), 'utf8')));
export const CAPTURE_VERSION = 'chromium-frozen-get-v2';
export const AGGREGATION_VERSION = 'combined-points-and-legacy-ordinal-v2';
export const PROMPT_VERSION = 'configured-anchor-choices-v2';
