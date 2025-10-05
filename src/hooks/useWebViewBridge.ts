import * as ImagePicker from 'expo-image-picker';
import { MutableRefObject } from 'react';
import { Alert } from 'react-native';
import { WebView } from 'react-native-webview';

// ## 타입 정의 ##

// 웹과 주고받을 메시지에 대한 약속(타입)
// | (파이프) 기호는 '또는'을 의미합니다. type은 'REQUEST_CAMERA' 또는 'IMAGE_DATA'만 가능합니다.
type WebViewMessage = {
  type: 'REQUEST_CAMERA' | 'IMAGE_DATA';
  data?: any; // data는 어떤 타입이든 올 수 있으며, 없을 수도 있습니다.
};

// WebView의 ref에 대한 타입 정의
type WebViewRef = MutableRefObject<WebView | null>;

// ## 커스텀 훅 ##

// webViewRef를 인자로 받아 웹과 통신하는 훅(hook)
export function useWebViewBridge(webViewRef: WebViewRef) {
  
  // 웹으로부터 메시지를 받았을 때 실행될 메인 핸들러
  // event 객체의 타입도 명확히 지정해줍니다.
  const onMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      // 웹에서 받은 데이터를 WebViewMessage 타입으로 변환
      const message: WebViewMessage = JSON.parse(event.nativeEvent.data);
      console.log('Web -> App 메시지 수신:', message);

      if (message.type === 'REQUEST_CAMERA') {
        showImagePickerOptions();
      }
      
    } catch (error) {
      console.error('메시지 처리 중 오류 발생:', error);
    }
  };

  // 앱에서 웹으로 메시지를 보내는 함수
  // message 인자는 우리가 정의한 WebViewMessage 타입만 받을 수 있습니다.
  const postMessageToWeb = (message: WebViewMessage) => {
    if (webViewRef.current) {
      const script = `
        window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(message)} }));
        true;
      `;
      webViewRef.current.injectJavaScript(script);
    }
  };

  // 사용자에게 선택지를 제공하는 함수
  const showImagePickerOptions = () => {
    Alert.alert(
      "사진 첨부",
      "사진을 첨부할 방법을 선택해주세요.",
      [
        { text: "카메라로 촬영", onPress: () => openCamera() },
        { text: "앨범에서 선택", onPress: () => openImageLibrary() },
        { text: "취소", style: "cancel" },
      ]
    );
  };

  // 카메라를 여는 로직
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

  // 앨범(사진첩)을 여는 로직
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

  // 이미지 선택/촬영 결과를 처리하는 공통 함수
  // result 인자의 타입은 ImagePicker 라이브러리가 제공하는 타입을 사용합니다.
  const handleImageResult = (result: ImagePicker.ImagePickerResult) => {
    if (!result.canceled) {
      postMessageToWeb({
        type: 'IMAGE_DATA',
        data: result.assets[0].base64,
      });
    }
  };

  return { onMessage };
}