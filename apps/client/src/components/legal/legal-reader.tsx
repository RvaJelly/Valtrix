import { useState } from 'react';
import { Modal, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { legalDoc, LegalDocument } from '@/components/legal/legal-document';
import type { LegalDoc } from '@/components/legal/legal-content';
import { PrivacyPolicy } from '@/components/privacy-policy';
import { IconButton, Text } from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';

export type ReaderDoc = LegalDoc['id'] | 'privacy';

export function readerTitle(doc: ReaderDoc) {
  return doc === 'privacy' ? 'Privacy Policy' : legalDoc(doc).title;
}

// A full document over the screen, for places outside Settings (the acceptance screen, sign-up and
// Subscribe): a sheet that rises on iPhone, a full page on Android and the web, with a close button.
// A link to another document (at the end of the Privacy Policy) opens it in the same reader.
// The same file in Voltrix and Voltrix Coach.
// `part`: open the Terms at that part ('B' for the subscription terms).
export function LegalReader({
  doc: asked,
  part,
  onClose,
}: {
  doc: ReaderDoc | null;
  part?: string;
  onClose: () => void;
}) {
  const sheet = Platform.OS === 'ios';
  // The document a link inside the reader moved to, while the reader stays open (cleared when the reader
  // closes or is asked for another document).
  const [moved, setMoved] = useState<ReaderDoc | null>(null);
  const [seen, setSeen] = useState(asked);
  if (asked !== seen) {
    setSeen(asked);
    setMoved(null);
  }
  const doc = asked ? (moved ?? asked) : null;
  const close = () => {
    setMoved(null);
    onClose();
  };
  return (
    <Modal
      visible={doc !== null}
      animationType="slide"
      presentationStyle={sheet ? 'pageSheet' : 'fullScreen'}
      statusBarTranslucent
      onRequestClose={close}>
      {doc ? (
        <SafeAreaView style={styles.screen} edges={sheet ? ['bottom'] : ['top', 'bottom']} testID="legal-reader">
          <View style={styles.bar}>
            <View style={[styles.side, { alignItems: 'flex-start' }]}>
              {moved ? (
                <IconButton
                  icon="chevron-back"
                  label={`Back to the ${readerTitle(asked ?? 'privacy')}`}
                  onPress={() => setMoved(null)}
                  testID="legal-reader-back"
                />
              ) : null}
            </View>
            <Text variant="headline" numberOfLines={2} style={styles.title} accessibilityRole="header">
              {readerTitle(doc)}
            </Text>
            <View style={styles.side}>
              <IconButton icon="close" label="Close" onPress={close} testID="legal-reader-close" />
            </View>
          </View>
          {doc === 'privacy' ? (
            <PrivacyPolicy onOpenDoc={setMoved} />
          ) : (
            <LegalDocument key={doc} doc={doc} part={moved ? undefined : part} />
          )}
        </SafeAreaView>
      ) : null}
    </Modal>
  );
}

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  bar: {
    width: '100%',
    maxWidth: Layout.maxForm,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: Spacing.two,
  },
  side: {
    width: 48,
    alignItems: 'flex-end',
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
}));
