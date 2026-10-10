import { ScrollView, View } from 'react-native';

import { Card, Section, Text } from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';

// How Voltrix uses people's information, in plain words. The same file in Voltrix and Voltrix Coach,
// so trainers and clients read the same text. Health answers are special personal information under
// POPIA, so they get their own lines.
//
// DRAFT for Ryan to approve before release. Still needed from him: an email address people can write to
// about their information (CONTACT below), and the business's registered name and address.

export const PRIVACY_UPDATED = 'October 2026';

// The address people write to about their information. Until Ryan adds one, the page says only "contact
// Voltrix", because neither app has a way to send Voltrix a message yet.
const CONTACT: string | null = null;

const SECTIONS: { title: string; intro?: string; points: string[] }[] = [
  {
    title: 'What Voltrix keeps',
    intro: 'Only what you, or the people you train with, put in the apps:',
    points: [
      'Your account: your name, email address and password. Your password is stored scrambled, so nobody at Voltrix can read it.',
      'Your profile: your photo and time zone and, for trainers, your business name, specialties, bio, city, rough location (to about 1 km) and prices.',
      'Sessions: when and where they are, notes, and the times you ask for or book. For trainers, also prices, packs and whether each was paid.',
      'Asking a trainer to train you: the note and phone number you choose to send.',
      'Chats: the messages and photos you send, and when calls started and ended. Calls aren’t recorded.',
      'Workouts: your plan, the workouts you log, and the sets and weights in them.',
      'Progress: weight, measurements, check-ins and habits.',
      'Photos: progress photos, and the stories, reels and posts you share.',
      'Nutrition: your food diary.',
      'Health form: your answers to the health questions, anything else you add, an emergency contact and your typed name. Health answers are special personal information, so Voltrix keeps them only because you choose to fill in the form.',
      'Calendar link: if you turn it on, a private link that lets your calendar app show your sessions.',
    ],
  },
  {
    title: 'Who sees what',
    points: [
      'Every trainer who coaches you, only while they coach you: your food diary, workouts, progress and progress photos, check-ins, habits, your health form if you filled it in, your sessions with them and your chats with them.',
      'Your health form: only the trainers who coach you, and only while they do. Their updates in Voltrix Coach keep only that you filled it in, changed it or removed it, never your answers, so nothing about your health stays with a trainer once they stop coaching you. It is never in a calendar link or anything another client sees.',
      'When you leave a trainer, or delete your account, the trainer keeps their own record of training you: your name and the email address and phone number they have for you, your sessions with them (with any note you wrote when booking), what was paid or owed, and their updates about you. They no longer see anything you log.',
      'Money: prices, packs and payments are a trainer’s own record. Clients see how many sessions are left on a pack, never prices or payments.',
      'Asking a trainer: they see your name, photo, and the note and number you send while your request waits. If you withdraw it or they say no, your note and number are removed. They see your email only once they accept.',
      'Your profile, stories, reels and posts: the people you share them with in Voltrix, never anyone you’ve blocked.',
      'Your calendar link: anyone who has the link sees your session times and places. A trainer’s link shows each client’s first name and last initial, and the names of blocked-off time. It never has notes, prices, payments, phone numbers, email addresses or health answers. Once you add it to Google Calendar, Apple Calendar or Outlook, that company keeps a copy too.',
      'Calls go straight between the two phones. To connect them, the phones use Google’s connection servers, which see each phone’s internet (IP) address but not the call.',
      'Voltrix doesn’t sell your information or use it for advertising.',
    ],
  },
  {
    title: 'Where it’s kept, and for how long',
    points: [
      'Voltrix is hosted by Supabase, in Frankfurt, Germany. Your information leaves South Africa to be stored there, where the European Union’s data protection law (the GDPR) protects it. Supabase stores it only to run the apps.',
      'Your information stays while your account is open. Updates in the apps are cleared after 90 days.',
      'When you delete your account, what you logged is removed for good, apart from a trainer’s own record of training you (above). Copies in the hosting company’s backups expire on their own soon after.',
    ],
  },
  {
    title: 'Changing or removing things',
    points: [
      'Most of what you add can be changed or deleted where you added it: your profile, workouts, progress, photos, check-ins, habits, posts and messages.',
      'Change or remove your health form any time. Your trainers stop seeing it at once.',
      'Withdraw a request to a trainer while it waits. They no longer have your note or number.',
      'Leave your trainer in Settings. From then on they no longer see what you log.',
      'Make a new calendar link or turn it off in Settings. The old link stops working at once.',
      'Delete your account in Settings. A trainer who deletes their account removes their clients, calendar, workouts and money records too.',
    ],
  },
  {
    title: 'Keeping it safe',
    points: [
      'Everything travels encrypted between your phone and Voltrix.',
      'The database checks every request, so each person reaches only what they’re allowed to see.',
    ],
  },
];

export function PrivacyPolicy() {
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="privacy-policy">
        <Card>
          <Text variant="callout">
            Voltrix and Voltrix Coach keep what you put in them so the apps work for you and the people you train with.
            This page says what Voltrix keeps, who sees it and how to change or remove it.
          </Text>
          <Text variant="footnote" tone="secondary" style={{ marginTop: Spacing.two }}>
            Updated {PRIVACY_UPDATED}
          </Text>
        </Card>
        {SECTIONS.map((section) => (
          <Section key={section.title} title={section.title}>
            <View style={styles.points}>
              {section.intro ? <Text variant="callout">{section.intro}</Text> : null}
              {section.points.map((point) => (
                <View key={point} style={styles.point}>
                  <View style={styles.dot} />
                  <Text variant="callout" style={{ flex: 1 }}>
                    {point}
                  </Text>
                </View>
              ))}
            </View>
          </Section>
        ))}
        <Section title="Who is responsible">
          <Text variant="callout">
            Voltrix, the business that makes Voltrix and Voltrix Coach, is responsible for your information. To ask what
            Voltrix keeps about you, to have something corrected or removed, or to complain,{' '}
            {CONTACT ? `email Voltrix at ${CONTACT}.` : 'contact Voltrix.'} You can also complain to South Africa’s
            Information Regulator at inforegulator.org.za.
          </Text>
        </Section>
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
