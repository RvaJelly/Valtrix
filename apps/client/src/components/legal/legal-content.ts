// The Terms of Service, the Health and Safety Notice and the Community Rules, and the words on the
// screen everyone accepts before they use the app. The same file in Voltrix and Voltrix Coach.
//
// PLACEHOLDER TEXT. Every string below marked "Placeholder" is replaced by the final, reviewed text
// before release. The shape of this file stays the same.
//
// Rules for the text:
// - Plain words (the Consumer Protection Act asks for plain language). No markdown inside strings.
// - "{app}" shows as the name of the app being used: "Voltrix" or "Voltrix Coach".
// - `important: true` puts a block in a highlighted box (CPA s49: terms that limit Voltrix's
//   liability, make a person take on a risk or ask them to cover Voltrix must be drawn to their
//   attention).
//
// Versions: TERMS_VERSION is the day the version took effect, 'YYYY-MM-DD' (a letter after it for a
// second version on the same day: '2026-10-11b'). The database only accepts that format and keeps the
// newest one per account. Changing it asks everyone to accept again. Keep a copy of every version's
// text (git keeps this file's history).

export const TERMS_VERSION: string = '2026-10-11';
export const TERMS_UPDATED: string = '11 October 2026';

export type LegalBlock = { title: string; paragraphs?: string[]; points?: string[]; important?: boolean };
export type LegalDoc = { id: 'terms' | 'health' | 'community'; title: string; intro: string[]; blocks: LegalBlock[] };

export const LEGAL_DOCS: LegalDoc[] = [
  {
    id: 'terms',
    title: 'Terms of Service',
    intro: ['Placeholder: the agreement between you and Voltrix when you use {app}. The final text replaces this.'],
    blocks: [
      {
        title: 'Placeholder: about Voltrix',
        paragraphs: [
          'Placeholder: Voltrix is a platform. Trainers are independent businesses responsible for their own services.',
        ],
      },
      {
        title: 'Placeholder: limits on liability',
        important: true,
        points: [
          'Placeholder: an important term that limits liability.',
          'Placeholder: a risk you take on.',
          'Placeholder: what you cover Voltrix for.',
        ],
      },
      {
        title: 'Placeholder: payments',
        paragraphs: ['Placeholder: no money moves through Voltrix between clients and trainers.'],
        points: ['Placeholder: the Voltrix Coach subscription.', 'Placeholder: cancelling.'],
      },
    ],
  },
  {
    id: 'health',
    title: 'Health and Safety',
    intro: ['Placeholder: exercise carries risk. Read this before you train with {app}.'],
    blocks: [
      {
        title: 'Placeholder: check with a doctor',
        important: true,
        points: ['Placeholder: when to see a doctor first.', 'Placeholder: stop if something hurts.'],
      },
      {
        title: 'Placeholder: your trainer',
        paragraphs: ['Placeholder: your trainer is responsible for their advice and their qualifications.'],
      },
    ],
  },
  {
    id: 'community',
    title: 'Community Rules',
    intro: ['Placeholder: how everyone on {app} looks after each other.'],
    blocks: [
      {
        title: 'Placeholder: what is allowed',
        points: ['Placeholder: be kind and respectful.', 'Placeholder: only share what you may share.'],
      },
      {
        title: 'Placeholder: reports and blocks',
        paragraphs: ['Placeholder: what happens when something is reported.'],
      },
    ],
  },
];

export const ACCEPT_SCREEN: {
  title: string;
  lead: string;
  keyPoints: { title: string; body: string }[];
  important: string[];
  checks: { id: 'age' | 'terms' | 'health'; label: string }[];
  button: string;
  declineNote: string;
} = {
  title: 'Placeholder: before you start',
  lead: 'Placeholder: a short line on why {app} asks you to accept these.',
  keyPoints: [
    { title: 'Placeholder: key point one', body: 'Placeholder: one or two short lines.' },
    { title: 'Placeholder: key point two', body: 'Placeholder: one or two short lines.' },
    { title: 'Placeholder: key point three', body: 'Placeholder: one or two short lines.' },
  ],
  important: [
    'Placeholder: an important term that limits liability.',
    'Placeholder: a risk you take on when you train.',
    'Placeholder: what you cover Voltrix for.',
  ],
  checks: [
    { id: 'age', label: 'Placeholder: I am 18 or older.' },
    { id: 'terms', label: 'Placeholder: I accept the Terms of Service, the Community Rules and the Privacy page.' },
    { id: 'health', label: 'Placeholder: I have read the Health and Safety Notice and understand the risks.' },
  ],
  button: 'Accept and continue',
  declineNote: 'Placeholder: what happens if you don’t accept.',
};

export const SUBSCRIPTION_SUMMARY: string[] = [
  'Placeholder: what the subscription costs and when it renews.',
  'Placeholder: how to cancel.',
];

export const BUSINESS: {
  name: string | null;
  registration: string | null;
  address: string | null;
  email: string | null;
  informationOfficer: string | null;
} = {
  name: null,
  registration: null,
  address: null,
  email: null,
  informationOfficer: null,
};
