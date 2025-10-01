import React from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

function App() {
  const myWebsiteUrl = 'https://achiva.kr/?is_app=true'; 

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <WebView
          source={{ uri: myWebsiteUrl }}
          style={styles.webview}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});

export default App;