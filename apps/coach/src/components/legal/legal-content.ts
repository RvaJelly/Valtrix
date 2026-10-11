// The Terms of Service, the Health and Safety Notice and the Community Rules, and the words on the
// screen everyone accepts before they use the app. The same file in Voltrix and Voltrix Coach.
//
// Final text for attorney review, 11 October 2026. It is generated from the reviewed source that also
// makes the attorney's copy, so the two always match: change the source and regenerate, never edit here.
//
// Rules for the text:
// - Plain words (the Consumer Protection Act asks for plain language). No markdown inside strings.
// - "{app}" shows as the name of the app being used: "Voltrix" or "Voltrix Coach".
// - `important: true` puts a block in a highlighted box (CPA s49: terms that limit what Voltrix is
//   responsible for, ask a person to accept a risk or cover a cost, or confirm a fact).
// - A block titled "Part A. ...", "Part B. ..." or "Part C. ..." starts a part of the Terms.
//
// Versions: TERMS_VERSION is the day the version took effect, 'YYYY-MM-DD' (a letter after it for a
// second version on the same day: '2026-10-11b'). The database only accepts that format and keeps the
// newest one per account. Changing it asks everyone to accept again. Keep the text of every version
// (git keeps this file's history).

export const TERMS_VERSION: string = '2026-10-11';
export const TERMS_UPDATED: string = '11 October 2026';

export type LegalBlock = { title: string; paragraphs?: string[]; points?: string[]; important?: boolean };
export type LegalDoc = { id: 'terms' | 'health' | 'community'; title: string; intro: string[]; blocks: LegalBlock[] };

export const LEGAL_DOCS: LegalDoc[] = [
  {
    id: 'terms',
    title: 'Terms of Service',
    intro: [
      'These Terms of Service are the agreement between you and us, the business that runs Voltrix. They apply to both of our apps: Voltrix Coach, for personal trainers, and the Voltrix app, for the people they train.',
      'Part A applies to everyone. Part B applies to trainers. Part C applies to clients. The Health and Safety Notice and the Community Rules are part of this agreement too. Our Privacy Policy explains how we handle personal information.',
      'Some sections are shown in a highlighted Important box. They limit what we are responsible for, ask you to accept a risk or cover a cost, or ask you to confirm a fact. South African law asks us to point these out, so please read them with care.',
    ],
    blocks: [
      {
        title: 'In short',
        points: [
          'Voltrix is software. It helps trainers run their business and helps clients train with them. We are not a trainer, gym, doctor or dietitian.',
          'Trainers are independent businesses. Each trainer is responsible for their own sessions, advice, prices, qualifications and insurance. Unless a trainer’s profile shows a Verified badge, we haven’t checked anything about them.',
          'No money passes through Voltrix between clients and trainers. Clients pay their trainer directly and never pay us. Only trainers pay us, for a Voltrix Coach subscription.',
          'Exercise and changes to what you eat can cause injury, illness and, in rare cases, death. Please read the Health and Safety Notice.',
          'Stories and reels can be seen by everyone using Voltrix, and can be shared outside it. We have zero tolerance for objectionable content and abusive users.',
          'Voltrix Coach will be a monthly subscription with a free trial and no minimum term. Until card payments open, trainers use it free, with access we give them.',
          'Some sections limit what we are responsible for. They are in highlighted Important boxes. They never take away rights that South African law says can’t be taken away, and you can always complain to a regulator or go to court.',
        ],
      },
      {
        title: 'Part A. For everyone',
        paragraphs: ['This part applies to everyone who uses Voltrix, trainers and clients alike.'],
      },
      {
        title: '1. Who we are',
        paragraphs: [
          'Voltrix is run by the business named under Business details at the top of these Terms. Business details also give our legal status, our registration number if we have one, our physical address and how to contact us. That physical address is where we accept legal documents.',
          'If Business details don’t show a company registration number, Voltrix is run by one person as a sole proprietor, trading under the name Voltrix. That person is who you have this agreement with. If Voltrix becomes a company, section 31 explains what happens.',
          'We don’t belong to any industry body, and we haven’t signed up to any code of conduct. If that changes, we will say so here.',
        ],
      },
      {
        title: '2. Words we use',
        points: [
          'Voltrix means our service: Voltrix Coach, the Voltrix app and their web versions.',
          'We, us and our mean the business that runs Voltrix, named in Business details (section 1).',
          'You means the person using Voltrix under these Terms.',
          'Voltrix Coach is our app for personal trainers. The Voltrix app is our app for the people they train.',
          'A trainer is anyone who uses Voltrix Coach to coach people. A client is anyone who uses the Voltrix app, including to train with a trainer.',
          'Content means anything you put into Voltrix: words, photos, videos, workouts, programs, plans, comments and messages.',
          'Stories and reels are the photos and videos people share with everyone on Voltrix.',
          'A business day is any day except a Saturday, Sunday or South African public holiday.',
          'These Terms means this document together with the Health and Safety Notice and the Community Rules.',
        ],
      },
      {
        title: '3. How you accept these Terms, and getting a copy',
        paragraphs: [
          'Before you create an account or use either app, we ask you to tick three boxes and tap Agree and continue. The boxes confirm that you’re 18 or older, that you agree to these Terms and the Community Rules, and that you’ve read the Health and Safety Notice and accept the risks it describes. You can read each document in full first.',
          'Only you can accept these Terms for yourself. A trainer, partner, parent or friend can’t accept them for you, and you can’t accept them for anyone else.',
          'You can read these Terms at any time in the app, in Settings under Help. If you’d like a copy of this version or an earlier one, ask us and we’ll send it to you free.',
          'We keep a record of each time you accept. Section 29 explains what it contains and how long we keep it.',
        ],
      },
      {
        title: '4. Who can use Voltrix',
        paragraphs: [
          'You must be 18 or older to use either app. By ticking the age box, you confirm that you are.',
          'If we learn that someone under 18 has an account, we will close it and delete their information, apart from our record of what they told us when they signed up and anything else the law requires or allows us to keep. Trainers must not invite or add anyone under 18 as a client.',
          'Use your real name and true details, keep them up to date, and have only one account. Each account is for one person. Don’t open a new account if we have suspended or closed yours.',
          'Voltrix is meant for people in South Africa. If you use it from another country, you must follow that country’s laws, and you may also have rights under them.',
        ],
        important: true,
      },
      {
        title: '5. What Voltrix is, and what it isn’t',
        paragraphs: [
          'Voltrix is software. Voltrix Coach helps trainers run their business: clients, sessions, programs, plans, messages and records. The Voltrix app helps people train with their trainer, keep track of their progress and find a trainer.',
          'Please understand what we don’t do:',
        ],
        points: [
          'We are not a trainer, gym, doctor, dietitian, physiotherapist or biokineticist. Nothing Voltrix itself provides is medical, dietary or treatment advice. Advice from a trainer is the trainer’s own.',
          'We don’t train anyone, and we don’t supervise trainers.',
          'We don’t check trainers’ identity, qualifications, registrations, insurance, experience or specialties, unless a trainer’s profile shows a Verified badge. A Verified badge means only that, when we gave it, we saw the trainer’s identity document and a current fitness qualification or registration. It doesn’t mean we checked anything else, such as insurance, experience or whether the qualification covers everything they offer, and it doesn’t mean we recommend them.',
          'Everything else on a trainer’s profile comes from the trainer. Being listed or shown in Voltrix doesn’t mean we recommend a trainer.',
          'We are not part of the agreement between a trainer and a client, and no money passes through Voltrix between them.',
          'Voltrix is not an emergency service. In an emergency, call 112 from a cellphone or 10177 for an ambulance.',
        ],
        important: true,
      },
      {
        title: '6. Health and safety',
        paragraphs: [
          'Exercise, and changes to what you eat, can cause injury and illness. In rare cases they can cause a heart attack, a stroke or death. The Health and Safety Notice explains these risks and how to lower them. It is part of these Terms.',
          'By ticking the health box, you confirm that you have read the Notice and understand these risks. You also accept the risks that are a normal part of exercise and of changing what you eat: the risks that remain even when everyone takes reasonable care.',
          'You don’t accept harm caused by someone else’s carelessness. A trainer is responsible for their own sessions and advice, and section 22 explains what we are and aren’t responsible for.',
          'Check with a doctor before you start, and whenever your health form in the Voltrix app or the Notice says so. Stop and get medical help straight away if you feel chest pain, faintness or severe breathlessness.',
        ],
        important: true,
      },
      {
        title: '7. Your account and keeping it safe',
        paragraphs: [
          'One sign-in works in both apps. If you’re a trainer and you also use the Voltrix app to train with someone, Part C applies to you there.',
          'Keep your password private and your phone locked. Don’t share your account or let anyone else use it. If you think someone else has used your account, change your password and tell us straight away.',
          'If you turn on unlock with Face ID or fingerprint, your phone does the check. We never receive your face or fingerprint data. Anyone you allow to unlock your phone may be able to open the app.',
          'You are responsible for what is done on your account by you, by anyone you let use it, or because you didn’t keep your sign-in details safe. You are not responsible for misuse that wasn’t your fault, or for anything done after you told us your account was being misused.',
        ],
        important: true,
      },
      {
        title: '8. Getting the apps, and early versions',
        paragraphs: [
          'Only install Voltrix from Google Play, Apple’s App Store or our own download page. If someone sends you the app as a file, or a link to anywhere else, don’t install it, even if it seems to come from your trainer.',
          'Voltrix is new and in early testing. Until the apps are in the app stores, your phone may warn you that the app didn’t come from a store. Only continue if you’re on our own download page. If you’re unsure, don’t install it and ask us first.',
          'Early versions may have more mistakes, and features may change or be removed while we build Voltrix. Section 21 explains how we handle changes.',
        ],
      },
      {
        title: '9. Using Voltrix fairly',
        paragraphs: [
          'Use Voltrix only for what it’s made for: training, coaching and the community around it. You must not:',
        ],
        points: [
          'break the law, or help anyone else break it',
          'break the Community Rules',
          'pretend to be someone else, or give false details',
          'look at, copy or use anyone’s information unless they agreed, or you need it to coach them or train with them in Voltrix',
          'use the Trainers list, someone’s location or anything else in Voltrix to find, follow or turn up on anyone who hasn’t invited you',
          'send spam, chain messages or advertising to people who didn’t ask for it',
          'copy, scrape or collect content or information from Voltrix with bots or other automated tools',
          'try to get into accounts, information or parts of Voltrix that aren’t yours, or get around a block, a suspension, our security or our limits',
          'upload viruses or harmful code, or do anything that could damage, overload or slow down Voltrix',
          'copy, change or sell our apps, or take their code apart to see how they work, except where the law allows it',
          'use Voltrix to build a competing product, or sell access to it',
        ],
      },
      {
        title: '10. Found a security problem?',
        paragraphs: [
          'If you find a weakness in Voltrix’s security, please tell us privately using the contact details in section 1, and don’t use it or share it. We’re grateful for reports made in good faith.',
        ],
      },
      {
        title: '11. Your content, and the permission you give us',
        paragraphs: [
          'You own what you create and post. We don’t claim ownership of it.',
          'So that Voltrix can work, you give us permission to store, copy, back up, show and send your content to the people you share it with, and to change its format, for example to compress a video, fit a photo to the screen or make a thumbnail. This permission is free and not exclusive, which means you can give the same permission to anyone else. It lets us use service providers such as our hosting company, and we use it only to run Voltrix.',
          'When you post a story or reel, you also let everyone who can see it on Voltrix watch it, send it in a Voltrix chat, share it to other apps with the Share button, and save it for their own use. They may not sell it or present it as their own.',
          'We won’t use your content to advertise Voltrix, for example on our website or social media, unless you separately say yes.',
          'The permission ends when you delete the content or your account. It continues only for copies other people already have (such as a photo you sent in chat, or a reel someone saved or shared), copies in backups until they’re deleted, and anything we must keep because of the law, a complaint or a legal claim.',
          'You promise that you have the right to share everything in your content, including music, videos, pictures and logos, and that everyone who can be recognised in it agreed to be shown. Trainers must have a client’s permission before showing them, their photos, their name or their results.',
          'We don’t have music licences. Content with music you aren’t allowed to use may be muted or removed.',
        ],
      },
      {
        title: '12. Who can see what you share',
        points: [
          'Stories and reels can be seen by everyone signed in to Voltrix Coach or the Voltrix app, except people you’ve blocked or who have blocked you. Stories disappear after 24 hours. Reels stay until you delete them.',
          'Anyone who has the web link to a photo or video in a story, reel or profile picture can open it, even without Voltrix. People can share reels outside Voltrix, for example to WhatsApp, and save them on their phone. Once a copy is outside Voltrix, we can’t take it back.',
          'Comments and likes can be seen by people who can see the reel or story. The person who posted a story can see who liked it.',
          'Trainers’ profiles are shown in the Trainers list and next to their posts. Everyone’s name and photo are shown next to their posts and comments, and to their trainers.',
          'Chats can be seen in the apps only by the people in the chat. Section 16 explains the rare cases when we may look at one.',
          'What you log in the Voltrix app, your health form and your progress photos can be seen in the apps only by you and the trainers who coach you, while they coach you. Section 27 explains when people who work for us may look at information.',
        ],
      },
      {
        title: '13. The Community Rules, and how we moderate',
        paragraphs: [
          'We have zero tolerance for objectionable content and abusive users. The Community Rules say what isn’t allowed anywhere in Voltrix: stories, reels, comments, profiles, chats, calls and requests.',
          'We don’t check content before it appears. We rely on reports, on automatic checks where we use them, and on our own review.',
          'Anyone can report a post, a comment or a person. When several people report a post, it’s hidden automatically while we look at it. We aim to review reports within 24 hours, and we deal first with reports about children, intimate images and threats.',
          'If we reasonably believe that content or behaviour breaks the law or the Community Rules, we may remove or hide the content, limit what the account can do, warn the person, or suspend or close the account. Section 26 explains when we act at once and when we give notice first.',
          'We’ll tell you in the app when we remove your content or limit your account, and why, unless the law or someone’s safety means we can’t. If you think we got it wrong, ask us to look again within 30 days, using the contact details in section 1. A person will review it and tell you the outcome, normally within 5 business days. Asking us to look again doesn’t stop you complaining to a regulator or going to court.',
          'We keep a short record of reports and what we did about them, so we can deal with repeat problems and show what we did if there’s a complaint or claim.',
        ],
      },
      {
        title: '14. Crimes, and working with the authorities',
        paragraphs: [
          'If content shows or suggests the sexual abuse or exploitation of a child, we remove it from view, report it to the South African Police Service and the Film and Publication Board, and close the account permanently. The law requires us to report it. We keep a copy locked away only so that we can hand it to the police, and we delete it when they no longer need it.',
          'We may also keep evidence of, and report to the police, intimate images shared without consent, threats of violence and other serious crimes.',
          'We follow court orders and lawful requests from the police, the Film and Publication Board, the Information Regulator and other authorities. This may mean giving them information about an account, or removing content. We share only what the law requires or allows.',
        ],
      },
      {
        title: '15. If you think something on Voltrix is unlawful',
        paragraphs: [
          'The quickest way to tell us is the Report option on the item. You can also send us a written take-down notice, as our take-down contact, using the email address or physical address in Business details. We use this, for example, when something is defamatory, invades someone’s privacy or uses their work without permission.',
          'We act quickly on proper notices. We may tell the person who posted the content, so they can respond, and we may put content back if a notice turns out to be wrong. Anyone who knowingly sends a false notice can be held liable for the harm it causes.',
          'A take-down notice should include:',
        ],
        points: [
          'your full name and address',
          'your signature, which can be typed',
          'the right you say is being infringed',
          'what the content is and where it is, as exactly as you can',
          'what you want us to do about it',
          'your phone number and email address',
          'a statement that you are acting in good faith',
          'a statement that the information in your notice is true and correct',
        ],
      },
      {
        title: '16. Chats, calls and messages',
        paragraphs: [
          'Chat and calls are between a trainer and a client who are linked in Voltrix. Messages and photos are stored so the apps can show them. You can delete a message you sent, and it disappears for both of you.',
          'Voice and video calls connect directly between the two phones. We don’t record or listen to calls. We keep only who called whom, whether it was a voice or video call, and when it started and ended. To connect a call, each phone learns the other’s internet (IP) address, and Google’s connection servers see both. Calls can fail on some networks and may drop.',
          'We don’t read your chats. If you report something that happened in a chat or a call, tell us what happened in your report. We look at a chat ourselves only to investigate a serious safety, security or legal problem that has been reported to us, or when the law requires it.',
          'Don’t record, screenshot or share a call, video session, chat or photo without the other person’s permission, except to report a problem to us, the police or another authority, to apply for a protection order, or to get legal advice.',
          'Chat and calls are not for emergencies, and a message may not be seen in time. In an emergency, call 112 from a cellphone.',
          'If we ever add call recording, we’ll ask first, and both people will see when a call is being recorded.',
        ],
      },
      {
        title: '17. Calendar links',
        paragraphs: [
          'If you turn on your calendar link, anyone who has the link can see your session times and places without signing in, so keep it private. You can make a new link or turn it off in Settings at any time, and the old link stops working straight away.',
          'When you add the link to Google Calendar, Apple Calendar, Outlook or another calendar app, that company keeps its own copy under its own terms. If you share the link, or add it to a calendar other people can see, they’ll see your sessions too. If you think someone has it who shouldn’t, make a new link.',
          'Trainers: your link shows each client’s first name and last initial, and each session’s place, which may be a client’s home address. You are responsible for where you add it.',
        ],
      },
      {
        title: '18. Other services Voltrix uses',
        paragraphs: [
          'Some parts of Voltrix rely on other companies. Their own terms and privacy policies apply to what they do.',
        ],
        points: [
          'Our hosting company, Supabase, runs and stores Voltrix in Frankfurt, Germany. An email company sends our emails for us.',
          'Food information comes from Open Food Facts (openfoodfacts.org), a free database built by volunteers and made available under the Open Database License. It can be wrong or out of date, so always check the label, especially for allergies and medical diets.',
          'Google’s servers help connect calls. Google’s Firebase service delivers notifications from our servers, and Apple’s service does so on iPhones.',
          'Your phone’s map service (Google on Android, Apple on iPhone) turns a trainer’s rough location into a town name.',
          'Trainers send WhatsApp invites from their own WhatsApp account. Voltrix doesn’t send them.',
          'Calendar apps, app stores and the apps you share reels to are run by their own companies.',
          'You pay for the mobile data Voltrix uses, under your own contract with your network, and you must keep to that contract.',
        ],
      },
      {
        title: '19. Messages and notifications from us',
        paragraphs: [
          'We send you the messages you need to use Voltrix, such as account emails, session reminders, booking and chat alerts, safety notices, billing messages and changes to these Terms. These aren’t marketing.',
          'We will only send you news, offers or other marketing if you say yes, and every marketing message will let you stop them easily.',
          'Session reminders are set on your phone. They show the session time and may show the other person’s name and the place.',
          'Notifications from our servers are delivered through Google’s Firebase service, and through Apple’s service on iPhones, which may handle them outside South Africa. A notification says who it’s from, what happened and when. It never includes health form or check-in answers, notes, prices, payments, places, phone numbers or email addresses. A message notification shows the message text only if Show message text is on in Settings, under Notifications.',
          'Notifications can show on your lock screen, where anyone who sees your phone can read them. You can hide them there, or turn them off, in your phone’s settings.',
          'When we need to tell you something important, such as a change to these Terms or to your subscription, we’ll tell you in the app and by email. We won’t treat a message as received just because we sent it.',
        ],
      },
      {
        title: '20. Our apps and our name',
        paragraphs: [
          'Voltrix, Voltrix Coach, our logos, designs and software, and the content we create (such as the built-in exercise library and the Voltrix templates) belong to us or to the people who license them to us.',
          'We give you a personal permission to use the apps for yourself or, if you’re a trainer, for your own training business, while you have an account and keep to these Terms. You can’t transfer this permission, and it doesn’t give you any right to use our name or logos. It ends if your account is closed.',
          'Some parts of our apps use open-source software, which comes with its own licences.',
          'If you send us ideas or suggestions, we may use them freely without paying you. We won’t publish your name with them without asking you.',
        ],
      },
      {
        title: '21. Keeping Voltrix running, and changing features',
        paragraphs: [
          'We work hard to keep Voltrix running and your information safe, and to fix problems quickly. Like all software, though, Voltrix may sometimes be unavailable, slow or wrong, for example during maintenance or when a service we rely on fails.',
          'Now and then we may pause Voltrix for a short time to update it, or ask you to update the app when an older version can no longer work safely. We’ll show a message in the app when we do.',
          'Keep your own copy of anything that matters to you, such as the client records you need for your business, insurance or tax. You can ask us for a copy of your information at any time, free, and we’ll send it to you.',
          'We may improve, change or remove features. If we remove a feature you use, we’ll tell you in the app before we do, and you can leave and delete your account at any time. If a change removes something important that trainers pay for, we’ll tell trainers at least 30 days before, unless we must act sooner for security or legal reasons. Trainers can then cancel and get a refund for any time they’ve paid for and won’t use.',
          'If we decide to close Voltrix completely, we’ll give you at least 60 days’ notice and time to save your information, and refund trainers for any time paid for after the closing date.',
        ],
      },
      {
        title: '22. What we are and aren’t responsible for',
        paragraphs: [
          'We are responsible for providing Voltrix with reasonable care and skill, and for harm we cause by breaking these Terms or through our own negligence, as South African law provides. The next sections set out the limits.',
          'We are not responsible for loss or harm caused by the things listed below, even if our own negligence (carelessness) played a part. This doesn’t apply to death or personal injury caused by our negligence, or to anything in section 24. It also doesn’t cover loss caused by Voltrix itself not working as it should, such as the app showing a wrong time, amount or weight, or losing what you saved: for that, the limits in section 23 apply.',
        ],
        points: [
          'a trainer’s own sessions, programs, plans, advice, conduct, prices and refunds, and other dealings between a trainer and a client',
          'what another user posts, sends or does, on Voltrix or anywhere else',
          'your own choices about exercise, food and your health, including choosing to train without a trainer or without seeing a doctor',
          'information that you or other users put into Voltrix, or food information from Open Food Facts, being wrong, unless we changed it or showed it wrongly',
          'services we don’t run, such as app stores, your phone, your network, calendar apps, WhatsApp and Google’s services',
          'events beyond our reasonable control, such as power cuts, load-shedding, network failures, natural disasters, or an attack on a service we rely on that we could not reasonably have prevented',
        ],
        important: true,
      },
      {
        title: '23. Limits on what we pay',
        paragraphs: [
          'We are not responsible for loss of profits, income, business, clients or goodwill, or for indirect loss that neither of us could reasonably have expected when you accepted these Terms, even if our negligence (carelessness) played a part.',
          'If we are responsible to you for any other loss, including loss caused by our negligence, the most we will pay you for any one event, or a series of connected events, is the greater of: the amount you paid us in the 12 months before the event; or R1,000.',
          'These limits don’t apply to death or personal injury, or to anything in section 24.',
        ],
        important: true,
      },
      {
        title: '24. What these limits never cover',
        paragraphs: ['Nothing in these Terms limits or excludes:'],
        points: [
          'loss caused by gross negligence (extreme carelessness, far worse than an ordinary mistake), deliberate wrongdoing or fraud, by us or anyone acting for us',
          'death or personal injury caused by our negligence',
          'any right you have under the Consumer Protection Act, the Electronic Communications and Transactions Act, the Protection of Personal Information Act or any other law that the law doesn’t allow us to limit or exclude',
          'your right to a refund where these Terms or the law give you one',
          'any claim by your dependants or other people who are not part of this agreement',
        ],
        important: true,
      },
      {
        title: '25. When you must cover our costs',
        paragraphs: [
          'If someone else makes a legal claim against us because of content you posted or sent, or because of something unlawful you did using Voltrix, you must pay us back the damages and reasonable legal costs we have to pay because of it.',
          'You only have to pay an amount a court orders, or a settlement you agreed to, and only for the part of the loss you caused. You don’t have to pay for any part that we caused. We’ll tell you promptly about any such claim and give you a fair chance to take part in how it’s handled.',
          'Trainers also have the duty in section 55.',
        ],
        important: true,
      },
      {
        title: '26. Closing or suspending an account',
        paragraphs: [
          'You can stop using Voltrix and delete your account at any time, in Settings, or on the screen that asks you to accept new Terms. Section 28 explains what happens to your information, and section 49 what happens to a trainer’s subscription.',
          'For most breaches of these Terms or the Community Rules, we’ll first warn you and give you a fair chance to put things right, normally 10 business days. If you don’t, we may suspend or close the account.',
          'We may also close an account for another fair reason, such as closing a feature or the service, with at least 30 days’ notice. If we close a trainer’s account and it wasn’t because the trainer broke these Terms, we’ll refund any time they’ve paid for and can’t use.',
          'While an account is suspended, it can’t be used in either app, its posts and comments are hidden, and people can’t book it or ask it for training. We’ll tell you why in the app. You can ask us to review a suspension or closure within 30 days, and you can still ask us for a copy of your information, or to delete it.',
          'If we receive a report that a trainer may have harmed someone, we may hide them from the Trainers list while we look into it.',
          'To stop someone coming back after we suspend or close their account, we may block the phones it used and the email address and phone numbers linked to it. We keep these only as codes that can’t be turned back into the details, and we remove them 30 days after the block ends.',
          'We may suspend or close an account straight away, without warning, only if:',
        ],
        points: [
          'we reasonably believe it’s needed to protect someone’s safety, to prevent serious harm or to obey the law',
          'it was used for sexual content involving a child, sharing intimate images without consent, threats, violence, hate, harassment, stalking, fraud or scams, misusing someone’s health or personal information, or pretending to be someone else',
          'it belongs to someone under 18',
          'it was used to break the Community Rules seriously or repeatedly',
        ],
      },
      {
        title: '27. People who work for us, and what they can see',
        paragraphs: [
          'People who work for us, starting with the owner of Voltrix, can see each account’s name, email address and any phone number it gave us, its public profile and posts, reports and suspensions about it, and the kind of phones it’s used on. For trainers, they can also see the plan and the number of clients.',
          'They use this to run Voltrix: to give free access, give Verified badges, deal with reports, remove content, and suspend or close accounts under these Terms.',
          'They look at other information, such as chats, health forms, progress or food diaries, only to help you when you ask, to keep Voltrix safe and working, to deal with a serious report, a complaint or a legal claim, or when the law requires it. Everyone who works for us must keep information confidential. The Privacy Policy explains more.',
        ],
      },
      {
        title: '28. What happens when you delete your account',
        paragraphs: [
          'When you delete your account, we delete your profile and what you added to Voltrix, including your stories, reels, comments, photos, progress, workout logs, food diary, health form and the messages you sent. We try to remove every file straight away. If a technical problem leaves a file behind, we remove it as soon as we find it.',
          'When a trainer deletes their account, their clients lose that trainer’s plans, sessions, nutrition plan and the whole chat with them, including the messages the client sent. Clients keep what they logged themselves.',
          'Some things stay, for reasons the law allows:',
        ],
        points: [
          'A trainer’s own record of training you stays with the trainer: your name and the contact details they have for you, your sessions with them, what was paid or owed, their notes, and any date they recorded for your doctor’s OK.',
          'Copies other people already have stay with them, such as chat photos you sent or reels someone saved or shared outside Voltrix.',
          'Our record of the Terms you accepted, with the email address your account had, stays for the time in section 29.',
          'A suspension and its blocks stay until they end, so nobody can come back by deleting their account.',
          'Short records of reports and our decisions stay for the times in the Privacy Policy. Anything we need for an open complaint, dispute or legal claim, or to report a crime, stays until it is no longer needed.',
          'Billing records for trainers’ subscriptions stay for 5 years, because tax law requires it.',
          'Copies in our hosting company’s backups and logs are deleted automatically, within 7 days.',
        ],
      },
      {
        title: '29. Our record of what you accepted',
        paragraphs: [
          'Each time you accept a version of these Terms, we record which version you accepted, the date and time (from our server, and from your phone), which app you used, whether you used Android, an iPhone or the web, and the boxes you ticked. We keep the exact text of every version we publish.',
          'Nobody can change these records in the app, and we never change what they say you accepted. When an account is closed, we add the date and the email address it had, so the record still shows who accepted. We use these records as evidence of what was agreed, but they are not final proof: you can always show that a record is wrong.',
          'We keep these records while you have an account, and for 3 years after it’s closed, or longer while a complaint, dispute or claim is open or the law still allows one to be brought, for example by someone who was under 18. After that, we remove everything in them that could identify you.',
        ],
      },
      {
        title: '30. Changes to these Terms',
        paragraphs: [
          'We may need to update these Terms, for example when we add features, when the law changes, or to make them clearer. Each version has a date, and we keep every earlier version, which we’ll send you free if you ask.',
          'We’ll tell you about a change in the app and by email, with a short summary of what’s changing. For changes that affect your rights or what you pay, we’ll tell you at least 20 business days before they take effect, unless the law or someone’s safety requires a change sooner.',
          'We’ll ask you to read and accept the new version before you carry on using Voltrix. We will never treat silence, or simply carrying on using the app, as you agreeing. If your version of the app is too old to show you new Terms, we’ll ask you to update it first.',
          'You don’t have to accept a new version. You can stop using Voltrix and delete your account at any time, at no charge, including from the screen that asks you to accept. A trainer who leaves because of a change gets a refund for any time they’ve paid for and won’t use.',
        ],
      },
      {
        title: '31. If Voltrix becomes a company',
        paragraphs: [
          'Voltrix may start trading through a company, such as a private company its founder owns or controls. If that happens, we’ll move this agreement to that company. We’ll tell you at least 20 business days before, and the company will take on all our duties to you. Your rights won’t be reduced.',
          'We’ll ask you to accept the Terms again in the company’s name. If you don’t want to move, you can close your account before the move, and trainers get a refund for any time they’ve paid for and won’t use.',
          'We won’t transfer this agreement to anyone else, such as a buyer of Voltrix, without telling you first and giving you the same choice.',
          'You can’t transfer your account or this agreement to anyone else.',
        ],
      },
      {
        title: '32. Complaints',
        paragraphs: [
          'If something goes wrong, please tell us. It’s usually the quickest way to put it right. Contact us using the details in section 1 and tell us who you are, what happened and what you’d like us to do.',
          'We’ll confirm we’ve received your complaint within 5 business days and give you our answer within 20 business days. If we need longer, we’ll tell you why and when to expect it.',
          'We will never force you into private arbitration, and you keep your right to bring a claim together with other people where the law allows it.',
          'You don’t have to come to us first. You can go straight to any of these, and nothing in these Terms limits that:',
        ],
        points: [
          'the National Consumer Commission (thencc.org.za)',
          'the Consumer Goods and Services Ombud (cgso.org.za)',
          'the Information Regulator, about your personal information (inforegulator.org.za, 010 023 5200 or toll-free 0800 017 160)',
          'the Film and Publication Board, about harmful content (fpb.org.za)',
          'the National Consumer Tribunal, a provincial consumer protector or consumer court, or another alternative dispute resolution agent',
          'the Small Claims Court or any other court that can hear your claim',
        ],
      },
      {
        title: '33. South African law and courts',
        paragraphs: [
          'South African law governs these Terms.',
          'You may bring a claim in any South African court that is allowed to hear it, including the Magistrates’ Court or Small Claims Court near you. We will never insist that you go to a court far from where you live.',
          'If you live outside South Africa, the consumer laws of your country may also protect you, and nothing here takes those rights away.',
          'Nothing in these Terms shortens the time the law gives you to make a claim.',
        ],
      },
      {
        title: '34. General',
        points: [
          'These Terms, the Health and Safety Notice, the Community Rules, and what we show you on the Subscribe screen before you subscribe, make up the agreement between us about Voltrix.',
          'If a court decides that part of these Terms can’t be enforced, the rest still applies.',
          'If either of us doesn’t enforce a right straight away, we can still enforce it later.',
          'If anything in these Terms is unclear, or can be read in more than one way, the meaning that is better for you applies.',
          'Sections that by their nature should continue after your account closes, such as those about records, responsibility, covering costs and complaints, continue.',
          'These Terms are written in English. If we ever offer a translation and it differs, the version that is better for you applies.',
        ],
      },
      {
        title: '35. App stores',
        paragraphs: [
          'If you subscribe through Google Play or Apple’s App Store, that store takes your payment under its own terms, and its rules on cancelling and refunds apply to the payment as well as these Terms. We still keep every promise we make in these Terms.',
          'If you downloaded an app from Apple’s App Store, these points also apply:',
        ],
        points: [
          'This agreement is between you and us, not Apple. We, not Apple, are responsible for the app and its content.',
          'You may use the app on Apple devices that you own or control, as Apple’s Usage Rules allow.',
          'Apple has no duty to provide maintenance or support for the app.',
          'If the app fails to meet a warranty that applies to it, you can tell Apple, and Apple will refund the price you paid for the app, if any. As far as the law allows, Apple has no other warranty duty for the app.',
          'We, not Apple, deal with any claims about the app, including product liability claims, claims that the app breaks a law or regulation, and consumer protection or privacy claims.',
          'If someone claims that the app, or your use of it, infringes their intellectual property, we, not Apple, will investigate, defend and settle that claim.',
          'You confirm that you are not in a country subject to a United States government embargo, or that the United States has named as supporting terrorism, and that you are not on any United States government list of prohibited or restricted parties.',
          'You must keep to any third-party terms that apply when you use the app, such as your mobile data contract.',
          'Apple and its subsidiaries can rely on this agreement even though they aren’t part of it: once you accept it, Apple has the right to enforce it against you.',
          'Our name, address and contact details for questions, complaints and claims are in Business details.',
        ],
        important: true,
      },
      {
        title: 'Part B. For trainers',
        paragraphs: ['This part applies when you use Voltrix Coach. Part A applies too.'],
      },
      {
        title: '36. You run your own business',
        paragraphs: [
          'You use Voltrix Coach as an independent business. You are not our employee, partner or agent, and you can’t make promises or agreements on our behalf.',
          'You decide who you train, and how, when, where and for how much. We don’t set your prices, give you clients, pay you or supervise your work.',
          'You are responsible for your services and for everything you tell or give your clients, including your sessions, programs, plans, nutrition advice, videos and messages, and for anyone who works with you.',
          'When you tick the terms box in Voltrix Coach, you confirm that you run your own business and will follow the laws that apply to it.',
        ],
        important: true,
      },
      {
        title: '37. Your profile and the Trainers list',
        paragraphs: [
          'Your profile must be true and up to date, including your name, business, experience, specialties, qualifications and anything you say about results. Change or remove anything that stops being true.',
          'Only call yourself a dietitian, physiotherapist, biokineticist, doctor or other health professional if you are registered as one with the Health Professions Council of South Africa. Only offer help returning from injury, nutrition guidance, or pre- and postnatal training if you are properly qualified for it, and stay within what your training allows.',
          'If you have a business name and current access to Voltrix Coach, people without a trainer can find you in the Trainers list. They can sort it from A to Z, by distance, or by the years of experience you entered. Nobody can pay to be placed higher, and we don’t rate or review trainers.',
          'If you add your location, it’s rounded to about 1 kilometre before it’s saved, and clients see how far away you are and your city, never your address. Someone who measures distances from several places might still work out your rough area, so set your location at the gym or studio where you train people, not at your home. You can remove your location in your profile at any time.',
          'We may remove, or ask you to change, anything in your profile that we reasonably believe is untrue, misleading or unlawful.',
        ],
      },
      {
        title: '38. Looking after your clients',
        paragraphs: ['You are responsible for training your clients safely. That includes:'],
        points: [
          'screening clients before you train them, and asking them to see a doctor when their answers or their health call for it',
          'telling clients clearly about the risks of your sessions and programs, including the risk of serious injury or death, as the Consumer Protection Act requires',
          'planning, supervising and adapting training to each client',
          'keeping your venue and equipment safe, and knowing what to do in an emergency (we strongly recommend current first aid and CPR training)',
          'referring clients to a doctor or other health professional when something is beyond your training',
          'meeting new clients from Voltrix safely: the first time, meet somewhere public and tell someone where you will be',
          'having your own written agreement with your clients, if you want one',
          'holding professional indemnity and public liability insurance that suits your work: we don’t insure you, and we don’t check your insurance',
        ],
        important: true,
      },
      {
        title: '39. Prices, packs, bookings and payments',
        paragraphs: [
          'No money passes through Voltrix between you and your clients. Clients pay you directly, in whatever way you agree. We take no commission.',
          'Prices, packs, paid and owed amounts, and earnings in Voltrix Coach are your own records, for your convenience. They aren’t invoices, receipts, tax records or accounting records, and we don’t check them. You are responsible for invoices, receipts, refunds, VAT and income tax.',
          'Your terms with clients must be fair and lawful. In particular:',
        ],
        points: [
          'Cancellation and no-show charges must be reasonable, and you may not charge a client who couldn’t attend because of their death or because they were in hospital.',
          'Don’t charge interest or late-payment fees on what clients owe you.',
          'Prepaid sessions and packs may be protected by the Consumer Protection Act, which says prepaid credit generally can’t expire within 3 years. Don’t set a pack to end sooner unless you have legal advice that you may.',
          'If you sign a client up for a fixed period, the law lets them cancel early on 20 business days’ notice, with no more than a reasonable cancellation charge.',
          'If we ever add a way for clients to pay you in the app, we’ll explain how it works and ask you to accept updated Terms first.',
        ],
      },
      {
        title: '40. Adding and inviting clients',
        paragraphs: [
          'Only add people who are 18 or older. Only add someone’s name, email address, phone number or other details if you have a lawful reason to, such as an existing or requested training relationship, and tell them that you use Voltrix and why.',
          'WhatsApp invites are sent from your own WhatsApp account. Only message people who expect to hear from you, and don’t send marketing to anyone who hasn’t agreed to receive it.',
          'When you add an email address, Voltrix Coach shows whether that person already has a Voltrix account. Use this only to invite them.',
          'A client is linked to you only when they accept your invite, or you accept their request. While you’re linked, you see what the invite or request told them you would see. When they leave you, or you archive them, that access ends.',
        ],
      },
      {
        title: '41. Your clients’ information',
        paragraphs: [
          'The information you keep about your clients in Voltrix Coach, such as names, contact details, goals, notes, sessions and money records, is your business record. Under the Protection of Personal Information Act (POPIA), you are the responsible party for it, which means you decide how it’s used and you must follow POPIA when you collect and use it.',
        ],
        important: true,
      },
      {
        title: '42. How we look after your clients’ information',
        paragraphs: [
          'We store and process that information for you, as your operator under POPIA: a business that handles information for someone else. We will:',
        ],
        points: [
          'use it only to provide Voltrix to you and your clients, as these Terms and the Privacy Policy describe, or when the law requires it',
          'keep it confidential, and make sure everyone who works for us does the same',
          'keep appropriate, reasonable technical and organisational security measures in place',
          'tell you immediately if we have reason to believe someone has accessed or taken your clients’ information without permission, and help you tell your clients and the Information Regulator',
          'use service providers, such as our hosting company, only under written agreements that protect the information',
        ],
      },
      {
        title: '43. Health information and confidentiality',
        paragraphs: [
          'Your clients’ health forms, progress, photos, measurements and food diaries are sensitive. Keep them confidential. Use them only to train that client safely, don’t share them with anyone without the client’s permission, and don’t copy more out of Voltrix than you need.',
          'Only write a client’s health details, such as injuries, conditions or medicines, in your notes if the client has agreed. Their own health form is the better place for them.',
          'Never post a client’s photos, name or results without their clear permission in writing. A message in Voltrix chat is enough.',
          'When a client leaves you, you no longer see what they log, their health form or their photos. If you need records of a client’s screening or training for your insurance or business, ask the client, and keep your own copy securely under POPIA.',
          'If you think your account has been misused, or your clients’ information has been exposed, tell us straight away.',
        ],
      },
      {
        title: '44. Programs, workouts and videos you create',
        paragraphs: [
          'You own the programs, workouts, plans, exercises and videos you create. You give us the permission in section 11 to store them and show them to the clients you give them to.',
          'You also give each client you share them with a personal permission to use them for their own training, including saving workout videos to their phone. Clients may not sell or share them. Copies a client has saved stay on their phone after they leave you, and we can’t take them back.',
          'You are responsible for what’s in your content, including whether it is safe and accurate, and for having permission for any music, people or other material in it.',
        ],
      },
      {
        title: '45. Voltrix templates and the exercise library',
        paragraphs: [
          'Voltrix Coach includes a built-in exercise library and Voltrix templates: example programs and workouts for trainers to start from. They are general examples written for trainers, not advice for any particular person.',
          'Before you give a template to a client, check that it suits them and change it where needed, including the exercises, weights, sets, reps and rest. You are responsible for what you give your clients.',
        ],
        important: true,
      },
      {
        title: '46. Nutrition plans',
        paragraphs: [
          'Calorie and macronutrient targets and meal ideas you set for clients are your advice, not ours. Unless you are a registered dietitian, keep to general healthy-eating guidance and don’t prescribe diets to treat medical conditions.',
          'Refer clients to a doctor or registered dietitian if they are pregnant or breastfeeding, have diabetes, kidney disease or another medical condition, or have, or have had, an eating disorder.',
        ],
      },
      {
        title: '47. The Voltrix Coach subscription',
        paragraphs: [
          'Card payments for Voltrix Coach aren’t open yet. Until they are, you can use Voltrix Coach only with free access that we give you (section 53), and we charge you nothing. The rest of this section, and sections 48 to 52, apply only once you choose to subscribe.',
          'Voltrix Coach gives you all its features for one monthly subscription: unlimited clients, workouts, programs and the exercise library, bookings and your calendar, chat and video calls, and the community. Your clients use the Voltrix app for free.',
          'Here is everything you pay and agree to:',
        ],
        points: [
          'Price: shown on the Subscribe screen before you start, in the currency shown there. Where an app store shows prices in your own currency, you pay the amount it shows.',
          'Full price: the price shown includes any VAT or other tax. We charge no other fees, commission or set-up costs. Your bank may charge its own fees, such as for foreign currency.',
          'Free trial: 14 days, free, once per trainer. See section 48.',
          'Billing: monthly in advance, starting when your trial ends (or straight away if you subscribe without a trial), and renewing automatically each month until you cancel.',
          'Payment: by card or another method offered on the Subscribe screen, through Google Play, Apple’s App Store or our payment provider. We never see your full card number.',
          'Minimum term: none. You can cancel at any time, with no cancellation fee.',
          'Start: straight away. You can use everything as soon as your trial or subscription starts.',
          'Before you confirm, the Subscribe screen shows your plan, price, trial end date and how to cancel, and you can go back or change your mind.',
        ],
      },
      {
        title: '48. Your free trial',
        paragraphs: [
          'Your 14-day free trial starts when you confirm it on the Subscribe screen. You may be asked for a payment method first, but nothing is charged during the trial.',
          'Unless you cancel before the trial ends, your paid subscription starts when it ends, and you’ll be charged the monthly price then. The Subscribe screen shows the exact date. You agree to this when you tap to start your trial, and we never start charging you without that.',
          'If you cancel during the trial, you pay nothing, and you can keep using Voltrix Coach until the trial ends. We end a trial early only under section 26.',
        ],
      },
      {
        title: '49. Cancelling',
        paragraphs: [
          'You can cancel at any time, with no cancellation fee: in your Google Play or App Store subscription settings if you subscribed there, or by asking us using the details in section 1.',
          'When you cancel, you won’t be charged again. You keep access until the end of the period you’ve paid for, or the end of your trial. After that, your access ends, and you can subscribe again at any time.',
          'If you delete your account while a store subscription is still running, we’ll cancel it for you where the store lets us. If you’re charged for any time after you deleted your account, we’ll refund it.',
        ],
      },
      {
        title: '50. Refunds',
        paragraphs: [
          'Changed your mind? If you ask within 7 days after you start a paid subscription (each time you subscribe), we’ll refund that first payment in full. This is on top of any cooling-off right the law gives you.',
          'Apart from that and the cases below, we don’t refund part of a month you’ve already started, but you can cancel at any time so that you aren’t charged again.',
          'Refunds go back to the way you paid, within 30 days. If you paid through Google Play, we can refund you through Google. If you paid through Apple, Apple handles refunds, and if Apple refuses one that you’re entitled to under these Terms or the law, we’ll refund you directly.',
          'We’ll also refund you, in full or in part as fits the problem, if:',
        ],
        points: [
          'we close your account or Voltrix, or remove an important feature you pay for, and it wasn’t because you broke these Terms (we refund the time you paid for and can’t use)',
          'you leave because you don’t accept a change to these Terms or to the price (we refund the same)',
          'Voltrix doesn’t work as it should for a long time, or a core feature fails, and we can’t fix it within a reasonable time',
          'we charged you by mistake, or charged the wrong amount',
          'the law gives you a refund in any other case',
        ],
      },
      {
        title: '51. Price changes',
        paragraphs: [
          'We may change the price. If we do, we’ll tell you in the app and by email at least 30 days before, and ask you to agree to the new price.',
          'We’ll only charge the new price if you agree to it. If you haven’t agreed by the date it starts, your subscription ends when the period you’ve paid for ends, and you won’t be charged again.',
        ],
      },
      {
        title: '52. If a payment fails',
        paragraphs: [
          'If a payment doesn’t go through, we or the app store may try again for a short time. If it still fails, your access pauses until it’s paid or you cancel. We never charge interest or late fees.',
        ],
      },
      {
        title: '53. Free or discounted access',
        paragraphs: [
          'We may give some trainers free or discounted access, for example while Voltrix is being tested. This is our choice, and it doesn’t mean we recommend or have checked you.',
          'If we end your free access, you keep it for at least 30 days after we tell you, unless we suspend or close your account under section 26. Free access never turns into a paid subscription on its own: you would need to choose to subscribe.',
        ],
      },
      {
        title: '54. If your access ends',
        paragraphs: [
          'If your trial, subscription or free access ends, you can’t use Voltrix Coach until you subscribe again. Your account and records stay, so you can pick up where you left off, and we’ll send you a copy of your records free if you ask. Your clients keep the plans you gave them and can keep using the Voltrix app.',
          'If your account has had no access for 12 months, we may close it and delete its information. We’ll warn you in the app and by email at least 30 days before, so you can subscribe again or ask for a copy of what you need.',
        ],
      },
      {
        title: '55. When trainers must cover our costs',
        paragraphs: [
          'If a client or anyone else makes a legal claim against us because of something listed below, you must pay us back the damages and reasonable legal costs we have to pay because of it.',
          'You only have to pay an amount a court orders, or a settlement you agreed to, and never for any part of a loss that we caused. We’ll tell you promptly about any such claim and give you a fair chance to take part in how it’s handled.',
          'This applies to claims because of:',
        ],
        points: [
          'your services, advice, programs, plans, content, staff or business',
          'something unlawful you did, including breaking POPIA',
          'your breach of these Terms',
        ],
        important: true,
      },
      {
        title: 'Part C. For clients',
        paragraphs: [
          'This part applies when you use the Voltrix app, including if you’re a trainer using it to train with someone. Part A applies too.',
        ],
      },
      {
        title: '56. The Voltrix app is free',
        paragraphs: [
          'We don’t charge clients anything to use the Voltrix app. If we ever offer something you would pay for, we’ll show you the price first, and you’ll pay only if you choose it. We’ll never start charging you for something you already use without your clear agreement.',
        ],
      },
      {
        title: '57. Your trainer is independent',
        paragraphs: [
          'Trainers are independent businesses, not our staff. You choose your trainer, and your training agreement is directly with them.',
          'Unless a trainer’s profile shows a Verified badge, we haven’t checked their qualifications, registration, insurance or experience, and even a Verified badge covers only what section 5 says. Before you train with someone, ask to see their qualifications and insurance, and agree on their prices, cancellation rules and what they’ll do for you.',
          'Your trainer is responsible for their sessions, programs, plans and advice, so questions or complaints about those go to your trainer first.',
          'If a trainer has behaved unsafely, dishonestly or inappropriately, please tell us too, using the Report option or the contact details in section 1. We’ll look into it and may act on the trainer’s account under these Terms. Where the law allows, we’ll give you the trainer’s name, business name and contact details if you need them for a complaint or claim.',
        ],
        important: true,
      },
      {
        title: '58. Joining a trainer, and what they can see',
        paragraphs: [
          'When you accept a trainer’s invite, or a trainer accepts your request, you’re linked. While you’re linked, that trainer can see your food diary, workouts, progress (weight, measurements and photos), check-ins and habits, including what you logged before you joined them. They can also see your health form if you filled it in, your sessions with them and your chats. You can message and call each other.',
          'You can leave a trainer at any time, in Settings under My trainers. From then on, they can’t see what you log, your health form or your photos. They keep their own record of training you, as section 28 explains.',
          'Blocking someone hides their stories and reels from you, but doesn’t end your coaching. To stop coaching, leave the trainer.',
          'A trainer who has your email address can see whether you have a Voltrix account.',
        ],
      },
      {
        title: '59. Asking a trainer to train you',
        paragraphs: [
          'When you ask a trainer to train you, they see your name and photo, and the note and phone number you choose to send. They see your email address only if they accept. If you withdraw the request, or they say no, your note and number are removed.',
          'There are limits on how many requests you can send. Don’t send a request to a trainer who has said no or blocked you.',
        ],
      },
      {
        title: '60. Sessions, bookings and cancellations',
        paragraphs: [
          'Your trainer sets their own times, prices, booking rules and cancellation rules. The app shows the latest time you can cancel in the app. After that, message your trainer.',
          'Cancellation and no-show charges are between you and your trainer. By law they must be reasonable, and a trainer may not charge you if the session couldn’t go ahead because the person it was booked for died or was in hospital.',
          'Session reminders are set on your phone, and may not appear if your phone is off or silenced, or if the app was removed. Always confirm your sessions with your trainer.',
        ],
      },
      {
        title: '61. Paying your trainer',
        paragraphs: [
          'You pay your trainer directly, not through Voltrix. The app may show how many sessions are left on a pack, but prices and payments are your trainer’s own record, so keep your own receipts.',
          'If you pay for sessions or a pack in advance, the Consumer Protection Act may protect what you’ve paid. If you and your trainer can’t agree about a refund, you can contact the National Consumer Commission or the Consumer Goods and Services Ombud.',
        ],
      },
      {
        title: '62. Your health form and your health information',
        paragraphs: [
          'The health form is a short set of health questions in our own words. It helps your trainer plan your training safely. Filling it in is your choice, but your trainer may not be able to train you safely, or at all, without it.',
          'Because health information is specially protected by law, we ask your permission once, before you first add your health form, weight, measurements, progress photos, check-ins or food diary. You can take it back at any time in Settings, and we’ll then delete that information.',
          'If you fill in the health form, answer truthfully and completely. Update it at least once a year, and straight away if your health changes, and tell your trainer about any change before your next session.',
          'If you answer yes to any question, see a doctor before you start training hard or do more than you’re used to, and tell your trainer what the doctor said. Answering no to every question doesn’t mean you are medically cleared to exercise.',
          'Your trainer may record that your doctor said training is fine. That is your trainer’s note of what you told them. We never see or check a doctor’s note.',
          'If you add an emergency contact, make sure they agree to you sharing their name and number. We don’t contact them in an emergency.',
        ],
        important: true,
      },
      {
        title: '63. Food diary and nutrition',
        paragraphs: [
          'Food information in the app comes from Open Food Facts, or from what you and others type in. It can be wrong or out of date. Check the label, especially if you have allergies or follow a medical diet.',
          'Calorie and macronutrient numbers are estimates, and nutrition plans come from your trainer, not from us. Talk to a doctor or registered dietitian before you make big changes to what you eat, especially if you are pregnant or breastfeeding, have a medical condition, or have, or have had, an eating disorder.',
        ],
      },
      {
        title: '64. Progress photos and measurements',
        paragraphs: [
          'Your progress photos, weight and measurements are private. In the apps, only you and the trainers who coach you can see them, while they coach you. Don’t post them as stories or reels unless you want everyone on Voltrix to see them.',
          'We can’t stop someone taking a screenshot, so only share photos you’re comfortable with your trainer having.',
        ],
      },
      {
        title: '65. Videos and plans from your trainer',
        paragraphs: [
          'Workouts, plans and videos from your trainer are for your own training. You may save workout videos to your phone, but you may not share, sell or post them. Copies you’ve saved stay on your phone if you leave your trainer, and they’re still only for your own use.',
        ],
      },
      {
        title: '66. Finding a trainer near you',
        paragraphs: [
          'If you sort trainers by distance, your phone sends us your rough location, to about 1 kilometre, so we can work out how far away each trainer is. We use it only for that search and don’t keep it.',
          'Meeting a trainer you found in Voltrix is your choice. The first time, meet somewhere public, such as a gym, and tell someone where you’ll be.',
        ],
      },
    ],
  },
  {
    id: 'health',
    title: 'Health and Safety Notice',
    intro: [
      'Please read this before you train, follow a plan or change what you eat. It applies to everyone who uses Voltrix Coach or the Voltrix app, and it is part of our Terms of Service.',
      'The most important part comes first.',
    ],
    blocks: [
      {
        title: 'The short version',
        points: [
          'Exercise, and changes to what you eat, can cause injury and illness. In rare cases they can cause a heart attack, a stroke or death.',
          'Nothing Voltrix itself provides is medical advice, and we are not your doctor. Check with a doctor before you start, especially if your health form says so.',
          'Stop straight away and get help if you feel chest pain or pressure, faintness, dizziness or severe breathlessness.',
          'In an emergency, call 112 from a cellphone or 10177 for an ambulance. Voltrix is not an emergency service.',
          'Your trainer is responsible for your sessions and their advice. You can always say no to an exercise.',
        ],
        important: true,
      },
      {
        title: 'Voltrix is not a medical service',
        paragraphs: [
          'Voltrix is not a medical device. It doesn’t diagnose, treat, cure or prevent any medical condition. Always ask a doctor or other healthcare professional for medical advice, diagnosis or treatment, and don’t ignore or delay medical advice because of something you saw in Voltrix.',
          'Trainers aren’t doctors, physiotherapists, biokineticists or dietitians unless they are registered as one with the Health Professions Council of South Africa.',
        ],
      },
      {
        title: 'See a doctor first if any of these apply',
        paragraphs: ['Talk to a doctor before you start a new exercise program, or make your training harder, if:'],
        points: [
          'you answered yes to any question on your health form',
          'you have, or have had, heart disease, high blood pressure, chest pain, a stroke, fainting or dizzy spells',
          'you have diabetes, asthma or another lung condition, epilepsy, kidney disease or another long-term condition',
          'you take prescribed medicine for a long-term condition',
          'you have a bone, joint or muscle problem, or you’re recovering from an injury, illness or operation',
          'you are pregnant, or gave birth in the last 6 months',
          'you have, or have had, an eating disorder',
          'you haven’t been active for a long time, or you’re unsure whether exercise is safe for you',
        ],
      },
      {
        title: 'Wait until you feel well',
        paragraphs: [
          'If you have a fever, flu, a chest infection or a stomach bug, don’t train until you’ve recovered. If you’re not sure, ask your doctor.',
        ],
      },
      {
        title: 'Your health form is a guide, not a clearance',
        paragraphs: [
          'The health form in the Voltrix app helps you and your trainer spot when you should see a doctor. Its questions are in our own words, and it is not an official medical questionnaire.',
          'Answering no to every question doesn’t mean you are medically cleared to exercise. If your trainer records that your doctor said training is fine, that is your trainer’s note of what you told them. We don’t see or check it.',
          'Update your answers at least once a year, and straight away if your health changes. Tell your trainer about any change before your next session.',
        ],
      },
      {
        title: 'The risks of exercise',
        paragraphs: [
          'Every kind of exercise carries some risk, even when it’s well planned and well supervised. The risks include:',
        ],
        points: [
          'muscle strains, sprains, tears and joint injuries',
          'back and neck injuries',
          'broken bones from falls, slips or dropped weights',
          'overuse injuries from doing too much, too soon',
          'dizziness, fainting, dehydration and heat illness',
          'low blood sugar, especially if you have diabetes or haven’t eaten',
          'a condition you already have getting worse',
          'rarely, an abnormal heart rhythm, a heart attack, a stroke or death',
        ],
        important: true,
      },
      {
        title: 'How to lower the risk',
        points: [
          'Warm up, and build up slowly.',
          'Learn good technique before you add weight, and use equipment the way it is meant to be used.',
          'Don’t test your one-rep max without your trainer there to spot you.',
          'Drink enough water, and take extra care in hot weather.',
          'Rest when you need to, and sleep well.',
          'Tell your trainer about any pain, injury, illness, medicine or pregnancy, and anything that has changed since your last session.',
          'Never train under the influence of alcohol or drugs.',
          'You can say no to any exercise, at any time.',
        ],
      },
      {
        title: 'Stop straight away if you feel',
        paragraphs: ['Stop, and rest. If it doesn’t pass quickly, or if it’s chest pain, get medical help at once.'],
        points: [
          'pain or pressure in your chest, arm, neck or jaw',
          'severe breathlessness, or breathlessness that doesn’t settle when you rest',
          'dizziness, light-headedness, faintness or confusion',
          'a racing, pounding or irregular heartbeat',
          'sudden, sharp or unusual pain, or pain in a joint',
          'sudden weakness, numbness, blurred vision or difficulty speaking',
          'very unwell, cold and clammy, or sick',
        ],
      },
      {
        title: 'In an emergency',
        paragraphs: [
          'Call 112 from any cellphone, 10177 for an ambulance, or 10111 for the police. If you’re at a gym, tell a staff member.',
          'Voltrix is not an emergency service. Don’t rely on chat, calls or the emergency contact on your health form in an emergency: a message may not be seen in time, a call may not connect, and we don’t contact anyone for you.',
          'If you train alone, make sure someone knows where you are, and keep your phone within reach.',
        ],
      },
      {
        title: 'Training online or on your own',
        paragraphs: [
          'In an online session, or when you follow a plan on your own, your trainer can’t physically spot you, catch a weight or correct you straight away.',
          'Clear enough space, check that your equipment is safe and stable, wear suitable shoes, and don’t lift heavy weights alone without a safe way to put them down.',
          'A video call can freeze or drop. If it does, stop and wait until you can see and hear each other again.',
          'Only do what you can do safely. If you’re unsure about an exercise, skip it and ask your trainer.',
        ],
      },
      {
        title: 'Your trainer’s role, and yours',
        paragraphs: [
          'Your trainer is responsible for screening you, planning your training, supervising your sessions and telling you about the risks of what they ask you to do. Unless their profile shows a Verified badge, we haven’t checked anything about them, and we never check their advice.',
          'You’re responsible for telling your trainer the truth about your health, for following your doctor’s advice, and for deciding whether to do an exercise. You can say no at any time.',
        ],
      },
      {
        title: 'Workouts, templates, videos and numbers in the app',
        paragraphs: [
          'Workouts, programs, videos and plans in Voltrix are general unless your trainer made them for you. Voltrix templates are examples for trainers to adapt. They are not advice for you.',
          'Numbers in the app, such as your estimated one-rep max, personal bests, calorie and macronutrient totals, and default habit targets (like 2.5 litres of water, 8,000 steps and 8 hours of sleep), are calculations or general guides. They are not targets you must reach, and they are not medical advice.',
        ],
      },
      {
        title: 'Food, diets and supplements',
        paragraphs: [
          'Food information comes from Open Food Facts, or from what people type in. It can be wrong, so check labels, especially for allergies.',
          'Speak to a doctor or registered dietitian before you start a restrictive diet or try to lose weight quickly, and before you change what you eat if you are pregnant or breastfeeding, have diabetes, kidney disease or another medical condition, or have, or have had, an eating disorder.',
          'We don’t recommend any supplement, medicine or substance. Never use steroids, SARMs or other banned or unapproved substances, and talk to a doctor before you take any supplement.',
        ],
      },
      {
        title: 'The risks you accept',
        paragraphs: [
          'When you tick the health box, you confirm that you have read this Notice and understand the risks of exercise and of changing what you eat, including the rare risk of serious injury or death. You accept the risks that are a normal part of these activities: the risks that remain even when everyone takes reasonable care.',
          'You don’t accept harm caused by someone else’s carelessness. Your trainer remains responsible for their sessions and advice, and our Terms of Service explain what we are and aren’t responsible for. Nothing in this Notice takes away a right that South African law says can’t be taken away.',
        ],
        important: true,
      },
    ],
  },
  {
    id: 'community',
    title: 'Community Rules',
    intro: [
      'Voltrix is a place to train, share progress and cheer each other on. These rules keep it that way, for everyone.',
      'They apply everywhere in Voltrix: stories, reels, comments, likes, profiles, chats, calls, training requests and anything else you share. They are part of our Terms of Service.',
      'We have zero tolerance for objectionable content and abusive users. We remove content that breaks these rules, and people who break them seriously or repeatedly lose their account (see What happens when rules are broken).',
    ],
    blocks: [
      {
        title: 'The short version',
        points: [
          'You must be 18 or older. Nothing sexual involving anyone under 18, ever.',
          'No nudity or sexual content.',
          'No threats, violence, hate, bullying or harassment.',
          'Ask before you show, record or share anyone.',
          'Only post what you own or are allowed to use.',
          'No dangerous challenges, self-harm content, harmful diets or banned substances.',
          'Be honest about yourself and others. No scams or spam.',
          'Report anything that doesn’t belong, and block anyone you don’t want to see.',
        ],
      },
      {
        title: 'Adults only, and children always protected',
        paragraphs: [
          'You must be 18 or older to use Voltrix. If you think someone using Voltrix is under 18, tell us.',
          'Never post, send, ask for or share sexual content involving anyone under 18, whether real, drawn, edited or made by AI. We remove it, report it to the South African Police Service and the Film and Publication Board, and close the account permanently.',
          'Don’t post photos or videos of other people’s children.',
        ],
      },
      {
        title: 'No nudity or sexual content',
        paragraphs: [
          'No nudity, sexual content, sexual acts or sexually suggestive poses, and no links to them. Workout clothes are fine.',
          'Progress photos belong in your private progress area or your chat with your trainer, not in stories or reels.',
          'No sexual messages, requests or advances, in chat or anywhere else.',
        ],
      },
      {
        title: 'Never share intimate images without consent',
        paragraphs: [
          'Never share, or threaten to share, a private or intimate photo or video of anyone without their consent. This includes edited, fake and AI-made images. Agreeing to a photo being taken is not agreeing to it being shared. In South Africa this is a crime.',
        ],
      },
      {
        title: 'No threats, violence or gore',
        paragraphs: [
          'No threats against anyone or their property, no encouraging violence, and no graphic violence, gore or cruelty to animals.',
          'No content that supports war propaganda, terrorism or violent groups.',
        ],
      },
      {
        title: 'No hate',
        paragraphs: [
          'Don’t attack or demean people because of their race, ethnic or social origin, colour, nationality, migrant status, religion, sex, gender, pregnancy, sexual orientation, gender identity, disability, HIV status, albinism, age, body size or culture. No slurs, no hateful symbols, and no calls to exclude or harm people.',
        ],
      },
      {
        title: 'No bullying, harassment or stalking',
        points: [
          'No insults, body shaming, humiliating content or ganging up on someone.',
          'Don’t keep contacting someone who has said no, ignored you or blocked you, and don’t make new accounts to reach them.',
          'Never share anyone’s address, location, phone number or other personal details, and never use Voltrix to find out where someone lives or trains so you can turn up uninvited.',
          'Don’t send unwanted romantic or sexual messages. Trainers: keep your relationship with clients professional.',
        ],
      },
      {
        title: 'Be truthful about people',
        paragraphs: [
          'Don’t post or send false claims that could damage someone’s reputation, including trainers, clients, gyms and businesses. Honest opinions and fair reviews based on facts are fine.',
        ],
      },
      {
        title: 'Ask before you show, record or share anyone',
        points: [
          'Only show people in your posts if they agree. Trainers need a client’s permission in writing (a message in chat is fine) before posting their photos, videos, name or results.',
          'Take care with people in the background, such as other gym members. Crop or blur them if they haven’t agreed.',
          'Don’t record, screenshot or share calls, video sessions, chats, voice or photos from Voltrix without the other person’s permission, except to report a problem to us, the police or another authority, to apply for a protection order, or to get legal advice.',
          'Never share someone else’s health information, measurements or progress photos.',
        ],
      },
      {
        title: 'Only post what you own or may use',
        paragraphs: [
          'Post only photos, videos, music and other material that you made or have permission to use. We don’t have music licences, so posts with music you aren’t allowed to use may be muted or removed. Accounts that keep using other people’s work without permission will be closed.',
        ],
      },
      {
        title: 'No dangerous challenges or harmful health content',
        points: [
          'No challenges or stunts that could seriously hurt someone.',
          'No self-harm content. Don’t post anything that encourages or shows self-harm or suicide. If you’re struggling, talk to someone: in South Africa you can call the SADAG Suicide Crisis Helpline on 0800 567 567, free, 24 hours a day.',
          'No content that promotes extreme fasting, dehydration, purging or eating disorders, or that shames people for their bodies.',
          'No selling or promoting steroids, SARMs, prescription weight-loss medicine or any banned, unapproved or illegal substance.',
          'No false health claims or medical misinformation, such as promising a cure or guaranteed results.',
          'Show safe technique, and say who an exercise is not suitable for when that matters.',
        ],
      },
      {
        title: 'Be honest about yourself',
        points: [
          'Use your real name. Don’t pretend to be someone else, or a business you don’t represent.',
          'Trainers: only claim qualifications, registrations, experience and results you can back up, and only use titles like dietitian, physiotherapist or biokineticist if you’re registered with the Health Professions Council of South Africa.',
          'No fake before-and-after photos or misleading results.',
        ],
      },
      {
        title: 'No spam, scams or misuse',
        points: [
          'No spam, repeated posts, chain messages or fake engagement, such as bought likes, bots or fake accounts.',
          'No scams, pyramid schemes or fake offers. Never ask anyone for their password, card details or PIN.',
          'Trainers may share what they offer, honestly. Don’t send advertising to people who aren’t your clients and haven’t asked for it.',
          'No illegal goods or activities, including drugs, weapons and gambling.',
        ],
      },
      {
        title: 'Respect blocks and our decisions',
        paragraphs: [
          'Don’t try to get around a block, a removal or a suspension, for example by making a new account. If you think we got something wrong, ask us to look again instead.',
        ],
      },
      {
        title: 'How to report and block',
        points: [
          'Tap Report on any story, reel or comment, or wherever else you see Report, and choose a reason. Reports are private: the person isn’t told who reported them.',
          'Tap Block on a story, reel or comment to stop seeing that person’s stories, reels and comments. They aren’t told. Blocking doesn’t end coaching: to do that, leave your trainer in Settings.',
          'To report a chat message, a call, a profile or a trainer’s conduct where you don’t see Report, contact us using the details in our Terms of Service. We’ll keep your report confidential.',
          'If someone is in immediate danger, call 10111 or 112 first.',
        ],
      },
      {
        title: 'What happens when rules are broken',
        points: [
          'When several people report a post, it’s hidden automatically while we look at it.',
          'We aim to review reports within 24 hours, and we deal first with reports about children, intimate images and threats.',
          'We may remove the content and tell you why, send you a warning, or suspend your account for a time or until we lift it. We may also block the phones, email address and phone numbers the account used, so a new account can’t be made with them.',
          'Serious harm, such as sexual content involving anyone under 18, threats, selling banned substances or scams, can mean suspension straight away or permanent closure. People who keep breaking the rules lose their account.',
          'We’ll tell you what we did and why, unless the law or someone’s safety means we can’t.',
          'You can ask us to look again within 30 days. A person will review it and tell you the outcome, normally within 5 business days.',
          'We don’t check everything before it appears, and we may use automatic tools to find content that breaks these rules.',
        ],
      },
      {
        title: 'When we involve the authorities',
        paragraphs: [
          'We report sexual content involving children to the police and the Film and Publication Board. We may also report intimate images shared without consent, threats and other crimes, and keep evidence for the police.',
          'We follow court orders, including protection orders, and lawful requests from the authorities.',
          'If you believe content is unlawful, you can also send us a take-down notice (see our Terms of Service), or complain to the Film and Publication Board at fpb.org.za.',
        ],
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
  title: 'Before you start',
  lead: 'The key points of our terms, in plain words. Tap a document to read it in full.',
  keyPoints: [
    {
      title: 'Software, not medical advice',
      body: 'Nothing Voltrix itself provides is medical or dietary advice. Training and nutrition advice comes from the trainer.',
    },
    {
      title: 'Trainers run their own businesses',
      body: 'They’re responsible for their own sessions, advice and insurance. Unless you see a Verified badge, we haven’t checked them. Clients pay them directly.',
    },
    {
      title: 'You choose what you share',
      body: 'Stories and reels are seen by everyone on Voltrix. What a client logs is seen only by their trainers, while they train together.',
    },
  ],
  important: [
    'Exercise and diet changes can cause injury, illness and, rarely, a heart attack, stroke or death. Stop and get help if you feel chest pain, faintness or severe breathlessness.',
    'Even if we were careless, we aren’t responsible for a trainer’s sessions or advice, what other users post or do, exercise you choose to do, or wrong food data from others.',
    'For other loss we cause, even by carelessness, we don’t pay lost profits or income, and we pay at most R1,000 or what you paid us in the past 12 months, if that is more.',
    'These limits never cover death or injury we cause, gross negligence (extreme carelessness), fraud, or rights the law says can’t be taken away.',
    'If something you post, or something unlawful you do, leads to a claim against us, you pay back the part of the loss you caused.',
    'Trainers: you run your own business, and you’re responsible for your clients’ safety, their information under POPIA and your insurance. You cover claims about your services in the same way.',
  ],
  checks: [
    { id: 'age', label: 'I’m 18 or older, and I’ll be truthful about myself and my health.' },
    { id: 'terms', label: 'I agree to the Terms of Service and the Community Rules, including the box above.' },
    {
      id: 'health',
      label:
        'I’ve read the Health and Safety Notice. I understand exercise and diet changes can cause injury, illness and, rarely, death, and I accept their normal risks.',
    },
  ],
  button: 'Agree and continue',
  declineNote: 'You need to agree to use {app}. You’re free to leave at any time.',
};

export const SUBSCRIPTION_SUMMARY: string[] = [
  'Your 14-day trial is free. Cancel before it ends and you pay nothing.',
  'After the trial, you pay the monthly price shown, renewing every month until you cancel.',
  'No minimum term and no cancellation fee. Cancel any time in your Google Play or App Store subscriptions, or by asking us.',
  'Changed your mind? Ask within 7 days of a subscription’s first payment and we’ll refund it in full.',
  'The price shown is the full price. We never take money from your clients or charge commission.',
  'We’ll tell you at least 30 days before any price change, and we’ll only charge the new price if you agree to it.',
  'By starting your trial, you agree to the subscription terms in Part B of our Terms of Service.',
];

// Who runs Voltrix. Empty until Ryan gives the details: the apps read well with every field null, and show
// each one once it is filled in. A release build must not ship with name, address or email null.
export const BUSINESS: {
  name: string | null;
  registration: string | null;
  address: string | null;
  email: string | null;
  informationOfficer: string | null;
} = { name: null, registration: null, address: null, email: null, informationOfficer: null };
