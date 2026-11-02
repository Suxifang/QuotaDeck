import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyRound } from 'lucide-react-native';
import type { QuotaController } from '../state/useQuota';
import type { Source } from '../domain/types';
import type { SiteSession } from '../providers/site-login';
import { usageLoginNeedsVerification } from '../providers/user-session';
import { QuotaError } from '../providers/transport';
import { Button, Field, Glass, styles } from './primitives';
import { useTheme } from './theme';
import { SiteLogin } from './site-login';

export function UsageLogin({ source, connect, onConnected }: { source: Source; connect: QuotaController['connectUsage']; onConnected: () => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [siteOpen, setSiteOpen] = useState(false);
  const [verification, setVerification] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function openSite() { setPassword(''); setCode(''); setTempToken(''); setError(''); setSiteOpen(true); }
  async function begin() {
    setBusy(true); setError('');
    let needsVerification = true;
    try { needsVerification = await usageLoginNeedsVerification(source); }
    catch { /* When public settings cannot be read, the site's own page handles its login requirements. */ }
    if (!alive.current) return;
    setBusy(false); setVerification(needsVerification);
    if (needsVerification) openSite(); else setOpen(true);
  }
  async function completeSite(session: SiteSession) {
    setBusy(true); setError('');
    try {
      await connect(source.id, { siteSession: session });
      if (!alive.current) return;
      setSiteOpen(false); setEmail(''); setPassword(''); onConnected();
    } catch (err) {
      if (alive.current) { setSiteOpen(false); setError(err instanceof QuotaError ? err.message : '登录未能完成，请稍后重试'); }
    } finally { if (alive.current) setBusy(false); }
  }
  async function login() {
    setBusy(true); setError('');
    try {
      const result = await connect(source.id, tempToken ? { tempToken, code } : { email, password });
      if (!alive.current) return;
      setPassword(''); setCode('');
      if ('requiresTwoFactor' in result) setTempToken(result.tempToken);
      else { setTempToken(''); setEmail(''); onConnected(); }
    } catch (err) {
      if (alive.current) setError(err instanceof QuotaError ? err.message : '登录未能完成，请稍后重试');
    } finally { if (alive.current) setBusy(false); }
  }
  return <Glass subtle style={{ padding: 19, gap: 15, borderRadius: 22 }}>
    <View style={[styles.row, { gap: 9 }]}><KeyRound size={18} color={t.accent} /><Text style={{ color: t.ink, fontSize: 15, fontWeight: '600' }}>登录后，直接看记录</Text></View>
    <Text style={{ color: t.secondary, fontSize: 12, lineHeight: 21 }}>使用购买套餐的站点账号。登录后自动关联当前密钥，额度查询照常使用原 API Key。</Text>
    {verification ? <Text style={{ color: t.secondary, fontSize: 12, lineHeight: 21 }}>本站有额外的登录验证，请在应用内的站点页面完成，随后自动返回。</Text> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: t.amber, fontSize: 12, lineHeight: 21 }}>{error}</Text> : null}
    {siteOpen ? <SiteLogin source={source} busy={busy} onClose={() => setSiteOpen(false)} onSession={completeSite} /> : null}
    {!open ? <Button title={verification ? '验证登录' : '登录站点查看记录'} loading={busy} onPress={() => { if (verification) openSite(); else void begin(); }} /> : <>
      {tempToken ? <Field label="两步验证码" value={code} onChangeText={setCode} keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} editable={!busy} placeholder="六位验证码" /> : <>
        <Field label="站点邮箱" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="username" autoComplete="username" editable={!busy} placeholder="购买套餐时使用的邮箱" />
        <Field label="站点密码" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" autoComplete="current-password" editable={!busy} placeholder="本站登录密码" />
      </>}
      <Button title={tempToken ? '验证并读取记录' : '登录并读取记录'} loading={busy} onPress={() => void login()} />
      <Button title="验证登录" secondary disabled={busy} onPress={openSite} />
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setOpen(false); setPassword(''); setCode(''); setTempToken(''); setError(''); }} style={{ padding: 7 }}><Text style={{ color: t.secondary, fontSize: 12, textAlign: 'center' }}>取消登录</Text></Pressable>
      <Text style={{ color: t.muted, fontSize: 10, lineHeight: 18 }}>支持邮箱密码及两步验证码。密码只用于本次登录，登录状态保存在手机钥匙串。</Text>
    </>}
  </Glass>;
}
