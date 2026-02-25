import { useWebViewBridge } from '@/src/hooks/useWebViewBridge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const APP_BG = '#ffffff';
const HOME_URL = 'https://www.iworkouttoday.com/';
const INACTIVE_NOTIFICATION_ID_KEY = 'inactive-user-notification-id';

// ✅ [추가됨] 안드로이드용 UserAgent (구글 403 에러 해결용: wv 제거됨)
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36";

// ✅ [추가됨] iOS용 UserAgent (애플/구글 로그인 안정성 확보용)
const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

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

  const handleAppStateChange = async (next : AppStateStatus) => {
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
        // 1일 후 알림 (1일 * 24시간 * 60분 * 60초)
        seconds: 1 * 24 * 60 * 60,
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
            
            // ✅ [추가됨] 여기서 플랫폼에 맞는 UserAgent를 주입합니다.
            userAgent={Platform.OS === 'android' ? ANDROID_UA : IOS_UA}
            
            contentInsetAdjustmentBehavior="never"
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState 
            onRenderProcessGone={() => webref.current?.reload()}
            onContentProcessDidTerminate={() => webref.current?.reload()}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            
            // ✅ [수정됨] false로 설정하는 것을 권장합니다.
            // 구글 로그인이 팝업을 띄우려 할 때, false면 현재 창에서 페이지가 이동되어 흐름이 더 매끄럽습니다.
            setSupportMultipleWindows={false}
            
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
