// Exercise the actual Expo isolated widget runtime, not React Native mocks.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobile = path.join(root, 'mobile');
const cache = path.join(root, '.cache', 'widget-check');
mkdirSync(cache, { recursive: true });
const config = JSON.parse(readFileSync(path.join(mobile, 'app.json'), 'utf8'));
const widgets = config.expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-widgets')[1].widgets;
const registryConfig = path.join(cache, 'config.json');
const registryPath = path.join(cache, 'registry.json');
const runtimePath = path.join(cache, 'runtime.js');
writeFileSync(registryConfig, JSON.stringify({ widgets: widgets.map(widget => ({ name: widget.name, initialLayout: widget.ios.initialLayout })) }));
for (const [script, args] of [
  ['build-layout-registry.mjs', [mobile, 'ios', registryPath, registryConfig]],
  ['build-bundle.mjs', [mobile, 'ios', runtimePath]],
]) execFileSync(process.execPath, [path.join(mobile, 'node_modules', 'expo-widgets', 'scripts', script), ...args], { cwd: mobile, stdio: 'inherit' });

const runtime = readFileSync(runtimePath, 'utf8');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const account = (id, value, percent) => ({ id, name: `账号 ${id}`, provider: 'Sub2API', metrics: [
  { id: '5h', label: '五小时额度', value, ...(percent === undefined ? {} : { percent }), stale: false, resetText: '2 小时后重置' },
  { id: '7d', label: '七天额度', value: '16%', percent: 16, stale: false, resetText: '' },
], status: '上次查询', updatedLabel: '11/02 11:00', queryLabel: '查询 11/02 11:00', url: `quotadeck:///?sourceId=${id}` });
const filled = { accounts: [account('one', '$594.57', 99), account('two', '0%', 0), account('three', '不限额')], focusId: '', threshold: 20 };
const mixed = { ...filled, accounts: [
  { ...account('one', '$397.06', 66.18), name: 'Pro 20X' },
  { ...account('two', '$3.34'), name: 'Aigate', provider: 'New API', metrics: [{ id: 'balance', label: '账户余额', value: '$3.34', resetText: '', stale: false }] },
] };
const long = { ...filled, accounts: [{ ...account('long', '12.35K tokens'), name: '很长的账号名称与未知总额度', metrics: [{ id: 'balance', label: '剩余 Token', value: '12.35K tokens', stale: true, resetText: '' }], queryLabel: '待更新 11/01 21:19' }] };
const failed = { ...mixed, accounts: mixed.accounts.map(item => ({ ...item, status: '连接待检查', queryLabel: '查询失败 11/02 11:00', metrics: item.metrics.map(metric => ({ ...metric, stale: true })) })) };
// Upgrading can briefly render the old cached timeline before the app publishes.
const legacy = { ...mixed, accounts: mixed.accounts.map(({ queryLabel, ...item }) => item) };
const cases = [filled, mixed, long, failed, legacy];
const rendered = [];
let count = 0;
for (const widget of widgets) {
  const context = vm.createContext({ console });
  vm.runInContext(runtime, context, { timeout: 15000 });
  vm.runInContext(`globalThis.__expoWidgetLayout = (${registry.widgets[widget.name].layout});`, context);
  for (const family of widget.ios.supportedFamilies) {
    for (const colorScheme of ['light', 'dark']) {
      for (const props of [registry.widgets[widget.name].initialProps, ...cases]) {
        for (const renderingMode of family.startsWith('accessory') ? ['vibrant'] : ['fullColor', 'accented']) {
          context.testProps = props;
          context.testEnvironment = { widgetFamily: family, colorScheme, widgetRenderingMode: renderingMode, configuration: { account: 'two' } };
          const tree = vm.runInContext('__expoWidgetRender(testProps, testEnvironment)', context, { timeout: 5000 });
          const output = JSON.stringify(tree);
          assert.ok(output.length > 50, `${widget.name}: missing rendered tree`);
          if (props.accounts.length) {
            const visible = widget.name === 'QuotaFocus' ? [props.accounts.find(item => item.id === 'two') ?? props.accounts[0]] : props.accounts.slice(0, 3);
            for (const item of visible) {
              assert.ok(output.includes(item.name), 'The configured account must remain visible');
              assert.ok(output.includes(item.metrics[0].value), 'Amounts, including real zero, must remain visible');
              assert.ok(output.includes(item.queryLabel ?? item.updatedLabel), 'Every account must show its query time and status');
              assert.ok(output.includes(item.url), 'Every account must retain its own detail link');
            }
            assert.ok(!output.includes('最近一次查询 · 打开应用同步最新额度'), 'Do not replace real query times with a generic footer');
          }
          rendered.push({ widget: widget.name, family, colorScheme, renderingMode, case: props === filled ? 'three' : props === mixed ? 'mixed' : props === long ? 'long' : props === failed ? 'failed' : props === legacy ? 'legacy' : 'empty', tree });
          count++;
        }
      }
    }
  }
}
writeFileSync(path.join(cache, 'rendered.json'), JSON.stringify(rendered));
console.log(`Widget runtime: ${count} layouts passed (1–3 accounts, balance/quota, cached/fresh/stale, light/dark/tinted, home/lock screen).`);
