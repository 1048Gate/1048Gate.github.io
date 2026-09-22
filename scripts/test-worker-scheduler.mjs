import assert from 'node:assert/strict';
import {isRefreshDay} from '../src/worker.js';

assert.equal(isRefreshDay(new Date('2026-09-20T16:00:00Z')),true,'Sunday should refresh');
assert.equal(isRefreshDay(new Date('2026-09-21T16:00:00Z')),true,'Monday should refresh');
assert.equal(isRefreshDay(new Date('2026-09-22T16:00:00Z')),false,'Tuesday should not refresh');
assert.equal(isRefreshDay(new Date('2026-09-24T16:00:00Z')),true,'Thursday should refresh');

console.log('Cloudflare scheduler weekday guard passed.');
