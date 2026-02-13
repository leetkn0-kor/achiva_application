import { useWebViewBridge } from '@/src/hooks/useWebViewBridge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const APP_BG = '#ffffff';
const HOME_URL = 'https://achiva-fe-git-develop-achiva.vercel.app/';
const INACTIVE_NOTIFICATION_ID_KEY = 'inactive-user-notification-id';

const INJECT_CONSOLE = `
(function() {
  function send(type, args){
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
        JSON.stringify({ __wv_console__: true, type, args })
      );
    } catch (e) {}
  }
  ['log','info','warn','error','debug'].forEach(function(type){
    var orig = console[type];
    console[type] = function(){
      send(type, Array.prototype.slice.call(arguments));
      try { orig && orig.apply(console, arguments); } catch(e){}
    }
  });
})();
true;
`;

// ✅ 전역(파일 최상단)에서 1회만 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  const appState = useRef(AppState.currentState);
  const webref = useRef<WebView>(null);
  const { onMessage } = useWebViewBridge(webref);

  useEffect(() => {
    const setupNotifications = async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      console.log('[PUSH] permission status:', status);
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

    // ✅ 디버깅 리스너 추가
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      console.log('[PUSH] Received:', JSON.stringify(notification));
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('[PUSH] Response:', JSON.stringify(response));
    });

    const sub = AppState.addEventListener('change', handleAppStateChange);

    cancelInactiveUserNotification();

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
      sub.remove();
    };
  }, []);

  const handleAppStateChange = async (next: AppStateStatus) => {
    if (appState.current === 'active' && next.match(/inactive|background/)) {
      await scheduleInactiveUserNotification();
    }
    if (appState.current.match(/inactive|background/) && next === 'active') {
      await cancelInactiveUserNotification();
    }
    appState.current = next;
  };

  const scheduleInactiveUserNotification = async () => {
    const existingId = await AsyncStorage.getItem(INACTIVE_NOTIFICATION_ID_KEY);
    if (existingId) return;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '오랜만이에요! 👋',
        body: '새로운 소식이 기다리고 있어요. 다시 방문해보세요!',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 10,
      },
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

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <SafeAreaView style={{ flex: 1, backgroundColor: APP_BG }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, backgroundColor: APP_BG }}>
          <WebView
            ref={webref}
            source={{ uri: HOME_URL }}
            style={{ flex: 1, backgroundColor: 'transparent' }}
            contentInsetAdjustmentBehavior="never"
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            onRenderProcessGone={() => webref.current?.reload()}
            onContentProcessDidTerminate={() => webref.current?.reload()}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            setSupportMultipleWindows
            javaScriptCanOpenWindowsAutomatically
            injectedJavaScriptBeforeContentLoaded={INJECT_CONSOLE}
            onMessage={onMessage}
            onNavigationStateChange={(nav) => console.log('[WV nav]', nav.url)}
            onError={(e) => console.log('[WV error]', e.nativeEvent)}
            onHttpError={(e) =>
              console.log('[WV http]', e.nativeEvent.statusCode, e.nativeEvent.description, e.nativeEvent.url)
            }
            onShouldStartLoadWithRequest={(req) => {
              console.log('[WV req]', req.url);
              return true;
            }}
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
