import Constants from 'expo-constants';
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

// ✅ 백엔드가 Next.js 안에 있으면 웹 도메인, 별도 API면 api 도메인
const API_BASE = 'https://achiva-fe-git-develop-achiva.vercel.app';

function getProjectId(): string | undefined {
  // EAS/Dev Build 환경에서 push token 발급에 projectId가 필요할 수 있음
  return (
    Constants.easConfig?.projectId ||
    (Constants.expoConfig as any)?.extra?.eas?.projectId ||
    undefined
  );
}

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
    // (선택) 백엔드에 link-verify가 없으면 이 함수/호출을 제거하세요.
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

  /**
   * ✅ 권한은 "한 번만" 요청하는 게 안전함.
   * - RootLayout에서 이미 요청하지만, 타이밍/상태 꼬이면 여기서 막힐 수 있음.
   * - handledLoginRef로 중복 방지하므로 팝업이 반복되진 않음.
   */
  const ensurePushPermissionGranted = async () => {
    const perm = await Notifications.getPermissionsAsync();
    let status = perm.status;

    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }

    if (status !== 'granted') {
      throw new Error('push permission not granted');
    }
  };

  const getExpoPushToken = async () => {
    const projectId = getProjectId();
    const tokenRes = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    const token = tokenRes.data;
    if (!token) throw new Error('failed to get expoPushToken');
    return token; // "ExponentPushToken[...]" 형태
  };

  const registerPushToken = async (linkToken: string, expoPushToken: string) => {
    const res = await fetch(`${API_BASE}/api/push/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        linkToken,
        expoPushToken,
        // ✅ 백엔드 명세가 deviceInfo였음 (platform 말고)
        deviceInfo: Platform.OS, // "ios" | "android"
      }),
    });

    const text = await res.text().catch(() => '');
    if (!res.ok) {
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

        // 0) (디버깅용) projectId 확인 로그
        console.log('[PUSH] projectId:', getProjectId());

        // 1) linkToken 검증 (선택)
        try {
          await verifyLinkToken(typed.linkToken);
          postMessageToWeb({ type: 'PUSH_LINKED', ok: true });
        } catch (e: any) {
          postMessageToWeb({
            type: 'PUSH_LINK_ERROR',
            ok: false,
            reason: e?.message ?? 'verify error',
          });
          return;
        }

        // 2) 권한 확인/요청 + expoPushToken 발급 + 서버 등록
        try {
          await ensurePushPermissionGranted();

          const expoPushToken = await getExpoPushToken();
          console.log('[PUSH] expoPushToken:', expoPushToken);

          await registerPushToken(typed.linkToken, expoPushToken);

          postMessageToWeb({ type: 'PUSH_REGISTERED', ok: true });
          console.log('[PUSH] register OK');
        } catch (e: any) {
          console.log('[PUSH] register error:', e?.message ?? e);
          postMessageToWeb({
            type: 'PUSH_REGISTER_ERROR',
            ok: false,
            reason: e?.message ?? 'register error',
          });
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
