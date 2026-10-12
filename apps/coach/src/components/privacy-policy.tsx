import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { BUSINESS } from '@/components/legal/legal-content';
import { BusinessDetails, ContactLine, DocSection, Points, VersionLine } from '@/components/legal/legal-document';
import { Card, Group, IconTile, ListRow, Text, type IconName } from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';

// How Voltrix uses people's information, in plain words: the Privacy Policy. The same file in Voltrix and
// Voltrix Coach, so trainers and clients read the same text. Final text for attorney review, matching the
// Terms of Service version in legal-content.ts (it changes with them). Health information is special
// personal information under POPIA, so it gets its own lines.
//
// Every line is true for this build: no server notifications, owner centre, health permission sheet or
// custom email provider yet. What each changed line becomes when those ship is in the attorney pack
// (restore-with-owner-and-notifications.md). `after`: lines under the list that don't continue its intro.
// `contact`: the section ends with the contact line (BUSINESS, or the honest private-testing line).

const SECTIONS: { title: string; intro?: string; points: string[]; after?: string[]; contact?: boolean }[] = [
  {
    title: 'What Voltrix keeps',
    intro: 'What you, the people you train with, and the apps themselves put in Voltrix:',
    points: [
      'Your account: your name, email address and password. Your password is stored scrambled, so nobody at Voltrix can read it.',
      'Your profile: your photo and time zone and, for trainers, your business name, specialties, bio, city, years of experience, whether you’re taking clients, rough location (to about 1 km) and prices.',
      'What a trainer adds about you: if a trainer adds you as a client, the name, email address, phone number, goal and notes they type in. This comes from your trainer, not from you.',
      'Sessions: when and where they are, notes, and the times you ask for or book. For trainers, also prices, packs and whether each was paid.',
      'Asking a trainer to train you: the note and phone number you choose to send.',
      'Chats: the messages and photos you send, and who called whom, whether it was a voice or video call, and when it started and ended. Calls aren’t recorded.',
      'Workouts: your plan, the workouts you log, and the sets and weights in them.',
      'Progress: weight, measurements, check-ins and habits.',
      'Photos: progress photos, and the stories, reels and posts you share.',
      'Nutrition: your food diary and the foods you save.',
      'Health form: your answers to the health questions, anything else you add, an emergency contact and your typed name.',
      'Doctor’s OK: if your trainer records that your doctor said training is fine, the date they recorded.',
      'Calendar link: if you turn it on, a private link that lets your calendar app show your sessions.',
      'Safety: the stories, reels and comments you report, and why, and the people you block.',
      'Your settings: appearance, units and how long before a session you’re reminded. The reminders themselves, and the rest timer, are set on your phone.',
      'Our agreement: each time you accept our Terms, the version, the date and time, which app, whether you used Android, an iPhone or the web, and the boxes you ticked.',
      'For trainers: when your free trial or free period ends, your plan status and any free access we gave you. No card details are taken. Once card payments open, they will be kept by Google, Apple or our payment provider, never by Voltrix.',
      'Messages you send us, such as questions, complaints and requests.',
    ],
  },
  {
    title: 'Why we keep it',
    points: [
      'To run the apps for you and the people you train with, as our Terms describe. You need to give your name, email address and a password to have an account. Everything else is your choice, but a part of the app won’t work without what it needs.',
      'Your health information, only with your permission: your health form, weight, measurements, progress photos, check-ins and food diary. You give it by signing and saving your health form, and by choosing to add the others. You don’t have to, but your trainer may not be able to train you safely without them. You can remove your health form and delete those entries at any time, or ask us to delete them all.',
      'To keep Voltrix safe: to stop misuse, deal with reports and protect people.',
      'To show what was agreed, and to deal with complaints and legal claims.',
      'Because the law requires it, for example a court order, and tax records for trainers’ subscriptions once card payments open.',
      'Marketing, such as news and offers from Voltrix, only if you say yes. You can say no at any time, and every message tells you how. Account emails, reminders and updates in the app aren’t marketing.',
    ],
  },
  {
    title: 'Who sees what',
    points: [
      'Every trainer who coaches you, only while they coach you: your food diary, workouts, progress and progress photos, check-ins, habits, your health form if you filled it in, your sessions with them and your chats with them.',
      'Your health form: in the apps, only the trainers who coach you, and only while they do. Their updates in Voltrix Coach say only that you filled it in, changed it or removed it, never your answers. It is never in a calendar link or anything another client sees.',
      'When you leave a trainer, or delete your account, the trainer keeps their own record of training you: your name and the email address and phone number they have for you, your goal and their notes, any date they recorded for your doctor’s OK, your sessions with them (with any note you wrote when booking), what was paid or owed, and their updates about you. They no longer see anything you log.',
      'Money: prices, packs and payments are a trainer’s own record. Clients see how many sessions are left on a pack, never prices or payments.',
      'Asking a trainer: they see your name, photo, and the note and number you send while your request waits. If you withdraw it or they say no, your note and number are removed. They see your email only once they accept.',
      'Your stories, reels, comments and likes: everyone signed in to Voltrix or Voltrix Coach, except people you’ve blocked or who have blocked you. Anyone with the web link to a photo or video in a story, reel or profile picture can open it without signing in, and people can share reels outside Voltrix or save them.',
      'Trainers’ profiles (name, business, photo, specialties, bio, city, years of experience, whether they’re taking clients and how far away they are): people looking for a trainer, and everyone who sees their posts.',
      'A trainer who has your email address can see whether you have a Voltrix account.',
      'Finding a trainer near you: if you sort trainers by distance, your phone sends your rough location (to about 1 km) to work out the distances. We use it only for that and don’t keep it.',
      'Your calendar link: anyone who has the link sees your session times and places. A trainer’s link shows each client’s first name and last initial, and the names of blocked-off time. It never has notes, prices, payments, phone numbers, email addresses or health answers. Once you add it to Google Calendar, Apple Calendar or Outlook, that company keeps a copy too.',
      'Calls go straight between the two phones, so each phone sees the other’s internet (IP) address. To connect them, the phones also use Google’s connection servers, which see both addresses but not the call.',
      'People who work for Voltrix, starting with the owner: in Voltrix Coach they see each trainer’s name, business name, email address, plan and number of clients, and through our hosting company’s dashboard the owner can reach everything stored in Voltrix, including reports. They look at chats, health forms, progress or food diaries only to help you when you ask, to keep Voltrix safe and working, to deal with a serious report, a complaint or a legal claim, or when the law requires it. Everyone who works for Voltrix must keep information confidential.',
      'If you report a story, reel or comment, or contact us about someone, only people who work for Voltrix see that it was you.',
      'If a client or a regulator has a complaint or claim about a trainer, we may give them the trainer’s name, business name and contact details, where the law allows.',
      'The police, courts and regulators, when the law requires it. We report child sexual abuse material to the police and the Film and Publication Board.',
      'Voltrix doesn’t sell your information, use it for advertising, or use your health or fitness information for marketing.',
    ],
  },
  {
    title: 'Other companies that help run Voltrix',
    intro:
      'Companies that store or send your information for us do so under written agreements that require them to protect it, giving it the same or equal protection as this page describes. Services you choose to use follow their own privacy policies. Each gets only what it needs:',
    points: [
      'Supabase hosts the apps and stores everything, in Frankfurt, Germany, under a written data processing agreement. Supabase’s contracting company is in Singapore.',
      'Supabase also sends our account emails, such as sign-up confirmations and password resets. It gets your email address.',
      'Google’s connection servers help connect calls (see Who sees what).',
      'Open Food Facts, in France: the barcodes and food names you search for, with your phone’s internet address. Never your name or account.',
      'Your phone’s map service (Google on Android, Apple on iPhone): a trainer’s rounded location, to find the name of their town.',
      'Services you choose: WhatsApp, for invites trainers send from their own WhatsApp; your calendar app, if you add your calendar link; and the apps you choose to share a reel to.',
      'Google Play and Apple’s App Store, if you download the apps or subscribe through them, and our payment provider once card payments start.',
      'GitHub hosts our app downloads for now. It doesn’t receive your account information.',
    ],
  },
  {
    title: 'Where it’s kept, and for how long',
    points: [
      'Your information is stored outside South Africa, in Frankfurt, Germany, where the European Union’s data protection law (the GDPR) protects it. Some of the companies above may handle what they need in other countries. We send information abroad only when the company receiving it is bound by law or a written agreement to protect it in a way substantially similar to South Africa’s law, or when it’s needed to provide the service you asked for.',
      'Your information stays while your account is open.',
      'Updates in the apps are cleared after 90 days, the next time you open the app.',
      'When you delete your account, we delete your profile and what you added, apart from a trainer’s own record of training you (above) and copies other people already have, such as chat photos you sent or reels they saved. If a technical problem leaves a file behind, we delete it as soon as we find it.',
      'After you delete your account, we keep a short record of the Terms you accepted, with the email address the account had, for 3 years in case of a legal claim, or longer while a complaint, dispute or claim is open (we mark the record so it is kept) or the law still allows one. Then we remove anything in it that could identify you.',
      'A report is deleted with the story, reel or comment it’s about, or when the account that made it is deleted. Blocks are deleted when either account is.',
      'Once card payments open, trainers’ billing records will be kept for 5 years, because tax law requires it.',
      'Copies in our hosting company’s backups and logs are deleted automatically within 7 days.',
      'Voltrix is only for people aged 18 or older. If we learn that someone younger has an account, we close it and delete their information, apart from our record of what they told us when they signed up.',
    ],
  },
  {
    title: 'Your rights',
    intro: 'You can ask us, free of charge and in any way that suits you, to:',
    points: [
      'tell you whether we hold information about you, give you a copy of it, and tell you who has had access to it',
      'correct or delete information that is wrong, out of date, incomplete or misleading, or that we shouldn’t have or no longer need',
      'stop using your information in a particular way, if you object to it',
      'stop sending you marketing, at any time',
      'stop using your health information and delete it, because you take back your permission (this doesn’t undo what was done before)',
    ],
    after: [
      'We’ll answer within 30 days and confirm what we did.',
      'We don’t make decisions about you by computer alone that have legal or similarly serious effects. When several people report a story, reel or comment, it is hidden automatically until we look at it.',
      'You can also complain to the Information Regulator (details below).',
    ],
    contact: true,
  },
  {
    title: 'Changing or removing things',
    points: [
      'Most of what you add can be changed or deleted where you added it: your profile, workouts, progress, photos, check-ins, habits, posts and messages.',
      'Change or remove your health form any time. Your trainers stop seeing it at once.',
      'Take back your permission for health information by removing your health form and deleting those entries, or ask us to delete them all.',
      'Withdraw a request to a trainer while it waits. They no longer have your note or number.',
      'Leave your trainer in Settings. From then on they no longer see what you log.',
      'Make a new calendar link or turn it off in Settings. The old link stops working at once.',
      'Choose your session reminders in Settings, Notifications. Turn notifications off completely in your phone’s settings.',
      'Delete your account in Settings. A trainer who deletes their account removes their clients, calendar, workouts and money records too.',
      'Can’t get into the app? Ask us to delete your account.',
    ],
    contact: true,
  },
  {
    title: 'Keeping it safe',
    points: [
      'Everything travels encrypted between your phone and Voltrix.',
      'The database checks every request, so each person reaches only what they’re allowed to see.',
      'Face ID and fingerprint unlock happen on your phone. Voltrix never receives your face or fingerprint.',
      'If we believe someone has got into your information without permission, we’ll tell the Information Regulator and you as soon as we reasonably can, and explain what you can do to protect yourself.',
    ],
  },
  {
    title: 'Changes to this page',
    points: [
      'When we change this page in a way that matters, we tell you before the change takes effect, and the app asks you to accept the new version. If something new needs your permission, we ask for it again.',
    ],
  },
];

type OtherDoc = 'terms' | 'health' | 'community';

const OTHER_DOCS: { id: OtherDoc; title: string; icon: IconName }[] = [
  { id: 'terms', title: 'Terms of Service', icon: 'document-text-outline' },
  { id: 'health', title: 'Health and Safety Notice', icon: 'fitness-outline' },
  { id: 'community', title: 'Community Rules', icon: 'people-outline' },
];

// In Settings, the other documents open as pages; the reader passes onOpenDoc to show them in place.
function openInSettings(doc: OtherDoc) {
  if (doc === 'community') router.push('/rules');
  else router.push({ pathname: '/settings/legal/[doc]', params: { doc } });
}

export function PrivacyPolicy({ onOpenDoc = openInSettings }: { onOpenDoc?: (doc: OtherDoc) => void }) {
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="privacy-policy">
        <Card style={{ gap: Spacing.two }}>
          <Text variant="callout">
            Voltrix and Voltrix Coach keep what you put in them so the apps work for you and the people you train with.
            This Privacy Policy says what we keep, why, who sees it, how long we keep it, and how to change or remove
            it.
          </Text>
          <VersionLine />
        </Card>
        <BusinessDetails />
        {SECTIONS.map((section) => (
          <DocSection key={section.title} title={section.title}>
            {section.intro ? <Text variant="callout">{section.intro}</Text> : null}
            <Points items={section.points} />
            {(section.after ?? []).map((line) => (
              <Text key={line} variant="callout">
                {line}
              </Text>
            ))}
            {section.contact ? <ContactLine /> : null}
          </DocSection>
        ))}
        <DocSection title="Who is responsible" testID="privacy-responsible">
          <Text variant="callout">
            {BUSINESS.name ?? 'Voltrix'}
            {BUSINESS.registration ? ` (registration number ${BUSINESS.registration})` : ''} is responsible for your
            information in Voltrix and Voltrix Coach.
            {BUSINESS.address ? ` Our address is ${BUSINESS.address}.` : ''}
            {BUSINESS.informationOfficer ? ` Our Information Officer is ${BUSINESS.informationOfficer}.` : ''}
          </Text>
          <Text variant="callout">
            To ask what we keep about you, to have something corrected or removed, to take back your permission or to
            complain, contact us. To ask for records under the Promotion of Access to Information Act, contact us the
            same way.
          </Text>
          <ContactLine />
          <Text variant="callout">
            Trainers: for the client records you keep in Voltrix Coach, you are responsible for following the Protection
            of Personal Information Act, and we store them for you, as our Terms explain.
          </Text>
          <View style={{ gap: Spacing.one }} testID="privacy-regulator">
            <Text variant="callout">You can also complain to South Africa’s Information Regulator:</Text>
            {/* Each detail on its own line, a size smaller, so the email address (no spaces) fits on one line
                on a 360-point phone with larger text instead of breaking in the middle. */}
            <Text variant="footnote" selectable>
              inforegulator.org.za
            </Text>
            <Text variant="footnote" selectable>
              POPIAComplaints@inforegulator.org.za
            </Text>
            <Text variant="footnote" selectable>
              010 023 5200 or toll-free 0800 017 160
            </Text>
          </View>
        </DocSection>
        <DocSection title="Our other documents">
          <Group>
            {OTHER_DOCS.map((d, i) => (
              <ListRow
                key={d.id}
                title={d.title}
                leading={<IconTile icon={d.icon} />}
                onPress={() => onOpenDoc(d.id)}
                accessibilityLabel={`Read the ${d.title}`}
                testID={`privacy-doc-${d.id}`}
                compact
                last={i === OTHER_DOCS.length - 1}
              />
            ))}
          </Group>
        </DocSection>
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
}));
