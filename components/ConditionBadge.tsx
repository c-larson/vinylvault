import { View, Text, StyleSheet } from 'react-native';
import type { GoldmineCondition } from '@/types/database';

// Goldmine condition colors
const CONDITION_COLORS: Record<GoldmineCondition, { bg: string; text: string }> = {
  'M':   { bg: '#DFFF00', text: '#0D0D12' },
  'NM':  { bg: '#1d4ed8', text: '#fff' },
  'VG+': { bg: '#047857', text: '#fff' },
  'VG':  { bg: '#065f46', text: '#a7f3d0' },
  'G+':  { bg: '#92400e', text: '#fde68a' },
  'G':   { bg: '#7c2d12', text: '#fed7aa' },
  'F':   { bg: '#4b1d1d', text: '#fca5a5' },
  'P':   { bg: '#1f1f1f', text: '#aaa' },
};

interface Props {
  condition: GoldmineCondition;
  size?: 'small' | 'normal';
}

export function ConditionBadge({ condition, size = 'normal' }: Props) {
  const colors = CONDITION_COLORS[condition] ?? { bg: '#2A2A3A', text: '#A0A0A0' };
  const isSmall = size === 'small';

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.bg },
        isSmall && styles.badgeSmall,
      ]}
    >
      <Text style={[styles.text, { color: colors.text }, isSmall && styles.textSmall]}>
        {condition}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeSmall: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  textSmall: {
    fontSize: 11,
  },
});
