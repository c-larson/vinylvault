import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { ConditionBadge } from './ConditionBadge';
import type { VinylRecord } from '@/types/database';

interface Props {
  record: VinylRecord;
  onPress: () => void;
}

export function RecordCard({ record, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      {/* Cover thumbnail */}
      {record.cover_image_url ? (
        <Image source={{ uri: record.cover_image_url }} style={styles.thumb} />
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Text style={styles.thumbEmoji}>💿</Text>
        </View>
      )}

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{record.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{record.artist}</Text>
        <View style={styles.meta}>
          {record.year && <Text style={styles.metaText}>{record.year}</Text>}
          {record.format && <Text style={styles.metaText}>{record.format}</Text>}
          {record.genre && <Text style={styles.metaText}>{record.genre}</Text>}
        </View>
        {record.media_condition && (
          <View style={styles.conditionWrap}>
            <ConditionBadge condition={record.media_condition} size="small" />
          </View>
        )}
      </View>

      {/* Value */}
      {(record.condition_adjusted_value || record.discogs_lowest_price) && (
        <View style={styles.priceWrap}>
          <Text style={styles.price}>
            ${(record.condition_adjusted_value ?? record.discogs_lowest_price ?? 0).toFixed(0)}
          </Text>
          <Text style={styles.priceLabel}>est.</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#1C1C24',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2A3A',
    alignItems: 'center',
  },
  thumb: { width: 80, height: 80 },
  thumbPlaceholder: {
    width: 80,
    height: 80,
    backgroundColor: '#2A2A3A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbEmoji: { fontSize: 32 },
  info: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  title: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  artist: { color: '#DFFF00', fontSize: 13, marginBottom: 4 },
  meta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  metaText: { color: '#666', fontSize: 11 },
  conditionWrap: { marginTop: 6 },
  priceWrap: { paddingRight: 14, alignItems: 'flex-end' },
  price: { color: '#fff', fontSize: 16, fontWeight: '700' },
  priceLabel: { color: '#666', fontSize: 10 },
});
