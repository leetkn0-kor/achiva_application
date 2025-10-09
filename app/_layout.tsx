import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from '../src/navigation/AppNavigator'; // 경로가 맞는지 확인해주세요.

// --- 알림 로직 시작 ---

// 알림이 도착했을 때의 기본 동작 설정 (앱 실행 중에도 알림 표시)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true, // 소리가 나게 하려면 true
    shouldSetBadge: false,
    // 최신 expo-notifications 타입 정의에 따른 필수 속성 추가
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// AsyncStorage에 저장할 알림 ID의 키 (상수)
const INACTIVE_NOTIFICATION_ID_KEY = 'inactive-user-notification-id';

const App: React.FC = () => {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // 1. 알림 권한 요청 및 채널 설정 함수
    const setupNotifications = async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        alert('푸시 알림 권한을 허용해야 앱의 유용한 소식을 받을 수 있어요!');
        return;
      }

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

    // 2. 앱 상태 변경 감지 리스너 등록
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // 3. 앱이 처음 켜졌을 때 혹시 모를 이전 알림을 취소
    cancelInactiveUserNotification();

    // 컴포넌트가 사라질 때 리스너 정리
    return () => {
      subscription.remove();
    };
  }, []);

  // 앱 상태 변경 처리 함수
  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    // 앱이 활성 상태에서 비활성/백그라운드로 전환될 때
    if (appState.current.match(/active/) && nextAppState.match(/inactive|background/)) {
      console.log('앱이 백그라운드로 전환! 10초 뒤 알림을 예약합니다.');
      await scheduleInactiveUserNotification();
    }

    // 앱이 백그라운드에서 다시 활성 상태로 돌아올 때
    if (appState.current.match(/background/) && nextAppState === 'active') {
      console.log('앱이 활성화! 예약된 알림을 취소합니다.');
      await cancelInactiveUserNotification();
    }

    appState.current = nextAppState;
  };

  // 휴면 사용자 알림 예약 함수
  const scheduleInactiveUserNotification = async () => {
    const triggerInSeconds = 10; // 10초로 설정

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '오랜만이에요! 👋',
        body: '새로운 소식이 기다리고 있어요. 다시 방문해보세요!',
      },
      // 👈 [오류 수정] SDK 버전에 가장 확실한 '숫자' 타입으로 trigger를 설정합니다.
      trigger: {
       type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
       seconds: 10,
      },
    });

    // 나중에 취소할 수 있도록 알림 ID를 기기에 저장
    await AsyncStorage.setItem(INACTIVE_NOTIFICATION_ID_KEY, notificationId);
    console.log(`[알림 예약 완료] ID: ${notificationId}, ${triggerInSeconds}초 뒤에 울립니다.`);
  };

  // 예약된 휴면 알림 취소 함수
  const cancelInactiveUserNotification = async () => {
    const notificationId = await AsyncStorage.getItem(INACTIVE_NOTIFICATION_ID_KEY);

    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await AsyncStorage.removeItem(INACTIVE_NOTIFICATION_ID_KEY);
      console.log(`[알림 취소 완료] ID: ${notificationId}`);
    }
  };

  // --- 알림 로직 끝 ---

  return (
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  );
};

export default App;

