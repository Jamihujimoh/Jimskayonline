import assert from 'node:assert/strict';
import { getEffectiveCreatorStatus } from '../src/lib/creator-state';

const status = getEffectiveCreatorStatus({ username: 'jimoh jamihu adekilekun', status: 'creator' });
assert.equal(status, false, 'Creator status should require explicit verification, not username/status alone.');

console.log('creator-gate-check: PASS');
