import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { MutableRefObject, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

type WvConsoleMessage = {
  __wv_console__: true;
  type: 'log' | 'info' | 'warn' | 'error' | 'debug';
  args: any[];
};

type LoginSuccessMessage = {
  type: 'LOGIN_SUCCESS';
  linkToken: string;
};

type RequestCameraMessage = { type: 'REQUEST_CAMERA' };

type WebToAppMessage = WvConsoleMessage | LoginSuccessMessage | RequestCameraMessage;

type AppToWebMessage =
  | { type: 'IMAGE_DATA'; data: string }
  | { type: 'PUSH_LINKED'; ok: true }
  | { type: 'PUSH_LINK_ERROR'; ok: false; reason: string }
  | { type: 'PUSH_REGISTERED'; ok: true }
  | { type: 'PUSH_REGISTER_ERROR'; ok: false; reason: string };

type WebViewRef = MutableRefObject<WebView | null>;

// ✅ 여기는 웹(Next.js) 도메인 or API 서버 도메인
const API_BASE = 'https://achiva-fe-git-develop-achiva.vercel.app';

export function useWebViewBridge(webViewRef: WebViewRef) {
  const handledLoginRef = useRef(false);

  const postMessageToWeb = (message: AppToWebMessage) => {
    if (!webViewRef.current) return;
    const script = `
      window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(message)} }));
      true;
    `;
    webViewRef.current.injectJavaScript(script);
  };

  const verifyLinkToken = async (linkToken: string) => {
    const res = await fetch(`${API_BASE}/api/push/link-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkToken }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`verify failed: ${res.status} ${text}`);
    }
  };

  // ✅ RootLayout에서 권한 요청을 이미 했으므로, 여기서는 "상태 확인"만
  const ensurePushPermissionGranted = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      // 여기서 다시 requestPermissionsAsync()를 하지 않는 이유:
      // 로그인 성공 이벤트가 여러 번 오면 사용자에게 권한 팝업이 반복될 수 있음
      throw new Error('push permission not granted');
    }
  };

  const getExpoPushToken = async () => {
    // iOS 시뮬레이터에서는 토큰이 안 나오는 경우가 있으니, 로그로 확인 추천
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    if (!token) throw new Error('failed to get expoPushToken');
    return token;
  };

  const registerPushToken = async (linkToken: string, expoPushToken: string) => {
    const res = await fetch(`${API_BASE}/api/push/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        linkToken,
        expoPushToken,
        platform: Platform.OS, // ios | android
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`register failed: ${res.status} ${text}`);
    }
  };

  const onMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      const raw = event.nativeEvent.data;
      const message: any = JSON.parse(raw);

      // (A) 웹 콘솔 미러링
      if (message?.__wv_console__ === true) {
        const m = message as WvConsoleMessage;
        const args = Array.isArray(m.args) ? m.args : [];
        (console[m.type] ?? console.log)('[WEB]', ...args);
        return;
      }

      // (B) 업무 메시지
      const typed = message as WebToAppMessage;
      console.log('Web -> App 메시지 수신:', typed);

      if (typed.type === 'REQUEST_CAMERA') {
        showImagePickerOptions();
        return;
      }

      if (typed.type === 'LOGIN_SUCCESS') {
        if (handledLoginRef.current) return;
        handledLoginRef.current = true;

        if (!typed.linkToken) {
          postMessageToWeb({ type: 'PUSH_LINK_ERROR', ok: false, reason: 'missing linkToken' });
          return;
        }

        // 1) linkToken 검증 (선택이지만 권장)
        try {
          await verifyLinkToken(typed.linkToken);
          postMessageToWeb({ type: 'PUSH_LINKED', ok: true });
        } catch (e: any) {
          postMessageToWeb({ type: 'PUSH_LINK_ERROR', ok: false, reason: e?.message ?? 'verify error' });
          return;
        }

        // 2) 푸시 권한 상태 확인 + expoPushToken 발급 + 서버 등록
        try {
          await ensurePushPermissionGranted();
          const expoPushToken = await getExpoPushToken();
          await registerPushToken(typed.linkToken, expoPushToken);

          postMessageToWeb({ type: 'PUSH_REGISTERED', ok: true });
          console.log('푸시 토큰 등록 완료:', expoPushToken);
        } catch (e: any) {
          postMessageToWeb({ type: 'PUSH_REGISTER_ERROR', ok: false, reason: e?.message ?? 'register error' });
        }

        return;
      }
    } catch (error) {
      console.error('메시지 처리 중 오류 발생:', error);
    }
  };

  // 이하 카메라 로직(기존 유지)
  const showImagePickerOptions = () => {
    Alert.alert('사진 첨부', '사진을 첨부할 방법을 선택해주세요.', [
      { text: '카메라로 촬영', onPress: () => openCamera() },
      { text: '앨범에서 선택', onPress: () => openImageLibrary() },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '카메라를 사용하려면 권한을 허용해야 합니다.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      allowsEditing: true,
      quality: 0.8,
    });
    handleImageResult(result);
  };

  const openImageLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '사진첩에 접근하려면 권한을 허용해야 합니다.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      allowsEditing: true,
      quality: 0.8,
    });
    handleImageResult(result);
  };

  const handleImageResult = (result: ImagePicker.ImagePickerResult) => {
    if (!result.canceled) {
      postMessageToWeb({ type: 'IMAGE_DATA', data: result.assets[0].base64 ?? '' });
    }
  };

  return { onMessage };
}
