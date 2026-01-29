
import { useWebViewBridge } from '@/src/hooks/useWebViewBridge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';


const APP_BG = '#ffffff'; //웹배경색_확인 후 수정, 로그인 페이지 불일치 수정 필요
const HOME_URL = 'https://achiva-fe-git-develop-achiva.vercel.app/api/auth/logout';

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

export default function RootLayout() {
  const appState = useRef(AppState.currentState);
  const webref = useRef<WebView>(null);
  const { onMessage /*, postMessageToWeb*/ } = useWebViewBridge(webref);

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

  const handleAppStateChange = async (next: AppStateStatus) => {
    if (appState.current === 'active' && next.match(/inactive|background/)) {
      await scheduleInactiveUserNotification();
    }
    if (appState.current.match(/inactive|background/) && next === 'active') {
      await cancelInactiveUserNotification();
    }
    appState.current = next;
  };

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true, // 이 값을 true로 해야 iOS에서 진동/소리가 납니다.
      shouldSetBadge: false,
      shouldShowBanner: true, // (최신 expo-notifications 타입 호환용)
      shouldShowList: true, // (최신 expo-notifications 타입 호환용)
    }),
  });

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

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" translucent backgroundColor="transparent" />

      <SafeAreaView style={{ flex: 1, backgroundColor: APP_BG }} edges={['top', 'bottom']}>
        {/* 바운스시 비치는 문제 수정 */}
        <View style={{ flex: 1, backgroundColor: APP_BG }}>
          <WebView
            ref={webref}
            source={{ uri: HOME_URL }}
            // 웹뷰는 투명처리
            style={{ flex: 1, backgroundColor: 'transparent' }}
            contentInsetAdjustmentBehavior="never"

            //bounces={false} ->> 바운스 일단 넣은 상태

            javaScriptEnabled
            domStorageEnabled
            startInLoadingState

            onRenderProcessGone={() => webref.current?.reload()}
            onContentProcessDidTerminate={() => webref.current?.reload()}
            
            sharedCookiesEnabled={true}        // iOS에서 중요
            thirdPartyCookiesEnabled={true}    // Android에서 중요
            setSupportMultipleWindows={true}            
            javaScriptCanOpenWindowsAutomatically={true}

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
