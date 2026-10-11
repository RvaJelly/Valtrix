import { Ionicons } from '@expo/vector-icons';
import type { PropsWithChildren } from 'react';
import { ScrollView, View } from 'react-native';

import {
  BUSINESS,
  LEGAL_DOCS,
  TERMS_UPDATED,
  TERMS_VERSION,
  type LegalBlock,
  type LegalDoc,
} from '@/components/legal/legal-content';
import { Card, Section, Text } from '@/components/ui';
import { BRAND, Colors, Layout, mix, Radius, Spacing, themed } from '@/constants/theme';
import { fillApp, useTerms } from '@/lib/terms';

// One legal document (Terms of Service, Health and Safety, Community Rules) as a calm, readable page:
// the same component in Voltrix and Voltrix Coach, in Settings and in the reader the acceptance
// screen and the sign-up screen open. The page or sheet around it shows the title.

export function legalDoc(id: LegalDoc['id']): LegalDoc {
  return LEGAL_DOCS.find((d) => d.id === id) ?? { id, title: '', intro: [], blocks: [] };
}

// The highlighted box for terms that must be drawn to a person's attention (CPA s49): a warm
// amber tint (solid, so nothing behind it shows through), an icon and a title, never orange (orange
// is only ever the main button).
export function ImportantBox({ title, children, testID }: PropsWithChildren<{ title: string; testID?: string }>) {
  const light = Colors.scheme === 'light';
  const ink = light ? mix(Colors.warning, BRAND.iron, 0.15) : Colors.warning;
  return (
    <View
      style={[styles.important, { backgroundColor: mix(Colors.background, Colors.warning, light ? 0.1 : 0.13) }]}
      testID={testID}>
      <View style={styles.importantHead}>
        <Ionicons name="alert-circle-outline" size={20} color={ink} />
        <Text variant="label" style={{ color: ink, flex: 1 }}>
          Important
        </Text>
      </View>
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

// Lines with a small dot each.
export function Points({ items }: { items: string[] }) {
  return (
    <View style={styles.points}>
      {items.map((point, i) => (
        <View key={`${i}-${point}`} style={styles.point}>
          <View style={styles.dot} />
          <Text variant="callout" style={{ flex: 1 }}>
            {point}
          </Text>
        </View>
      ))}
    </View>
  );
}

function BlockBody({ block, appName }: { block: LegalBlock; appName: string }) {
  return (
    <>
      {(block.paragraphs ?? []).map((p, i) => (
        <Text key={`p${i}`} variant="callout">
          {fillApp(p, appName)}
        </Text>
      ))}
      {block.points?.length ? <Points items={block.points.map((p) => fillApp(p, appName))} /> : null}
    </>
  );
}

// Who Voltrix is, from BUSINESS: only the details that have been filled in.
function WhoWeAre() {
  const name = BUSINESS.name ?? 'Voltrix';
  const lines = [
    `${name}${BUSINESS.registration ? ` (registration number ${BUSINESS.registration})` : ''} provides the Voltrix and Voltrix Coach apps.`,
    BUSINESS.address ? `Address: ${BUSINESS.address}` : null,
    BUSINESS.email ? `Email: ${BUSINESS.email}` : null,
    BUSINESS.informationOfficer ? `Information Officer: ${BUSINESS.informationOfficer}` : null,
  ].filter((x): x is string => !!x);
  return (
    <Section title="Who we are">
      <View style={styles.points}>
        {lines.map((line) => (
          <Text key={line} variant="callout" selectable>
            {line}
          </Text>
        ))}
      </View>
    </Section>
  );
}

export function LegalDocument({ doc }: { doc: LegalDoc['id'] }) {
  const { appName } = useTerms();
  const d = legalDoc(doc);
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID={`legal-${doc}`}>
        <Card style={{ gap: Spacing.two }}>
          {d.intro.map((p, i) => (
            <Text key={i} variant="callout">
              {fillApp(p, appName)}
            </Text>
          ))}
          <Text variant="footnote" tone="secondary">
            Version {TERMS_VERSION} · Updated {TERMS_UPDATED}
          </Text>
        </Card>
        {d.blocks.map((block, i) =>
          block.important ? (
            <ImportantBox key={`${i}-${block.title}`} title={fillApp(block.title, appName)}>
              <BlockBody block={block} appName={appName} />
            </ImportantBox>
          ) : (
            <Section key={`${i}-${block.title}`} title={fillApp(block.title, appName)}>
              <View style={styles.points}>
                <BlockBody block={block} appName={appName} />
              </View>
            </Section>
          ),
        )}
        {doc === 'terms' ? <WhoWeAre /> : null}
      </ScrollView>
    </View>
  );
}

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    width: '100%',
    maxWidth: Layout.maxForm,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
  },
  important: {
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    padding: Spacing.gutter,
    gap: Spacing.tight,
  },
  importantHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  points: {
    gap: Spacing.tight,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.tight,
  },
  // Sits on the first line of its text.
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 8,
    backgroundColor: Colors.textSecondary,
  },
}));
