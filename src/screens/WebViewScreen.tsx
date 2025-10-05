import React, { useRef } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useWebViewBridge } from '../hooks/useWebViewBridge';

// React.FC는 이 함수가 리액트 함수형 컴포넌트임을 명시합니다.
const WebViewScreen: React.FC = () => {
  // WebView 컴포넌트를 직접 제어하기 위한 참조(ref)를 생성합니다.
  const webViewRef = useRef<WebView>(null);
  const myWebsiteUrl = 'https://achiva.kr/?is_app=true';
  
  // 2단계에서 만든 커스텀 훅을 호출합니다.
  // webViewRef를 넘겨주고, 웹에서 오는 메시지를 처리할 onMessage 함수를 받습니다.
  const { onMessage } = useWebViewBridge(webViewRef);

  return (
    <SafeAreaView style={styles.container}>
      <WebView
        ref={webViewRef} // 위에서 만든 참조를 웹뷰와 연결
        source={{ uri: myWebsiteUrl }}
        style={styles.webview}
        onMessage={onMessage} // 웹에서 메시지를 보내면 onMessage 함수가 실행됨
        javaScriptEnabled={true} // 웹뷰 내에서 자바스크립트 실행 허용
      />
    </SafeAreaView>
  );
};

// 화면 스타일 정의
const styles = StyleSheet.create({
  container: { 
    flex: 1,
  },
  webview: { 
    flex: 1,
  },
});

export default WebViewScreen;