 // app/+error.tsx

import { Link } from 'expo-router';
import { Button, StyleSheet, Text, View } from 'react-native';

// Expo Router가 에러 발생 시 이 컴포넌트를 자동으로 렌더링하고,
// error와 retry props를 전달해 줍니다.
export default function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>앗! 문제가 발생했습니다.</Text>
      <Text style={styles.errorText}>{error.message}</Text>
      
      {/* '다시 시도' 버튼을 누르면 retry 함수가 호출되어 페이지를 새로고침합니다. */}
      <Button title="다시 시도" onPress={retry} />

      <Link href="/" style={styles.link}>
        <Text>홈으로 돌아가기</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8d7da'
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#721c24',
    marginBottom: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});