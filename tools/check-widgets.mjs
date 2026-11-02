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
], status: '上次查询', updatedLabel: '11/02 11:00', url: `quotadeck:///?sourceId=${id}` });
const filled = { accounts: [account('one', '$594.57', 99), account('two', '0%', 0), account('three', '不限额')], focusId: '', threshold: 20 };
let count = 0;
for (const widget of widgets) {
  const context = vm.createContext({ console });
  vm.runInContext(runtime, context, { timeout: 15000 });
  vm.runInContext(`globalThis.__expoWidgetLayout = (${registry.widgets[widget.name].layout});`, context);
  for (const family of widget.ios.supportedFamilies) {
    for (const colorScheme of ['light', 'dark']) {
      for (const props of [registry.widgets[widget.name].initialProps, filled]) {
        context.testProps = props;
        context.testEnvironment = { widgetFamily: family, colorScheme, widgetRenderingMode: family.startsWith('accessory') ? 'vibrant' : 'fullColor', configuration: { account: 'two' } };
        const tree = vm.runInContext('__expoWidgetRender(testProps, testEnvironment)', context, { timeout: 5000 });
        const output = JSON.stringify(tree);
        assert.ok(output.length > 50, `${widget.name}: missing rendered tree`);
        if (props.accounts.length) {
          assert.ok(output.includes(widget.name === 'QuotaFocus' ? '账号 two' : '账号 one'));
          assert.ok(output.includes('0%'), 'Real zero must remain visible');
        }
        count++;
      }
    }
  }
}
console.log(`Widget runtime: ${count} layouts passed (empty/populated, light/dark, home/lock screen).`);
