import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check, CheckCircle2, ChevronDown, Eye, EyeOff, Link2, Network, ShieldCheck } from 'lucide-react-native';
import type { Credential, CustomMapping, ProviderKind, QuotaSnapshot, Source } from '../domain/types';
import { PROVIDER_LABELS } from '../domain/types';
import { amount, hostLabel } from '../domain/format';
import { fetchSnapshot, listAdminAccounts, loginAdmin, type AdminAccount } from '../providers/registry';
import { normalizeBaseUrl, QuotaError } from '../providers/transport';
import type { QuotaController } from '../state/useQuota';
import { Button, Chip, Field, Glass, IconButton, Sheet, styles } from './primitives';
import { useTheme } from './theme';

const kinds: ProviderKind[] = ['auto', 'sub2api', 'sub2-admin', 'newapi', 'oneapi', 'openrouter', 'deepseek', 'custom'];
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
const initialMapping: CustomMapping = { path: '/api/balance', auth: 'bearer', remainingPath: 'data.balance', unit: 'USD', scale: 1 };
type Verified = { source: Source; credential: Credential; snapshot?: QuotaSnapshot; accounts?: AdminAccount[] };

export function ConnectionSheet({ controller, existing, onClose }: { controller: QuotaController; existing?: Source; onClose: () => void }) {
  const t = useTheme();
  const [kind, setKind] = useState<ProviderKind>(existing?.resolvedKind ?? existing?.kind ?? 'sub2api');
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [authMode, setAuthMode] = useState<'key' | 'login'>('key');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountId, setAccountId] = useState(existing?.accountId?.toString() ?? '');
  const [mapping, setMapping] = useState<CustomMapping>(existing?.custom ?? initialMapping);
  const [scale, setScale] = useState(String(existing?.custom?.scale ?? 1));
  const [advanced, setAdvanced] = useState(!!existing?.accountId);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState<Verified>();
  const [selected, setSelected] = useState<number[]>([]);

  const invalidate = () => { setVerified(undefined); setError(''); setSelected([]); };
  const edit = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) => (value: T) => { setter(value); invalidate(); };
  const admin = kind === 'sub2-admin';
  const map = (patch: Partial<CustomMapping>) => { setMapping(value => ({ ...value, ...patch })); invalidate(); };

  async function verify() {
    setBusy(true); setError(''); setVerified(undefined);
    try {
      const url = normalizeBaseUrl(baseUrl);
      const connectionId = existing?.connectionId ?? uid();
      const source: Source = { id: existing?.id ?? uid(), connectionId, name: name.trim() || hostLabel(url), baseUrl: url, kind,
        pinned: existing?.pinned ?? false, enabled: true,
        ...(admin && accountId.trim() ? { accountId: Number(accountId) } : {}),
        ...(kind === 'custom' ? { custom: { ...mapping, scale: Number(scale) } } : {}) };
      let credential: Credential;
      if (admin && authMode === 'login') {
        if (!email.trim() || !password) throw new QuotaError('CONFIG', '请输入后台邮箱和密码');
        credential = await loginAdmin(source, email, password);
      } else {
        if (!secret.trim()) throw new QuotaError('CONFIG', admin ? '请输入管理密钥' : '请输入 API Key');
        credential = { mode: 'key', apiKey: secret.trim() };
      }
      if (admin && !accountId.trim()) {
        const accounts = await listAdminAccounts(source, credential);
        if (!accounts.length) throw new QuotaError('UNSUPPORTED', '这个后台暂时没有可监控的上游账号');
        setVerified({ source, credential, accounts });
      } else {
        const result = await fetchSnapshot(source, credential);
        setVerified({ source: { ...source, resolvedKind: result.kind }, credential, snapshot: result.snapshot });
      }
    } catch (err) { setError(err instanceof QuotaError ? err.message : '连接未能完成，请检查站点和凭据后重试'); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!verified) return;
    setSaving(true); setError('');
    try {
      if (existing) await controller.reconnect(existing.connectionId, verified.credential);
      else {
        const sources = verified.accounts
          ? verified.accounts.filter(account => selected.includes(account.id)).map(account => ({ ...verified.source, id: uid(), accountId: account.id, name: name.trim() ? `${name.trim()} · ${account.name}` : account.name }))
          : [{ ...verified.source, name: name.trim() || verified.source.name }];
        await controller.addSources(sources, verified.credential);
      }
      onClose();
    } catch { setError('凭据未能保存，请检查设备存储空间后重试'); }
    finally { setSaving(false); }
  }

  return <Sheet visible title={existing ? '重新连接' : '添加连接'} subtitle={existing ? '更新此站点共用的凭据' : '把分散的额度，放在一起'} onClose={onClose}>
    {!existing ? <View style={{ gap: 10 }}>
      <Text style={[styles.label, { color: t.ink }]}>接入方式</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {kinds.map(item => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: kind === item }} disabled={busy || saving}
          onPress={() => { edit(setKind)(item); if (!baseUrl && item === 'deepseek') setBaseUrl('https://api.deepseek.com'); if (!baseUrl && item === 'openrouter') setBaseUrl('https://openrouter.ai'); }}
          style={{ paddingHorizontal: 13, paddingVertical: 11, borderRadius: 13, backgroundColor: kind === item ? t.accent : t.input }}>
          <Text style={{ color: kind === item ? (t.dark ? '#10243B' : '#FFFFFF') : t.secondary, fontSize: 12, fontWeight: kind === item ? '600' : '400' }}>{PROVIDER_LABELS[item]}</Text>
        </Pressable>)}
      </View>
    </View> : <Chip label={PROVIDER_LABELS[kind]} icon={Link2} />}
    <Field label="站点地址" placeholder="https://your-relay.com" value={baseUrl} onChangeText={edit(setBaseUrl)} keyboardType="url" editable={!existing && !busy && !saving}
      hint={admin ? '填写 Sub2API 后台所在的站点' : '填写你平时调用 API 的站点地址'} />
    {admin ? <View style={{ flexDirection: 'row', gap: 8 }}>
      {(['key', 'login'] as const).map(mode => <Pressable key={mode} disabled={busy || saving} onPress={() => edit(setAuthMode)(mode)}
        accessibilityRole="button" accessibilityState={{ selected: authMode === mode }} style={{ flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: authMode === mode ? t.accentSoft : t.input, alignItems: 'center' }}>
        <Text style={{ color: authMode === mode ? t.accent : t.secondary, fontSize: 12, fontWeight: '600' }}>{mode === 'key' ? '管理密钥' : '后台登录'}</Text>
      </Pressable>)}
    </View> : null}
    {admin && authMode === 'login' ? <>
      <Field label="后台邮箱" value={email} onChangeText={edit(setEmail)} keyboardType="email-address" autoComplete="email" editable={!busy && !saving} />
      <Field label="后台密码" value={password} onChangeText={edit(setPassword)} secureTextEntry autoComplete="current-password" editable={!busy && !saving} hint="密码仅用于本次登录，不保存在手机上" />
    </> : <View style={{ gap: 8 }}>
      <View style={styles.between}><Text style={[styles.label, { color: t.ink }]}>{admin ? '管理密钥' : 'API Key'}</Text>
        <IconButton icon={showSecret ? EyeOff : Eye} label={showSecret ? '隐藏密钥' : '显示密钥'} size={32} onPress={() => setShowSecret(value => !value)} />
      </View>
      <Field label={admin ? '输入管理密钥' : '输入 API Key'} placeholder={admin ? 'x-api-key 管理密钥' : 'sk-…'} value={secret} onChangeText={edit(setSecret)}
        secureTextEntry={!showSecret} editable={!busy && !saving} textContentType="none" autoComplete="off" />
    </View>}
    {!existing ? <Field label="显示名称（可选）" placeholder={admin ? '例如：我的 Plus' : '例如：Pro 工作站'} value={name} onChangeText={setName} editable={!saving} /> : null}
    {admin && !existing ? <View style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" disabled={busy || saving} onPress={() => setAdvanced(value => !value)} style={styles.between}>
        <Text style={{ color: t.secondary, fontSize: 12 }}>通过账号 ID 添加</Text><ChevronDown size={16} color={t.muted} />
      </Pressable>
      {advanced ? <Field label="上游账号 ID（可选）" value={accountId} onChangeText={edit(setAccountId)} keyboardType="number-pad" editable={!busy && !saving}
        hint="留空可读取账号列表。管理密钥仅允许查看单个账号时，可直接填 ID。" /> : null}
    </View> : null}
    {kind === 'custom' ? <Glass subtle style={{ padding: 17, gap: 15, borderRadius: 22 }}>
      <Text style={[styles.label, { color: t.ink }]}>读取规则</Text>
      <Field label="查询路径" value={mapping.path} onChangeText={path => map({ path })} editable={!existing && !busy && !saving} hint="仅支持当前站点内的 GET 查询" />
      <View style={{ flexDirection: 'row', gap: 8 }}>{(['bearer', 'x-api-key'] as const).map(auth => <Pressable key={auth} disabled={!!existing || busy || saving} accessibilityRole="button" onPress={() => map({ auth })}
        style={{ flex: 1, padding: 11, borderRadius: 12, backgroundColor: mapping.auth === auth ? t.accentSoft : t.input }}><Text style={{ textAlign: 'center', color: mapping.auth === auth ? t.accent : t.secondary, fontSize: 12 }}>{auth === 'bearer' ? 'Bearer Token' : 'x-api-key'}</Text></Pressable>)}</View>
      {([['remainingPath', '剩余字段'], ['usedPath', '已用字段（可选）'], ['limitPath', '总额度字段（可选）'], ['resetPath', '重置时间字段（可选）'], ['sampledPath', '采样时间字段（可选）']] as const).map(([key, label]) =>
        <Field key={key} label={label} placeholder={key === 'remainingPath' ? 'data.balance' : '留空'} value={mapping[key] ?? ''} onChangeText={value => map({ [key]: value })} editable={!existing && !busy && !saving} />)}
      <View style={{ flexDirection: 'row', gap: 12 }}><View style={{ flex: 1 }}><Field label="单位" value={mapping.unit} onChangeText={unit => map({ unit })} editable={!existing && !busy && !saving} /></View>
        <View style={{ flex: 1 }}><Field label="换算倍率" value={scale} onChangeText={edit(setScale)} keyboardType="decimal-pad" editable={!existing && !busy && !saving} /></View></View>
    </Glass> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: t.red, fontSize: 13, lineHeight: 21 }}>{error}</Text> : null}
    {verified ? <Glass style={{ padding: 18, gap: 14, borderRadius: 22 }}>
      <View style={[styles.row, { gap: 8 }]}><CheckCircle2 color={t.mint} size={18} /><Text style={{ color: t.mint, fontWeight: '600', fontSize: 14 }}>连接成功</Text></View>
      {verified.accounts ? <>
        <Text style={{ color: t.secondary, fontSize: 12 }}>选择要显示的上游账号 · 已选 {selected.length} 个</Text>
        {verified.accounts.map(account => <Pressable key={account.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(account.id) }} onPress={() => setSelected(values => values.includes(account.id) ? values.filter(id => id !== account.id) : [...values, account.id])}
          style={[styles.row, { paddingVertical: 10, gap: 12, borderTopWidth: 1, borderColor: t.line }]}>
          <Network size={19} color={t.mint} /><View style={{ flex: 1 }}><Text style={{ color: t.ink, fontSize: 13, fontWeight: '600' }}>{account.name}</Text><Text style={{ color: t.secondary, fontSize: 10, marginTop: 4 }}>#{account.id} · {account.platform}{account.hasQuota ? '' : ' · 暂无额度采样'}</Text></View>
          <View style={{ width: 23, height: 23, borderRadius: 8, borderWidth: 1, borderColor: selected.includes(account.id) ? t.accent : t.muted, backgroundColor: selected.includes(account.id) ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {selected.includes(account.id) ? <Check size={15} color="white" /> : null}
          </View>
        </Pressable>)}
      </> : verified.snapshot?.metrics.map(metric => <View key={metric.id} style={styles.between}><Text style={{ color: t.secondary, fontSize: 12 }}>{metric.label} · 剩余</Text><Text style={{ color: t.ink, fontSize: 19, fontWeight: '600' }}>{metric.unlimited ? '不限额' : amount(metric.remaining, metric.unit)}</Text></View>)}
    </Glass> : null}
    {verified ? <Button title={existing ? '更新连接' : verified.accounts ? `添加 ${selected.length} 个账号` : '添加到总览'} icon={Check} onPress={() => void save()} loading={saving} disabled={!!verified.accounts && !selected.length} />
      : <Button title="验证连接" icon={Link2} onPress={() => void verify()} loading={busy} />}
    <View style={[styles.row, { gap: 8, justifyContent: 'center', paddingBottom: 5 }]}><ShieldCheck size={13} color={t.muted} /><Text style={{ fontSize: 10, color: t.muted }}>凭据仅保存在本机 · 直接向你的站点查询</Text></View>
  </Sheet>;
}
