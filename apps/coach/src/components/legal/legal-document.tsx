import { Ionicons } from '@expo/vector-icons';
import { useRef, type PropsWithChildren } from 'react';
import { Linking, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { BUSINESS, LEGAL_DOCS, TERMS_VERSION, type LegalBlock, type LegalDoc } from '@/components/legal/legal-content';
import { Card, Group, ListRow, Text } from '@/components/ui';
import { BRAND, Colors, Fonts, Layout, mix, Radius, Spacing, Tabular, themed, withAlpha } from '@/constants/theme';
import { fillApp, useTerms, versionDate } from '@/lib/terms';

// One legal document (Terms of Service, Health and Safety Notice, Community Rules) as a calm, readable
// page: the same component in Voltrix and Voltrix Coach, in Settings and in the reader the acceptance
// screen, sign-up and Subscribe open. The page or sheet around it shows the title.
//
// A long document stays easy to follow: the intro and version on top, Business details (Terms), the short
// version in a card, each part of the Terms one tap away, a clear heading with its number for every
// section, and the terms that must be drawn to attention (CPA s49) in a highlighted box.

export function legalDoc(id: LegalDoc['id']): LegalDoc {
  return LEGAL_DOCS.find((d) => d.id === id) ?? { id, title: '', intro: [], blocks: [] };
}

// "Part A. For everyone" starts a part of the Terms.
const PART = /^Part ([A-Z])\.\s+(.+)$/;
// "11. Your content" is section 11.
const NUMBERED = /^(\d+)\.\s+(.+)$/;
// The summary at the top of a document, when it isn't an Important box.
const SUMMARY = /^(In short|The short version)$/;

// The amber of the warning tone on dark themes: the Important box is mixed from it on every theme, so it
// stays warm on navy, Iron, white and Stone alike (a tint of the page colour turned grey on navy).
const AMBER = '#F5B83D';

// The highlighted box for terms that must be drawn to a person's attention (CPA s49): a warm amber
// surface (solid, so nothing behind it shows through) with an amber hairline, an icon and a title, never
// orange (orange is only ever the main button).
export function ImportantBox({ title, children, testID }: PropsWithChildren<{ title: string; testID?: string }>) {
  const light = Colors.scheme === 'light';
  const ink = light ? mix(Colors.warning, BRAND.iron, 0.15) : Colors.warning;
  // A little less padding on a narrow phone, so the lines inside stay long enough to read easily.
  const narrow = useWindowDimensions().width < 380;
  return (
    <View
      style={[
        styles.important,
        narrow && { padding: Spacing.three },
        light
          ? { backgroundColor: mix(BRAND.white, AMBER, 0.18), borderColor: withAlpha(Colors.warning, 0.24) }
          : { backgroundColor: mix(BRAND.iron, AMBER, 0.16), borderColor: withAlpha(AMBER, 0.3) },
      ]}
      testID={testID}>
      <View style={styles.importantHead}>
        <Ionicons name="alert-circle-outline" size={20} color={ink} />
        <Text variant="label" style={{ color: ink, flex: 1 }}>
          Important
        </Text>
      </View>
      <SectionTitle title={title} />
      {children}
    </View>
  );
}

// A section's heading, its number quieter than its words, so the eye finds both.
function SectionTitle({ title }: { title: string }) {
  const numbered = title.match(NUMBERED);
  return (
    <Text variant="headline" accessibilityRole="header">
      {numbered ? (
        <>
          <Text tone="tertiary" style={Tabular}>
            {numbered[1]}
          </Text>
          {'  '}
          {numbered[2]}
        </>
      ) : (
        title
      )}
    </Text>
  );
}

// A section of a document: its heading and what it says.
export function DocSection({ title, children, testID }: PropsWithChildren<{ title: string; testID?: string }>) {
  return (
    <View style={styles.section} testID={testID}>
      <SectionTitle title={title} />
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
      {block.contact ? <ContactLine /> : null}
    </>
  );
}

// How to reach Voltrix, under every section that sends people to us, from BUSINESS: the email address as
// a link, then the phone number and website once they are set. While Voltrix is in private testing and
// they are empty, it says so plainly instead of pointing anywhere. Nothing else changes when they are
// filled in.
export function ContactLine() {
  const ways: { icon: 'mail-outline' | 'call-outline' | 'globe-outline'; label: string; url: string }[] = [];
  if (BUSINESS.email) ways.push({ icon: 'mail-outline', label: BUSINESS.email, url: `mailto:${BUSINESS.email}` });
  if (BUSINESS.email && BUSINESS.phone) {
    ways.push({ icon: 'call-outline', label: BUSINESS.phone, url: `tel:${BUSINESS.phone.replace(/[^+0-9]/g, '')}` });
  }
  if (BUSINESS.email && BUSINESS.website) {
    const site = BUSINESS.website;
    ways.push({ icon: 'globe-outline', label: site, url: /^https?:/.test(site) ? site : `https://${site}` });
  }
  if (!ways.length) {
    return (
      <View style={styles.contact} testID="contact-line">
        <Ionicons name="mail-outline" size={16} color={Colors.textSecondary} style={{ marginTop: 2 }} />
        <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
          Voltrix is in private testing. Contact details will be shown here before public launch.
        </Text>
      </View>
    );
  }
  return (
    <View style={{ gap: Spacing.one }} testID="contact-line">
      {ways.map((w) => (
        <View key={w.icon} style={styles.contact}>
          <Ionicons name={w.icon} size={16} color={Colors.textSecondary} style={{ marginTop: 2 }} />
          <Text
            variant="footnote"
            tone="primary"
            accessibilityRole="link"
            onPress={() => Linking.openURL(w.url).catch(() => {})}
            selectable
            style={{ flex: 1, fontFamily: Fonts.textMedium, textDecorationLine: 'underline' }}>
            {w.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Who runs Voltrix, from BUSINESS: each detail once it is filled in. Until the details the law asks for are
// there (test builds only), one calm line says so instead of empty rows. The Terms and the Privacy Policy
// show the same card at the top.
export function BusinessDetails() {
  const rows: [string, string | null][] = [
    ['Name', BUSINESS.name],
    ['Registration number', BUSINESS.registration],
    ['Address', BUSINESS.address],
    ['Email', BUSINESS.email],
    ['Phone', BUSINESS.phone],
    ['Website', BUSINESS.website],
    ['Information Officer', BUSINESS.informationOfficer],
  ];
  const filled = rows.filter((r): r is [string, string] => !!r[1]);
  const complete = !!BUSINESS.name && !!BUSINESS.address && !!BUSINESS.email;
  return (
    <Card style={{ gap: Spacing.tight }} testID="business-details">
      <Text variant="label" tone="secondary" accessibilityRole="header">
        Business details
      </Text>
      {filled.map(([label, value]) => (
        <View key={label} style={{ gap: 2 }}>
          <Text variant="footnote" tone="secondary">
            {label}
          </Text>
          <Text variant="callout" selectable>
            {value}
          </Text>
        </View>
      ))}
      {complete ? null : (
        <Text variant="callout" tone={filled.length ? 'secondary' : 'primary'}>
          Voltrix is in private testing. Our business and contact details will be shown here before public launch.
        </Text>
      )}
    </Card>
  );
}

// Under a document's intro: the same words as the acceptance screen's header.
export function VersionLine() {
  return (
    <Text variant="footnote" tone="secondary" testID="legal-version">
      Version {versionDate(TERMS_VERSION)}
    </Text>
  );
}

// A part's letter, in the square a row's icon would have.
function PartTile({ letter }: { letter: string }) {
  return (
    <View style={styles.partTile}>
      <Text variant="headline" tone="secondary">
        {letter}
      </Text>
    </View>
  );
}

// `part`: open the Terms at that part ('B' for the subscription terms).
export function LegalDocument({ doc, part: startAt }: { doc: LegalDoc['id']; part?: string }) {
  const { appName } = useTerms();
  const d = legalDoc(doc);
  const scroller = useRef<ScrollView>(null);
  // Where each part starts on the page, for the part links.
  const partTops = useRef<Record<string, number>>({});
  const started = useRef(false);
  // The parts (Terms only) and the sections in each.
  const parts: { letter: string; name: string; first?: number; last?: number }[] = [];
  for (const b of d.blocks) {
    const part = b.title.match(PART);
    if (part) parts.push({ letter: part[1], name: part[2] });
    const n = b.title.match(NUMBERED);
    const now = parts[parts.length - 1];
    if (now && n) {
      now.first ??= Number(n[1]);
      now.last = Number(n[1]);
    }
  }
  const goTo = (letter: string) =>
    scroller.current?.scrollTo({ y: Math.max(0, (partTops.current[letter] ?? 0) - Spacing.three), animated: true });

  return (
    <View style={styles.screen}>
      <ScrollView ref={scroller} contentContainerStyle={styles.content} testID={`legal-${doc}`}>
        <Card style={{ gap: Spacing.two }}>
          {d.intro.map((p, i) => (
            <Text key={i} variant="callout">
              {fillApp(p, appName)}
            </Text>
          ))}
          <VersionLine />
        </Card>
        {doc === 'terms' ? <BusinessDetails /> : null}
        {d.blocks.map((block, i) => {
          const key = `${i}-${block.title}`;
          const title = fillApp(block.title, appName);
          const part = block.title.match(PART);
          if (part) {
            return (
              <View
                key={key}
                style={styles.part}
                onLayout={(e) => {
                  partTops.current[part[1]] = e.nativeEvent.layout.y;
                  if (part[1] === startAt && !started.current) {
                    started.current = true;
                    scroller.current?.scrollTo({
                      y: Math.max(0, e.nativeEvent.layout.y - Spacing.three),
                      animated: false,
                    });
                  }
                }}
                testID={`legal-part-${part[1]}`}>
                <Text variant="label" tone="tertiary">
                  Part {part[1]}
                </Text>
                <Text variant="title" accessibilityRole="header">
                  {part[2]}
                </Text>
                <BlockBody block={block} appName={appName} />
              </View>
            );
          }
          if (block.important) {
            return (
              <ImportantBox key={key} title={title}>
                <BlockBody block={block} appName={appName} />
              </ImportantBox>
            );
          }
          if (SUMMARY.test(block.title)) {
            return (
              <View key={key} style={{ gap: Spacing.three }}>
                <Card style={{ gap: Spacing.tight }}>
                  <SectionTitle title={title} />
                  <BlockBody block={block} appName={appName} />
                </Card>
                {parts.length > 1 ? (
                  // Each part one tap away, so trainers and clients go straight to theirs.
                  <Group>
                    {parts.map((p, n) => (
                      <ListRow
                        key={p.letter}
                        title={p.name}
                        subtitle={
                          p.first != null ? `Part ${p.letter} · sections ${p.first} to ${p.last}` : `Part ${p.letter}`
                        }
                        leading={<PartTile letter={p.letter} />}
                        onPress={() => goTo(p.letter)}
                        accessibilityLabel={`Go to Part ${p.letter}, ${p.name}`}
                        testID={`legal-go-part-${p.letter}`}
                        compact
                        last={n === parts.length - 1}
                      />
                    ))}
                  </Group>
                ) : null}
              </View>
            );
          }
          return (
            <DocSection key={key} title={title}>
              <BlockBody block={block} appName={appName} />
            </DocSection>
          );
        })}
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
  section: {
    gap: Spacing.tight,
  },
  // A new part: a hairline above, a little more room, the letter over the name.
  part: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  partTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tint,
  },
  important: {
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: Spacing.gutter,
    gap: Spacing.tight,
  },
  contact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
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
