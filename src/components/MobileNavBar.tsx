import * as Haptics from 'expo-haptics';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Tab = { label: string; path: string; };
const TABS: Tab[] = [
  { label: '홈', path: '/' },
  { label: '검색', path: '/search' },
  { label: '글쓰기', path: '/feed' },
  { label: '응원함', path: '/cheer' },
  { label: '프로필', path: '/me' },
];

interface Props {
  currentPath: string;
  onSelect: (path: string) => void;
}

const NativeNavBar: React.FC<Props> = ({ currentPath, onSelect }) => {
  return (
    <View style={styles.wrap}>
      {TABS.map((t) => {
        const active = currentPath === t.path || currentPath.startsWith(t.path + '/');
        return (
          <Pressable
            key={t.path}
            style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
            android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: false }}
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(t.path);
            }}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {t.label}
            </Text>
            {active && <View style={styles.indicator} />}
          </Pressable>
        );
      })}
    </View>
  );
};

export default memo(NativeNavBar);

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    right: 12,
    height: 56,
    backgroundColor: 'white',
    borderRadius: 14,
    flexDirection: 'row',
    elevation: 6,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    paddingHorizontal: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginVertical: 6,
  },
  tabActive: { backgroundColor: '#f0f5ff' },
  pressed: { opacity: 0.8 },
  label: { fontSize: 13, color: '#374151' },
  labelActive: { fontWeight: '700', color: '#1C57A5' },
  indicator: {
    position: 'absolute', bottom: 2,
    width: 20, height: 3, borderRadius: 2, backgroundColor: '#1C57A5',
  },
});