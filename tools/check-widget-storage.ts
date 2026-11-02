/** Exercise Expo's installed WidgetsStorage with actual application projections on macOS. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_PREFERENCES, type SavedData } from '../mobile/src/domain/types';
import { widgetTimeline } from '../mobile/src/widgets/model';

const root = path.resolve(path.dirname(process.argv[1]), '..');
const cache = path.join(root, '.cache', 'widget-storage');
mkdirSync(cache, { recursive: true });
const now = Date.parse('2026-11-02T03:00:00Z');
const saved: SavedData = {
  version: 1, preferences: { ...DEFAULT_PREFERENCES }, history: {},
  sources: ['balance', 'unlimited', 'zero'].map(id => ({
    id, name: `测试 ${id}`, kind: 'newapi', connectionId: 'must-not-be-shared',
    baseUrl: 'https://private.example', pinned: false, enabled: true,
  })),
  states: Object.fromEntries([
    { id: 'balance', label: '余额', remaining: 12, unit: 'USD' },
    { id: 'unlimited', label: '不限额', unlimited: true, unit: 'requests' },
    { id: 'zero', label: '五小时', remaining: 0, unit: '%' },
  ].map(metric => [metric.id, { snapshot: {
    sourceId: metric.id, fetchedAt: new Date(now).toISOString(),
    metrics: [{ ...metric, scope: 'account' }],
  } }])),
};
const entries = (data: SavedData) => widgetTimeline(data, now).map(entry => ({
  timestamp: entry.date.getTime(), props: entry.props,
}));
const timeline = entries(saved);
const legacy = timeline.map(entry => ({ ...entry, props: { ...entry.props,
  accounts: entry.props.accounts.map(account => ({ ...account,
    metrics: account.metrics.map(metric => ({ ...metric, percent: metric.percent ?? null })),
  })),
} }));
assert.notEqual(JSON.stringify(legacy), JSON.stringify(timeline), 'Unknown percentages must be absent');
assert.doesNotMatch(JSON.stringify(timeline), /must-not-be-shared|private\.example/);
const fixturePath = path.join(cache, 'fixtures.json');
writeFileSync(fixturePath, JSON.stringify({ legacy, timeline, empty: entries({ ...saved, sources: [] }) }));

if (process.platform === 'darwin') {
  // Include the installed SDK implementation, without patching node_modules or generated iOS code.
  const sdk = readFileSync(path.join(root, 'mobile/node_modules/expo-widgets/ios/WidgetsStorage.swift'), 'utf8');
  const checks = readFileSync(path.join(root, 'tools/check-widget-storage.swift'), 'utf8');
  const sourcePath = path.join(cache, 'check.swift');
  writeFileSync(sourcePath, `import Foundation\n${sdk}\n${checks}`);
  const output = execFileSync('swift', ['-module-cache-path', path.join(cache, 'modules'), sourcePath, fixturePath], {
    cwd: root, encoding: 'utf8',
  });
  writeFileSync(path.join(cache, 'result.log'), output);
  process.stdout.write(output);
} else {
  console.log('Storage fixtures prepared; native UserDefaults check runs in the macOS build.');
}
