import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import NativeNavBar from '../src/components/MobileNavBar';

const WEB_BASE = 'https://achiva.kr';
const BAR_HEIGHT = 60;

const injectedHideNav = `
(function() {
  function hide() {
    var nav = document.getElementsByTagName('nav')[0];
    if (nav) nav.style.display = 'none';
  }
  hide();
  var observer = new MutationObserver(hide);
  observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();
true;
`;

function AppInner() {
  const insets = useSafeAreaInsets();
  const webviewRef = useRef<any>(null);
  const [currentPath, setCurrentPath] = useState<string>('/');

  const onNavigationStateChange = useCallback((navState: any) => {
    try {
      const url = new URL(navState.url);
      setCurrentPath(url.pathname === '' ? '/' : url.pathname);
    } catch {}
  }, []);

  const onSelect = useCallback((path: string) => {
    const url = `${WEB_BASE}${path}${path.includes('?') ? '&' : '?'}is_app=true`;
    webviewRef.current?.injectJavaScript(`window.location.href = ${JSON.stringify(url)}; true;`);
  }, []);

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ uri: `${WEB_BASE}/?is_app=true` }}
        style={[styles.webview, { marginBottom: BAR_HEIGHT + insets.bottom }]}
        onNavigationStateChange={onNavigationStateChange}
        injectedJavaScript={injectedHideNav}
        javaScriptEnabled
        domStorageEnabled
      />

      {/* 하단 인셋을 강제로 적용 */}
      <SafeAreaView
        edges={['bottom']}
        style={styles.navAreaOverlay}
        pointerEvents="box-none"
      >
        <View style={[styles.navBar, { height: BAR_HEIGHT }]}>
          <NativeNavBar currentPath={currentPath} onSelect={onSelect} />
        </View>
      </SafeAreaView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppInner />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
  navAreaOverlay: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
  },
  navBar: {
    justifyContent: 'center',
  },
});
