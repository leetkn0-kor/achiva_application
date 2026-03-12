import { useWebViewBridge } from '@/src/hooks/useWebViewBridge';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, BackHandler, Platform, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const APP_BG = '#ffffff';
const HOME_URL = 'https://www.iworkouttoday.com/?is_app=true'; // app=true 지워도 상관없을듯?

// 아래는 os별 useragent - 크롬(안드로이드) 사파리(ios) 구글 오픈로그인 접속 가능
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
const IPAD_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

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

const INJECT_LAYOUT_FIX = `
  // 1.두 손가락 줌 & 더블 탭 줌 강제 무력화
  document.addEventListener('touchstart', function(event) {
    if (event.touches.length > 1) { event.preventDefault(); }
  }, { passive: false });

  var lastTouchEnd = 0;
  document.addEventListener('touchend', function(event) {
    var now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) { event.preventDefault(); }
    lastTouchEnd = now;
  }, { passive: false });

  // 2. 가로로 삐져나가는 요소 강제 절단 (레이아웃 틀어짐 원천 차단 CSS)
  var style = document.createElement('style');
  style.innerHTML = 'html, body { width: 100vw !important; max-width: 100% !important; overflow-x: hidden !important; margin: 0 !important; padding: 0 !important; }';
  document.head.appendChild(style);

  // 3.  Next.js가 페이지 이동할 때 뷰포트 몰래 바꾸는 걸 0.5초마다 감시해서 1.0배율로 강제 고정
  setInterval(function() {
    var meta = document.querySelector('meta[name="viewport"]');
    var content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, shrink-to-fit=no';
    
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = content;
      document.head.appendChild(meta);
    } else if (meta.content !== content) {
      meta.content = content;
    }
  }, 500);

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

  const [swipeEnabled, setSwipeEnabled] = useState(false); // iOS 스와이프 온오프 스위치
  const canGoBack = useRef(false); // 웹뷰가 뒤로 갈 수 있는지 여부
  const isExternalAuthRef = useRef(false); // 현재 외부(구글/애플) 창인지 여부

  // 🚨 [새로 추가된 부분 1] 안드로이드 물리 '뒤로 가기' 버튼 제어!
  useEffect(() => {
    const onBackPress = () => {
      // "외부 로그인 창"이면서 "뒤로 갈 페이지가 있을 때"만 웹뷰 뒤로 가기 실행
      if (webref.current && canGoBack.current && isExternalAuthRef.current) {
        webref.current.goBack();
        return true; // 안드로이드 앱 강제 종료 방지
      }
      return false; // 우리 앱 내부라면 원래대로 무시 (앱 종료 또는 프론트엔드 라우팅에 맡김)
    };

    // ✅ 여기서 깔끔하게 .remove() 방식으로 변경!
    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    const setupNotifications = async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      console.log('[PUSH] permission status:', status);
      if (status !== 'granted') return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('popup-channel', {
          name: '팝업알림',
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

    Notifications.cancelAllScheduledNotificationsAsync();

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
      sub.remove();
    };
  }, []);

  const handleAppStateChange = async (next: AppStateStatus) => {
    if (next === 'active') {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
    
    if (appState.current === 'active' && next.match(/inactive|background/)) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '오랜만이에요! 👋',
          body: '새로운 소식이 기다리고 있어요. 다시 방문해보세요!',
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 24 * 60 * 60, // 24시간
        },
      });
    }

    appState.current = next;
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
            
            userAgent={
             Platform.OS === 'android' 
             ? ANDROID_UA 
             : (Platform.OS === 'ios' && (Platform as any).isPad ? IPAD_UA : IPHONE_UA)
            }
            
            setBuiltInZoomControls={false}  
            textZoom={100}                  
            scalesPageToFit={false}         
            bounces={true}                 
            showsHorizontalScrollIndicator={false} 

            // 🚨 [새로 추가된 부분 2] iOS 외부창 한정 스와이프 허용
            allowsBackForwardNavigationGestures={swipeEnabled}

            injectedJavaScript={INJECT_LAYOUT_FIX}

            contentInsetAdjustmentBehavior="never"
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState 
            onRenderProcessGone={() => webref.current?.reload()}
            onContentProcessDidTerminate={() => webref.current?.reload()}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically
            injectedJavaScriptBeforeContentLoaded={INJECT_CONSOLE}
            onMessage={onMessage}
            
            // 🚨 [새로 추가된 부분 3] URL 변경 감지하여 스위치 껐다 켜기
            onNavigationStateChange={(nav) => {
              console.log('[WV nav]', nav.url);
              canGoBack.current = nav.canGoBack;
              
              // 현재 URL에 'iworkouttoday.com'이 없으면 외부(구글/애플)로 간주!
              const isExternal = !nav.url.includes('iworkouttoday.com');
              isExternalAuthRef.current = isExternal;
              setSwipeEnabled(isExternal);
            }}

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