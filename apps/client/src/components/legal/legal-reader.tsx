import { Modal, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { legalDoc, LegalDocument } from '@/components/legal/legal-document';
import type { LegalDoc } from '@/components/legal/legal-content';
import { PrivacyPolicy } from '@/components/privacy-policy';
import { IconButton, Text } from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';

export type ReaderDoc = LegalDoc['id'] | 'privacy';

export function readerTitle(doc: ReaderDoc) {
  return doc === 'privacy' ? 'Privacy' : legalDoc(doc).title;
}

// A full document over the screen, for places outside Settings (the acceptance screen, sign-up and
// Subscribe): a sheet that rises on iPhone, a full page on Android and the web, with a close button.
// The same file in Voltrix and Voltrix Coach.
export function LegalReader({ doc, onClose }: { doc: ReaderDoc | null; onClose: () => void }) {
  const sheet = Platform.OS === 'ios';
  return (
    <Modal
      visible={doc !== null}
      animationType="slide"
      presentationStyle={sheet ? 'pageSheet' : 'fullScreen'}
      statusBarTranslucent
      onRequestClose={onClose}>
      {doc ? (
        <SafeAreaView style={styles.screen} edges={sheet ? ['bottom'] : ['top', 'bottom']} testID="legal-reader">
          <View style={styles.bar}>
            <View style={styles.side} />
            <Text variant="headline" numberOfLines={1} style={styles.title} accessibilityRole="header">
              {readerTitle(doc)}
            </Text>
            <View style={styles.side}>
              <IconButton icon="close" label="Close" onPress={onClose} testID="legal-reader-close" />
            </View>
          </View>
          {doc === 'privacy' ? <PrivacyPolicy /> : <LegalDocument doc={doc} />}
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
