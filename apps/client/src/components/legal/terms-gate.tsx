import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ACCEPT_SCREEN, LEGAL_DOCS, TERMS_VERSION } from '@/components/legal/legal-content';
import { ImportantBox, Points } from '@/components/legal/legal-document';
import { LegalReader, readerTitle, type ReaderDoc } from '@/components/legal/legal-reader';
import { Logo } from '@/components/logo';
import { DeleteAccount } from '@/components/settings-parts';
import { StickyFooter } from '@/components/sticky-footer';
import {
  Button,
  ErrorText,
  Group,
  IconTile,
  ListRow,
  Notice,
  Section,
  Text,
  TextLink,
  type IconName,
} from '@/components/ui';
import { VMark } from '@/components/v-mark';
import { Colors, Fonts, Layout, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { fillApp, useTerms, versionDate, type CheckId, type TermsChecks } from '@/lib/terms';

const DOC_ICONS: Record<ReaderDoc, IconName> = {
  terms: 'document-text-outline',
  health: 'fitness-outline',
  community: 'people-outline',
  privacy: 'shield-checkmark-outline',
};

const NONE: TermsChecks = { age: false, terms: false, health: false };

// The screen everyone sees before they create an account, and after signing in while their account
// hasn't accepted the current version, in Voltrix and Voltrix Coach (the same file): what matters most in
// a few lines, the terms that limit Voltrix's liability in a highlighted box (CPA s49), every document in
// full one tap away, three empty ticks and one Agree button.
// - The health box can be ticked only once the Health and Safety Notice has been opened (one tap, no
//   forced scrolling): until then, tapping it opens the Notice, and closing the Notice ticks it
//   (CPA s49(5), s58).
// - Someone signed in can leave from here: sign out, or delete their account (the same steps as Settings).
// - `onAccept`: on the sign-up screen, the ticks go to that sign-up (kept in its memory) instead of an
//   account. `notice`: a line under the heading, for example when they need ticking again (signed in, the
//   screen writes its own when an acceptance made on this phone hasn't reached us within a day).
// `underHeader`: inside the sign-up screen, under its see-through header and back arrow. While this screen
// shows there, the header gets a solid bar in the page colour, so the long page never scrolls up behind
// the arrow; the form after it has the see-through header again.
export function TermsGate({
  underHeader,
  onAccept,
  notice,
}: {
  underHeader?: boolean;
  onAccept?: (checks: TermsChecks) => void;
  notice?: string;
}) {
  const terms = useTerms();
  const { signOut, session, profile } = useAuth();
  const [checks, setChecks] = useState<TermsChecks>(NONE);
  const [reading, setReading] = useState<ReaderDoc | null>(null);
  // The Health and Safety Notice has been opened on this screen, and whether the health box opened it.
  const [healthRead, setHealthRead] = useState(false);
  const [fromHealthBox, setFromHealthBox] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stuck, setStuck] = useState(false);
  const fill = (text: string) => fillApp(text, terms.appName);
  const ticked = ACCEPT_SCREEN.checks.filter((c) => checks[c.id]).length;
  const all = ticked === ACCEPT_SCREEN.checks.length && checks.age && checks.terms && checks.health;
  const signedIn = terms.signedIn && !onAccept;
  // Back because what this person accepted on this phone more than a day ago still hasn't reached us
  // (an acceptance waiting on the phone counts for 24 hours): say so at the top, before they wonder why.
  const overdue = signedIn && !!terms.accepted && !terms.accepted.recorded && terms.accepted.version >= terms.current;
  const why =
    notice ??
    (overdue
      ? `You agreed on this phone more than a day ago, but it hasn’t reached us yet. Connect to the internet, then tick the boxes and tap ${fill(ACCEPT_SCREEN.button)}.`
      : undefined);
  const navigation = useNavigation();
  useEffect(() => {
    if (!underHeader) return;
    navigation.setOptions({ headerBackground: SolidHeader });
    return () => navigation.setOptions({ headerBackground: undefined });
  }, [navigation, underHeader]);

  async function accept() {
    if (!all || busy) return;
    if (onAccept) {
      haptic.success();
      onAccept(checks);
      return;
    }
    setBusy(true);
    setStuck(false);
    const result = await terms.accept(checks);
    setBusy(false);
    if (result === 'stuck') {
      haptic.warning();
      setStuck(true);
    } else haptic.success();
  }

  const docs: { id: ReaderDoc; title: string }[] = [
    ...LEGAL_DOCS.map((d) => ({ id: d.id as ReaderDoc, title: d.title })),
    { id: 'privacy', title: readerTitle('privacy') },
  ];
  const read = (doc: ReaderDoc, fromBox = false) => {
    if (doc === 'health') {
      setHealthRead(true);
      setFromHealthBox(fromBox);
    }
    setReading(doc);
  };
  // Closing the Notice that the health box opened ticks the box: that tap was the person ticking it.
  const closeReader = () => {
    if (reading === 'health' && fromHealthBox) {
      setChecks((now) => ({ ...now, health: true }));
      setFromHealthBox(false);
      haptic.select(true);
    }
    setReading(null);
  };
  // Each app deletes its own kind of account: a trainer's in Voltrix Coach, a client's in Voltrix.
  const ownAccount = profile?.role === (terms.app === 'coach' ? 'trainer' : 'client');

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']} testID="terms-gate">
      {/* The faint Rising V of the welcome screens, running off the right edge. */}
      <VMark height={640} mono style={styles.watermark} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, underHeader && { paddingTop: Spacing.six }]}>
        <Logo style={styles.logo} />

        <View style={styles.head}>
          <Text variant="label" tone="secondary" testID="terms-version">
            Version {versionDate(TERMS_VERSION)}
          </Text>
          <Text variant="largeTitle" accessibilityRole="header">
            {fill(ACCEPT_SCREEN.title)}
          </Text>
          <Text tone="secondary">{fill(ACCEPT_SCREEN.lead)}</Text>
          {/* Why the screen is back (for example, the ticks ran out): at the top, where it is seen first. */}
          {why ? (
            <View style={{ marginTop: Spacing.two }} testID="terms-notice">
              <Notice tone="warning">{why}</Notice>
            </View>
          ) : null}
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
                onPress={() => read(d.id)}
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
            {ACCEPT_SCREEN.checks.map((c, i) => {
              const first = c.id === 'health' && !healthRead;
              return (
                <CheckRow
                  key={c.id}
                  id={c.id}
                  label={fill(c.label)}
                  hint={first ? 'Tap to read the Notice. Closing it ticks this box.' : undefined}
                  checked={checks[c.id]}
                  onToggle={() => (first ? read('health', true) : setChecks((now) => ({ ...now, [c.id]: !now[c.id] })))}
                  last={i === ACCEPT_SCREEN.checks.length - 1}
                />
              );
            })}
          </Group>
          {/* The decline note sits with the boxes, so the footer stays one short line. */}
          <Text variant="footnote" tone="secondary" style={styles.decline} testID="terms-decline-note">
            {fill(ACCEPT_SCREEN.declineNote)}
          </Text>
        </Section>

        {signedIn ? (
          <Section title="Your account">
            <View style={{ gap: Spacing.three }}>
              <TextLink lead="Not your account?" label="Sign out" onPress={signOut} />
              {ownAccount ? (
                <DeleteAccount userId={session?.user.id} onDeleted={signOut} />
              ) : profile ? (
                <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                  To delete your account, use {terms.app === 'coach' ? 'Voltrix' : 'Voltrix Coach'}.
                </Text>
              ) : null}
            </View>
          </Section>
        ) : null}
      </ScrollView>

      <StickyFooter>
        {stuck ? <ErrorText testID="terms-stuck">Not sent yet. Check your connection and try again.</ErrorText> : null}
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
        {all ? null : (
          <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }} testID="terms-ticked">
            {ticked} of {ACCEPT_SCREEN.checks.length} ticked
          </Text>
        )}
      </StickyFooter>

      <LegalReader doc={reading} onClose={closeReader} />
    </SafeAreaView>
  );
}

// The sign-up screen's header behind the back arrow while the Terms show (see `underHeader`).
function SolidHeader() {
  return <View style={styles.headerBar} />;
}

// A tick box and its words: the whole row is the target. Ticked is drawn in the text colour, like
// every selected control (never orange).
function CheckRow({
  id,
  label,
  hint,
  checked,
  onToggle,
  last,
}: {
  id: CheckId;
  label: string;
  // What a tap does first, when it doesn't tick the box yet.
  hint?: string;
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
      accessibilityHint={hint}
      testID={`terms-check-${id}`}
      onPress={() => {
        if (!hint) haptic.select(!checked);
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
        {hint ? (
          <View style={styles.hint}>
            <Ionicons name="book-outline" size={14} color={Colors.textSecondary} />
            <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
              {hint}
            </Text>
          </View>
        ) : null}
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
  headerBar: {
    flex: 1,
    backgroundColor: Colors.background,
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
    gap: Spacing.tight,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  number: {
    width: 28,
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
  decline: {
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.gutter,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  checkLine: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
}));
