import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform, StyleSheet, View } from 'react-native';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import NativeNavBar from '../src/components/MobileNavBar';


const APP_BG = '#ffffff';
const HOME_URL = 'https://achiva.kr';
const INACTIVE_NOTIFICATION_ID_KEY = 'inactive-user-notification-id';
const BAR_HEIGHT = 60;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    // 최신 expo-notifications 타입 호환 플래그 (플랫폼별 무시될 수 있음)
    shouldShowBanner: true as any,
    shouldShowList: true as any,
  }),
});

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

function RootLayout() {
  const appState = useRef(AppState.currentState);
  const webRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const webviewRef = useRef<any>(null);

  const [currentPath, setCurrentPath] = useState<string>('/');

  useEffect(() => {
    const setupNotifications = async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
    };
    setupNotifications();

    const sub = AppState.addEventListener('change', handleAppStateChange);
    cancelInactiveUserNotification();
    return () => sub.remove();
  }, []);

  const scheduleInactiveUserNotification = async () => {
    const existingId = await AsyncStorage.getItem(INACTIVE_NOTIFICATION_ID_KEY);
    if (existingId) return;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '오랜만이에요! 👋',
        body: '새로운 소식이 기다리고 있어요. 다시 방문해보세요!',
        sound: true
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 10
      }, // 현재 10초로 설정
    });
    await AsyncStorage.setItem(INACTIVE_NOTIFICATION_ID_KEY, id);
  };

  const cancelInactiveUserNotification = async () => {
    const id = await AsyncStorage.getItem(INACTIVE_NOTIFICATION_ID_KEY);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(INACTIVE_NOTIFICATION_ID_KEY);
    }
  };

  const handleAppStateChange = async (next: AppStateStatus) => {
    if (appState.current === 'active' && next.match(/inactive|background/)) {
      await scheduleInactiveUserNotification();
    }
    if (appState.current.match(/inactive|background/) && next === 'active') {
      await cancelInactiveUserNotification();
    }
    appState.current = next;
  };

  const onNavigationStateChange = useCallback((navState: any) => {
    try {
      const url = new URL(navState.url);
      setCurrentPath(url.pathname === '' ? '/' : url.pathname);
    } catch { }
  }, []);

  const onSelect = useCallback((path: string) => {
    const url = `${HOME_URL}${path}${path.includes('?') ? '&' : '?'}is_app=true`;
    webviewRef.current?.injectJavaScript(`window.location.href = ${JSON.stringify(url)}; true;`);
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />

      {/* 단일 WebView */}
      <View style={styles.webContainer}>
        <WebView
          ref={webRef}
          source={{ uri: `${HOME_URL}/?is_app=true` }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          contentInsetAdjustmentBehavior="never"
          injectedJavaScript={injectedHideNav}
          startInLoadingState
          setSupportMultipleWindows={false}
          onNavigationStateChange={onNavigationStateChange}
          onRenderProcessGone={() => webRef.current?.reload()}
          onContentProcessDidTerminate={() => webRef.current?.reload()}
        />
      </View>

      {/* 네이티브 바텀 내비 오버레이 */}
      <SafeAreaView
        edges={['bottom']}
        style={[styles.navOverlay, { paddingBottom: insets.bottom }]}
        pointerEvents="box-none"
      >
        <View style={[styles.navBar, { height: BAR_HEIGHT }]}>
          <NativeNavBar currentPath={currentPath} onSelect={onSelect} />
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <RootLayout />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: APP_BG },
  webContainer: { flex: 1, backgroundColor: APP_BG },
  webview: { flex: 1, backgroundColor: 'transparent' },
  navOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  navBar: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
    justifyContent: 'center',
  },
});
