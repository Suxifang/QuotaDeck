import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { X } from 'lucide-react-native';
import { isSitePage, readSiteSession, siteLoginScript, siteLoginUrl } from '../providers/site-login';
import { Button, styles } from './primitives';
import type { SiteLoginProps } from './site-login.types';
import { useTheme } from './theme';

export function SiteLogin({ source, busy, onClose, onSession }: SiteLoginProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const browser = useRef<WebView<object>>(null);
  const submitted = useRef(false);
  const active = useRef(true);
  const [error, setError] = useState('');
  const url = siteLoginUrl(source);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  function close() { if (!busy) { active.current = false; onClose(); } }
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: t.sheet }}>
      <View style={[styles.between, { paddingHorizontal: 20, paddingVertical: 14, gap: 12 }]}>
        <View style={{ flex: 1, gap: 5 }}><Text style={{ color: t.ink, fontSize: 20, fontWeight: '600' }}>验证并登录</Text><Text numberOfLines={1} style={{ color: t.secondary, fontSize: 11 }}>{new URL(url).host}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭站点登录" disabled={busy} onPress={close} style={{ padding: 10, opacity: busy ? .35 : 1 }}><X size={20} color={t.ink} /></Pressable>
      </View>
      <Text style={{ color: t.secondary, fontSize: 11, paddingHorizontal: 20, paddingBottom: 14, lineHeight: 18 }}>按本站提示完成登录，随后自动返回使用记录。</Text>
      <View style={{ flex: 1 }}>
        <WebView<object> ref={browser} source={{ uri: url }} style={{ flex: 1, backgroundColor: t.sheet }}
          incognito cacheEnabled={false} sharedCookiesEnabled={false}
          // Keep outside links inside this decision instead of opening another app.
          originWhitelist={['*']}
          onShouldStartLoadWithRequest={navigation => navigation.isTopFrame === false || isSitePage(navigation.url, source.baseUrl)}
          javaScriptCanOpenWindowsAutomatically={false}
          onOpenWindow={() => setError('请在当前页面使用本站的邮箱和密码登录。')}
          injectedJavaScriptForMainFrameOnly
          injectedJavaScript={siteLoginScript(source.baseUrl)}
          onMessage={({ nativeEvent }) => {
            if (!active.current || submitted.current || busy) return;
            const session = readSiteSession(nativeEvent.data, nativeEvent.url, source.baseUrl);
            if (!session) return;
            submitted.current = true;
            void onSession(session);
          }}
          startInLoadingState
          renderLoading={() => <View style={{ position: 'absolute', inset: 0, backgroundColor: t.sheet, alignItems: 'center', justifyContent: 'center', gap: 12 }}><ActivityIndicator color={t.accent} /><Text style={{ color: t.secondary, fontSize: 12 }}>正在打开站点登录页…</Text></View>}
          renderError={() => <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 18 }}><Text style={{ color: t.ink, fontSize: 15 }}>登录页面暂时无法打开</Text><Text style={{ color: t.secondary, fontSize: 12, lineHeight: 21 }}>请检查手机网络后重试。</Text><Button title="重新打开" secondary onPress={() => browser.current?.reload()} /></View>}
        />
        {busy ? <View accessibilityLiveRegion="polite" style={{ position: 'absolute', inset: 0, backgroundColor: t.sheet, alignItems: 'center', justifyContent: 'center', gap: 14 }}><ActivityIndicator color={t.accent} /><Text style={{ color: t.ink, fontSize: 14 }}>正在关联当前密钥…</Text><Text style={{ color: t.secondary, fontSize: 11 }}>完成后自动显示使用记录</Text></View> : null}
      </View>
      {error ? <Text accessibilityRole="alert" style={{ color: t.amber, fontSize: 11, padding: 16 }}>{error}</Text> : null}
    </View>
  </Modal>;
}
