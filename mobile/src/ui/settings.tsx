import React, { useState } from 'react';
import { Linking, Platform, Pressable, Switch, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { ArrowDownToLine, Code2, Droplets, FlaskConical, LayoutGrid, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react-native';
import type { Preferences } from '../domain/types';
import type { QuotaController } from '../state/useQuota';
import { configurationExport } from '../state/storage';
import { Button, Glass, Logo, SectionLink, Sheet, styles } from './primitives';
import { useTheme } from './theme';
import notices from '../vendor/notices.json';
import { WidgetSettings } from './widget-settings';

function Segments<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const t = useTheme(); return <View style={{ flexDirection: 'row', gap: 5, backgroundColor: t.input, borderRadius: 14, padding: 4 }}>{options.map(option => <Pressable key={option.value} onPress={() => onChange(option.value)} accessibilityRole="button" accessibilityState={{ selected: value === option.value }}
    style={{ flex: 1, borderRadius: 11, paddingVertical: 11, alignItems: 'center', backgroundColor: value === option.value ? t.selected : 'transparent' }}><Text style={{ color: value === option.value ? t.ink : t.secondary, fontSize: 11, fontWeight: value === option.value ? '600' : '400' }}>{option.label}</Text></Pressable>)}</View>;
}

export function Settings({ controller }: { controller: QuotaController }) {
  const t = useTheme(); const prefs = controller.data.preferences;
  const [toast, setToast] = useState('');
  const [info, setInfo] = useState<'privacy' | 'credits' | 'history' | 'widgets'>();
  const [showLicenses, setShowLicenses] = useState(false);
  async function exportConfig() {
    try {
      const json = configurationExport(controller.saved);
      if (Platform.OS === 'web') { await Clipboard.setStringAsync(json); setToast('配置已复制，凭据未包含在内'); }
      else {
        const file = new File(Paths.cache, 'QuotaDeck-config.json'); file.write(json);
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json' });
        else { await Clipboard.setStringAsync(json); setToast('配置已复制'); }
      }
    } catch { setToast('暂时无法导出，请稍后重试'); }
  }
  return <>
    <View style={{ gap: 9 }}><Text style={{ color: t.muted, fontSize: 10, letterSpacing: 2 }}>PREFERENCES</Text><Text style={{ fontSize: 29, color: t.ink, fontWeight: '700', letterSpacing: -1 }}>按你的习惯。</Text><Text style={{ color: t.secondary, fontSize: 12, lineHeight: 20 }}>让余量，成为顺手的小工具。</Text></View>
    <Glass style={{ padding: 21, gap: 20 }}>
      <View style={[styles.row, { gap: 9 }]}><Droplets size={18} color={t.accent} /><Text style={{ color: t.ink, fontSize: 14, fontWeight: '600' }}>外观</Text><Text style={{ color: t.muted, fontSize: 10 }}>Liquid Glass</Text></View>
      <Segments<Preferences['theme']> options={[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }, { value: 'system', label: '跟随系统' }]} value={prefs.theme} onChange={theme => controller.changePreferences({ theme })} />
      <Text style={{ color: t.secondary, fontSize: 11, lineHeight: 20 }}>通透的磨砂质感，配合清晰的数字与流动的玻璃底栏。会跟随系统的降低透明度与减弱动态效果设置。</Text>
    </Glass>
    <Glass style={{ padding: 21, gap: 19 }}>
      <View style={[styles.row, { gap: 9 }]}><RefreshCw size={17} color={t.accent} /><Text style={{ color: t.ink, fontSize: 14, fontWeight: '600' }}>自动查询间隔</Text></View>
      <Segments<Preferences['refreshSeconds']> options={[{ value: 30, label: '30 秒' }, { value: 60, label: '1 分钟' }, { value: 120, label: '2 分钟' }, { value: 300, label: '5 分钟' }]} value={prefs.refreshSeconds} onChange={refreshSeconds => controller.changePreferences({ refreshSeconds })} />
      <Text style={{ color: t.muted, fontSize: 10, lineHeight: 18 }}>应用在前台时自动查询，回到应用也会刷新。反代额度以后台最近一次采样为准。</Text>
      <View style={{ height: 1, backgroundColor: t.line }} />
      <Text style={{ color: t.ink, fontSize: 13, fontWeight: '600' }}>低额度提示</Text>
      <Segments options={[{ value: 10, label: '低于 10%' }, { value: 20, label: '低于 20%' }, { value: 30, label: '低于 30%' }]} value={prefs.lowThreshold} onChange={lowThreshold => controller.changePreferences({ lowThreshold })} />
      <Text style={{ color: t.muted, fontSize: 10 }}>剩余比例达到阈值时，卡片会以琥珀色提示。</Text>
      <View style={[styles.between, { borderTopWidth: 1, borderColor: t.line, paddingTop: 16 }]}><Text style={{ color: t.ink, fontSize: 13 }}>轻触反馈</Text><Switch accessibilityLabel="轻触反馈" value={prefs.haptics} onValueChange={haptics => controller.changePreferences({ haptics })} trackColor={{ true: t.accent }} /></View>
    </Glass>
    <Glass style={{ paddingHorizontal: 20, borderRadius: 26 }}>
      <SectionLink title="桌面与锁屏小组件" subtitle="抬眼查看余量，选择你关注的账号" icon={LayoutGrid} onPress={() => setInfo('widgets')} />
      <View style={{ height: 1, backgroundColor: t.line }} />
      <SectionLink title="导出站点配置" subtitle="方便留存，导出内容不含密钥与登录状态" icon={ArrowDownToLine} onPress={() => void exportConfig()} />
      <View style={{ height: 1, backgroundColor: t.line }} /><SectionLink title="清空余量记录" subtitle="保留站点和连接" icon={Trash2} onPress={() => setInfo('history')} />
      <View style={{ height: 1, backgroundColor: t.line }} /><SectionLink title="数据与隐私" subtitle="凭据、记录与查询方式" icon={ShieldCheck} onPress={() => setInfo('privacy')} />
      <View style={{ height: 1, backgroundColor: t.line }} /><SectionLink title="开源致谢" subtitle="在已有好工具上，继续改进" icon={Code2} onPress={() => setInfo('credits')} />
    </Glass>
    {toast ? <Text accessibilityRole="alert" style={{ color: t.accent, fontSize: 12, textAlign: 'center' }}>{toast}</Text> : null}
    <Pressable accessibilityRole="button" onPress={controller.isDemo ? controller.exitDemo : controller.enterDemo} style={[styles.row, { justifyContent: 'center', gap: 7, padding: 10 }]}><FlaskConical color={t.secondary} size={15} /><Text style={{ color: t.secondary, fontSize: 12 }}>{controller.isDemo ? '退出演示模式' : '查看演示模式'}</Text></Pressable>
    <View style={{ alignItems: 'center', gap: 10, paddingTop: 3 }}><Logo size={32} /><Text style={{ color: t.muted, fontSize: 10 }}>余量 QuotaDeck · 0.1.0</Text></View>
    {info ? <Sheet visible title={info === 'privacy' ? '数据与隐私' : info === 'credits' ? '开源致谢' : info === 'widgets' ? '桌面与锁屏' : '清空余量记录'} onClose={() => setInfo(undefined)}>
      {info === 'widgets' ? <WidgetSettings controller={controller} /> : info === 'privacy' ? <>
        <Info title="直接连接你的站点" text="应用从手机直接查询你添加的接口。没有 QuotaDeck 中转服务器，不需要注册账号。" />
        <Info title="凭据留在本机" text="iOS 密钥与登录状态保存在系统钥匙串，设备解锁后可读；后台密码仅用于登录。网页预览的凭据只保留在当前页面内存中。" />
        <Info title="记录与导出" text="站点配置、最近成功额度及每天最后一条余量保存在本机，余量记录最多保留 90 天。导出配置不含凭据，也不含额度记录。" />
        <Info title="小组件" text="小组件与应用共享账号显示名称及最近额度，不共享密钥、登录状态或站点地址。演示数据只供应用内预览，不会写入小组件。" />
        <Info title="反代额度的时间" text="查询读取后台已经保存的额度采样。超过 15 分钟、没有采样时间或已过重置时间时，会提示采样待更新。" />
      </> : info === 'credits' ? <>
        <Info title="感谢这些 MIT 开源项目" text="复用了 sub2api-mobile 的接口地址处理、sub2api-dashboard 的额度映射与账号清洗，以及 dsh-gateway-wallet 的站点识别规则，并为本应用作了适配。" />
        {[['sub2api-mobile', 'https://github.com/ckken/sub2api-mobile'], ['sub2api-dashboard', 'https://github.com/CrossStar/sub2api-dashboard'], ['dsh-gateway-wallet', 'https://github.com/MuAllen/dsh-gateway-wallet']].map(([title, url]) => <SectionLink key={url} title={title} icon={Code2} onPress={() => void Linking.openURL(url)} />)}
        <Text style={{ color: t.secondary, fontSize: 11, lineHeight: 20 }}>完整许可及改动说明随源码提供。应用也使用 Expo、React Native、Lucide 等开源组件。</Text>
        <Button title={showLicenses ? '收起完整许可' : '查看完整许可'} secondary onPress={() => setShowLicenses(value => !value)} />
        {showLicenses ? notices.map(notice => <Info key={notice.name} title={notice.name} text={notice.license} />) : null}
      </> : <><Text style={{ color: t.secondary, fontSize: 13, lineHeight: 22 }}>清空本机已保存的每日余量记录？此操作无法撤销。</Text><Button title="确认清空记录" icon={Trash2} onPress={() => { controller.clearHistory(); setInfo(undefined); setToast('余量记录已清空'); }} /></>}
    </Sheet> : null}
  </>;
}

function Info({ title, text }: { title: string; text: string }) { const t = useTheme(); return <View style={{ gap: 9 }}><Text style={{ color: t.ink, fontSize: 14, fontWeight: '600' }}>{title}</Text><Text style={{ color: t.secondary, fontSize: 12, lineHeight: 23 }}>{text}</Text></View>; }
