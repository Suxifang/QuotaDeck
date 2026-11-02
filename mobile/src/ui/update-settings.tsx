import React, { useState } from 'react';
import { Linking, Platform, Pressable, Switch, Text, View } from 'react-native';
import { ArrowDownToLine, ArrowUpRight, Check, ExternalLink, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react-native';
import { APP_VERSION, useUpdates } from '../updates/context';
import { formatBytes, RELEASE_REPOSITORY, RELEASES_URL } from '../updates/releases';
import { Button, Glass, Logo, styles } from './primitives';
import { useTheme } from './theme';

export function UpdateSettings() {
  const t = useTheme(); const updates = useUpdates(); const [linkError, setLinkError] = useState('');
  const { release, operation } = updates; const busy = operation !== 'idle' || !updates.loaded;
  const downloading = operation === 'downloading'; const verifying = operation === 'verifying';
  const open = async (url: string) => { try { setLinkError(''); await Linking.openURL(url); } catch { setLinkError('暂时无法打开链接，请稍后重试'); } };
  const progress = release ? Math.min(1, updates.bytes / release.size) : 0;
  return <>
    <Glass subtle style={{ padding: 23, gap: 17 }}>
      <View style={[styles.row, { gap: 16 }]}>
        <Logo size={62} /><View style={{ gap: 5, flex: 1 }}><Text style={{ color: t.ink, fontSize: 23, fontWeight: '600' }}>余度</Text>
          <Text style={{ color: t.secondary, fontSize: 12 }}>当前版本 {APP_VERSION}</Text></View>
        <View style={{ borderRadius: 10, backgroundColor: t.accentSoft, padding: 8 }}><ArrowUpRight color={t.accent} size={18} /></View>
      </View>
      <Text style={{ color: t.secondary, fontSize: 12, lineHeight: 21 }}>让每一次更新，也轻松一点。</Text>
      <Button title={operation === 'checking' ? '正在检查…' : '检查新版本'} icon={RefreshCw} disabled={busy} loading={operation === 'checking'} onPress={() => void updates.check()} />
      {updates.lastChecked ? <Text style={{ color: t.muted, fontSize: 10, textAlign: 'center' }}>上次检查 {new Date(updates.lastChecked).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text> : null}
    </Glass>
    {updates.message ? <View style={[styles.row, { gap: 8 }]}><Check color={t.mint} size={16} /><Text accessibilityLiveRegion="polite" style={{ color: t.secondary, fontSize: 12, lineHeight: 20, flex: 1 }}>{updates.message}</Text></View> : null}
    {updates.error || linkError ? <Text accessibilityRole="alert" style={{ color: t.red, fontSize: 12, lineHeight: 21 }}>{updates.error || linkError}</Text> : null}
    {release ? <Glass style={{ padding: 21, gap: 17 }}>
      <View style={styles.between}><Text style={{ color: t.ink, fontSize: 18, fontWeight: '600' }}>新版本 {release.version}</Text>
        <Text style={{ color: t.secondary, fontSize: 11 }}>{formatBytes(release.size)}</Text></View>
      <Text style={{ color: t.muted, fontSize: 10, marginTop: -9 }}>{new Date(release.publishedAt).toLocaleDateString('zh-CN')} · 正式版</Text>
      <View style={{ gap: 8 }}>{(release.notes || '体验与稳定性改进。').split('\n').filter(line => line.trim()).map((line, index) => <Text key={index} style={{ color: t.secondary, fontSize: 12, lineHeight: 21 }}>{line.replace(/^\s*#{1,6}\s+/, '').replace(/^\s*[-*]\s+/, '· ')}</Text>)}</View>
      <View style={{ height: 1, backgroundColor: t.line }} />
      {downloading || verifying ? <View style={{ gap: 12 }}>
        <View style={styles.between}><Text accessibilityLiveRegion="polite" style={{ color: t.ink, fontSize: 12 }}>{verifying ? '正在校验更新包…' : '正在下载…'}</Text>
          <Text style={{ color: t.secondary, fontSize: 11, fontVariant: ['tabular-nums'] }}>{verifying ? 'SHA-256' : `${Math.floor(progress * 100)}%`}</Text></View>
        <View accessibilityRole="progressbar" accessibilityLabel="更新包下载进度" accessibilityValue={{ min: 0, max: 100, now: Math.floor(progress * 100) }} style={{ height: 5, borderRadius: 3, backgroundColor: t.accentSoft, overflow: 'hidden' }}><View style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 3, backgroundColor: t.accent }} /></View>
        <Text style={{ color: t.muted, fontSize: 10 }}>{formatBytes(updates.bytes)} / {formatBytes(release.size)} · 请保持应用在前台</Text>
        <Button title="取消下载" secondary icon={X} onPress={() => void updates.cancel()} />
      </View> : Platform.OS === 'web' ? <>
        <Button title="在 GitHub 下载 IPA" icon={ExternalLink} disabled={busy} onPress={() => void open(release.downloadUrl)} />
        <Text style={{ color: t.secondary, fontSize: 11, lineHeight: 20 }}>iPhone 版支持应用内下载、校验和导入 LCSign。网页预览通过 GitHub 下载。</Text>
      </> : updates.downloaded ? <>
        <View style={[styles.row, { gap: 7 }]}><ShieldCheck size={16} color={t.mint} /><Text style={{ color: t.mint, fontSize: 11 }}>SHA-256 已校验</Text></View>
        <Button title={operation === 'sharing' ? '正在准备分享…' : '导入 LCSign'} icon={ArrowUpRight} loading={operation === 'sharing'} disabled={busy} onPress={() => void updates.share()} />
        <Text style={{ color: t.secondary, fontSize: 11, lineHeight: 20 }}>在系统分享面板中选择 LCSign，再签名安装。若未显示，可先“存储到文件”，然后在 LCSign 导入。</Text>
        <Button title="清理更新包缓存" secondary icon={Trash2} disabled={busy} onPress={() => void updates.clear()} />
      </> : <>
        <Button title="下载并校验 IPA" icon={ArrowDownToLine} disabled={busy} onPress={() => void updates.download()} />
        <Text style={{ color: t.secondary, fontSize: 11, lineHeight: 20 }}>下载完成后核对文件大小与 SHA-256，再交给 LCSign。</Text>
      </>}
    </Glass> : null}
    <View style={{ gap: 11, paddingVertical: 5 }}>
      <View style={[styles.between, { gap: 18 }]}><View style={{ gap: 6, flex: 1 }}><Text style={{ color: t.ink, fontSize: 14, fontWeight: '500' }}>自动检查新版本</Text><Text style={{ color: t.secondary, fontSize: 11, lineHeight: 18 }}>打开或回到应用时检查，最多每 6 小时一次。</Text></View>
        <Switch accessibilityLabel="自动检查新版本" value={updates.autoCheck} disabled={!updates.loaded} onValueChange={updates.setAutoCheck} trackColor={{ true: t.accent }} /></View>
      <Text style={{ color: t.muted, fontSize: 11, lineHeight: 20 }}>下载和安装均由你发起。覆盖更新时，请沿用已安装版本的签名身份和应用标识，并同时签署小组件。</Text>
    </View>
    <Pressable accessibilityRole="link" accessibilityLabel="打开 GitHub 发行页" onPress={() => void open(release?.pageUrl ?? RELEASES_URL)} style={[styles.row, { minHeight: 44, gap: 8 }]}>
      <ExternalLink size={14} color={t.accent} /><View style={{ flex: 1, gap: 4 }}><Text style={{ color: t.accent, fontSize: 12 }}>GitHub 发行页</Text><Text style={{ color: t.muted, fontSize: 10 }}>{RELEASE_REPOSITORY}</Text></View>
    </Pressable>
  </>;
}
