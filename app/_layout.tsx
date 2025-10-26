// app/_layout.tsx (expo-router 기준) 또는 현재 파일 최상단 레이아웃 컴포넌트
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';


const APP_BG = '#ffffff'; //웹배경색_확인 후 수정, 로그인 페이지 불일치 수정 필요
const HOME_URL = 'https://achiva.kr'; 

const INACTIVE_NOTIFICATION_ID_KEY = 'inactive-user-notification-id';

export default function RootLayout() {
  const appState = useRef(AppState.currentState);
  const webref = useRef<WebView>(null);

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

  const scheduleInactiveUserNotification = async () => {
    const existingId = await AsyncStorage.getItem(INACTIVE_NOTIFICATION_ID_KEY);
    if (existingId) return;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '오랜만이에요! 👋',
        body: '새로운 소식이 기다리고 있어요. 다시 방문해보세요!',
      },
      trigger: { 
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 10 }, // 예시: 10초
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
      {/* iOS에선 translucent 의미는 없지만, 상태바 영역까지 같은 톤 유지에 도움 */}
      <StatusBar style="dark" translucent backgroundColor="transparent" />

      {/* SafeAreaView의 edges를 top/bottom 모두 포함하고, 배경색을 APP_BG로 통일 */}
      <SafeAreaView style={{ flex: 1, backgroundColor: APP_BG }} edges={['top', 'bottom']}>
        {/* 바깥 View에도 동일 배경을 한 번 더 보강 (투명스크롤/바운스 시 비침 방지) */}
        <View style={{ flex: 1, backgroundColor: APP_BG }}>
          <WebView
            ref={webref}
            source={{ uri: HOME_URL }}
            // ★ WebView 자체는 투명 처리. 바깥 컨테이너 배경이 비치게 함.
            style={{ flex: 1, backgroundColor: 'transparent' }}
            // iOS 시스템이 자동으로 인셋을 더하지 않도록
            contentInsetAdjustmentBehavior="never"
            // (선택) 위아래 바운스 시 뒤 배경 노출을 줄이고 싶으면:
            bounces={false}
            // 아래는 기존에 쓰던 옵션들 (필요 시 유지)
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            setSupportMultipleWindows={false}
            onRenderProcessGone={() => webref.current?.reload()}
            onContentProcessDidTerminate={() => webref.current?.reload()}
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
