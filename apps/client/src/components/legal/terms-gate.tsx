import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ACCEPT_SCREEN, LEGAL_DOCS, TERMS_UPDATED } from '@/components/legal/legal-content';
import { ImportantBox, Points } from '@/components/legal/legal-document';
import { LegalReader, type ReaderDoc } from '@/components/legal/legal-reader';
import { Logo } from '@/components/logo';
import { StickyFooter } from '@/components/sticky-footer';
import { Button, Group, IconTile, ListRow, Section, Text, TextLink, type IconName } from '@/components/ui';
import { VMark } from '@/components/v-mark';
import { Colors, Fonts, Layout, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { fillApp, useTerms, type CheckId, type TermsChecks } from '@/lib/terms';

const DOC_ICONS: Record<ReaderDoc, IconName> = {
  terms: 'document-text-outline',
  health: 'fitness-outline',
  community: 'people-outline',
  privacy: 'shield-checkmark-outline',
};

const NONE: TermsChecks = { age: false, terms: false, health: false };

// The screen everyone sees before anything else, in Voltrix and Voltrix Coach (the same file): what
// matters most in a few lines, the terms that limit Voltrix's liability in a highlighted box (CPA s49),
// every document in full one tap away, three ticks and one Accept button.
// `underHeader`: inside the sign-up screen, under its see-through header and back arrow.
export function TermsGate({ underHeader }: { underHeader?: boolean }) {
  const terms = useTerms();
  const { signOut } = useAuth();
  const [checks, setChecks] = useState<TermsChecks>(NONE);
  const [reading, setReading] = useState<ReaderDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const fill = (text: string) => fillApp(text, terms.appName);
  const ticked = ACCEPT_SCREEN.checks.filter((c) => checks[c.id]).length;
  const all = ticked === ACCEPT_SCREEN.checks.length && checks.age && checks.terms && checks.health;

  async function accept() {
    if (!all) return;
    setBusy(true);
    haptic.success();
    await terms.accept(checks);
    setBusy(false);
  }

  const docs: { id: ReaderDoc; title: string }[] = [
    ...LEGAL_DOCS.map((d) => ({ id: d.id as ReaderDoc, title: d.title })),
    { id: 'privacy', title: 'Privacy' },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']} testID="terms-gate">
      {/* The faint Rising V of the welcome screens, running off the right edge. */}
      <VMark height={640} mono style={styles.watermark} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, underHeader && { paddingTop: Spacing.six }]}>
        <Logo style={styles.logo} />

        <View style={styles.head}>
          <Text variant="label" tone="secondary">
            Updated {TERMS_UPDATED}
          </Text>
          <Text variant="largeTitle" accessibilityRole="header">
            {fill(ACCEPT_SCREEN.title)}
          </Text>
          <Text tone="secondary">{fill(ACCEPT_SCREEN.lead)}</Text>
        </View>

        <View style={styles.list}>
          {ACCEPT_SCREEN.keyPoints.map((point, i) => (
            <View key={`${i}-${point.title}`} style={styles.item}>
              <Text style={styles.number}>{String(i + 1).padStart(2, '0')}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="rowTitle">{fill(point.title)}</Text>
                <Text variant="callout" tone="secondary">
                  {fill(point.body)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <ImportantBox title="Read this before you accept" testID="terms-important">
          <Points items={ACCEPT_SCREEN.important.map(fill)} />
        </ImportantBox>

        <Section title="Read in full">
          <Group>
            {docs.map((d, i) => (
              <ListRow
                key={d.id}
                title={d.title}
                leading={<IconTile icon={DOC_ICONS[d.id]} />}
                onPress={() => setReading(d.id)}
                accessibilityLabel={`Read the ${d.title}`}
                testID={`terms-doc-${d.id}`}
                compact
                last={i === docs.length - 1}
              />
            ))}
          </Group>
        </Section>

        <Section title="To continue">
          <Group>
            {ACCEPT_SCREEN.checks.map((c, i) => (
              <CheckRow
                key={c.id}
                id={c.id}
                label={fill(c.label)}
                checked={checks[c.id]}
                onToggle={() => setChecks((now) => ({ ...now, [c.id]: !now[c.id] }))}
                last={i === ACCEPT_SCREEN.checks.length - 1}
              />
            ))}
          </Group>
        </Section>

        {terms.signedIn ? <TextLink lead="Not your account?" label="Sign out" onPress={signOut} /> : null}
      </ScrollView>

      <StickyFooter>
        <Button
          title={fill(ACCEPT_SCREEN.button)}
          onPress={accept}
          disabled={!all}
          loading={busy}
          accessibilityLabel={
            all ? undefined : `${fill(ACCEPT_SCREEN.button)}. Tick all ${ACCEPT_SCREEN.checks.length} boxes first.`
          }
          testID="terms-accept"
        />
        <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }} testID="terms-decline-note">
          {all
            ? fill(ACCEPT_SCREEN.declineNote)
            : `${ticked} of ${ACCEPT_SCREEN.checks.length} ticked. ${fill(ACCEPT_SCREEN.declineNote)}`}
        </Text>
      </StickyFooter>

      <LegalReader doc={reading} onClose={() => setReading(null)} />
    </SafeAreaView>
  );
}

// A tick box and its words: the whole row is the target. Ticked is drawn in the text colour, like
// every selected control (never orange).
function CheckRow({
  id,
  label,
  checked,
  onToggle,
  last,
}: {
  id: CheckId;
  label: string;
  checked: boolean;
  onToggle: () => void;
  last?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      // The web reads the state from aria-checked.
      aria-checked={checked}
      accessibilityLabel={label}
      testID={`terms-check-${id}`}
      onPress={() => {
        haptic.select(!checked);
        onToggle();
      }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [styles.check, WEB_POINTER, (pressed || hovered) && { backgroundColor: Colors.tint }]}>
      <View style={[styles.box, checked ? styles.boxOn : styles.boxOff]}>
        {checked ? <Ionicons name="checkmark" size={16} color={Colors.background} /> : null}
      </View>
      <View style={[styles.checkText, !last && styles.checkLine]}>
        <Text variant="callout" style={{ fontFamily: Fonts.textMedium }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const WEB_POINTER = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    right: -180,
    top: 40,
    opacity: Colors.scheme === 'light' ? 0.04 : 0.05,
  },
  content: {
    width: '100%',
    maxWidth: Layout.maxForm,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.section,
    gap: Spacing.section,
  },
  logo: {
    width: 148,
    alignSelf: 'flex-start',
    // The image carries the brand kit's clear space; this lines the V up with the text below.
    marginLeft: -12,
  },
  head: {
    gap: Spacing.tight,
    marginTop: Spacing.two,
  },
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  item: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  number: {
    width: 32,
    fontFamily: Fonts.displaySemi,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textTertiary,
  },
  check: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: Spacing.gutter,
    gap: Spacing.tight,
  },
  box: {
    width: 24,
    height: 24,
    marginTop: 16,
    // A box, not a pill: a little rounder than the small radius suits 24 px.
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOff: {
    borderWidth: 1.5,
    borderColor: Colors.textTertiary,
  },
  boxOn: {
    backgroundColor: Colors.text,
  },
  checkText: {
    flex: 1,
    minHeight: 56,
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    paddingRight: Spacing.gutter,
  },
  checkLine: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
}));
