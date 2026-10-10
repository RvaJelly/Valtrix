import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';

import { Sheet } from '@/components/sheet';
import { Group, ListRow, SearchField, Text } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { allZones, COMMON_ZONES, deviceZone, sameZone, zoneCity } from '@/lib/zones';

// The trainer's time zone: this phone's zone first when it differs, a short list, and a search over
// every zone the phone knows.
export function TimeZoneSheet({
  visible,
  value,
  onChoose,
  onClose,
}: {
  visible: boolean;
  value: string;
  onChoose: (zone: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const phone = deviceZone();
  const zones = useMemo(() => allZones(), []);
  const q = query.trim().toLowerCase().replace(/\s+/g, '_');
  const found = q ? zones.filter((z) => z.toLowerCase().includes(q)).slice(0, 40) : COMMON_ZONES;

  function close() {
    setQuery('');
    onClose();
  }

  function choose(zone: string) {
    setQuery('');
    onChoose(zone);
  }

  function row(zone: string, i: number, count: number) {
    const chosen = zone === value;
    const city = zoneCity(zone);
    return (
      <ListRow
        key={zone}
        title={city}
        subtitle={zone === city ? undefined : zone.replace(/_/g, ' ')}
        trailing={chosen ? <Ionicons name="checkmark" size={20} color={Colors.text} /> : null}
        chevron={false}
        accessibilityState={{ selected: chosen }}
        onPress={() => choose(zone)}
        testID={`zone-${zone}`}
        last={i === count - 1}
      />
    );
  }

  return (
    <Sheet visible={visible} onClose={close} title="Time zone">
      {phone && !sameZone(phone, value) && !q ? (
        <Group style={{ backgroundColor: Colors.tint }}>
          <ListRow
            title={`Use this phone’s time zone (${zoneCity(phone)})`}
            titleLines={2}
            chevron={false}
            onPress={() => choose(phone)}
            testID="zone-phone"
            last
          />
        </Group>
      ) : null}
      <SearchField value={query} onChangeText={setQuery} placeholder="Search for a city" testID="zone-search" />
      {found.length ? (
        <Group style={{ backgroundColor: Colors.tint }}>{found.map((z, i) => row(z, i, found.length))}</Group>
      ) : (
        <Text variant="body" tone="secondary">
          No time zone matches “{query.trim()}”. Try the nearest big city.
        </Text>
      )}
      <Text variant="footnote" tone="secondary">
        Your hours and repeat bookings follow this time zone. Your phone’s time zone doesn’t change it.
      </Text>
    </Sheet>
  );
}
