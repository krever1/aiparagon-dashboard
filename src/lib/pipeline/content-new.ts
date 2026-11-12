// Content Transformation's New draft form (nwCtFormHtml, nwCtSide and nwCtSend in the current dashboard, with v105's
// kinds of post, v111's categories, v113's formats, questions and notes, and v126's feedback): what can be made, what
// each kind asks, the shapes it can follow, what the side pane says it will use, and the content_requests row a send
// writes, as Engine 3 · Content from Source reads it. Pure: the form, the server and the tests use it.

import { type SnapItem, clip, tidy } from '@/lib/touchpoint/approvals'
import { SEC_TEXT, layoutOf } from './briefs'
import { plural } from './content'
import { type Step, planFrom, planKey, planSections } from './content-plan'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
type Row = Record<string, unknown>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const join = (a: unknown[]) => a.map(str).filter(Boolean).join(' ')
const uniq = (a: string[]) => a.filter((x, i) => a.indexOf(x) === i)
/** A persona's pain, a line's end: spaces folded, a trailing stop taken off (v104Tidy). */
const tidyEnd = (t: unknown) => str(t).replace(/\s+/g, ' ').trim().replace(/[\s.;,]+$/, '')
export const wordCount = (t: string) => {
  const s = str(t).trim()
  return s ? s.split(/\s+/).length : 0
}
export const num = (n: number) => Number(n || 0).toLocaleString('en-US')

// ---------- what can be made ----------

export type KindKey =
  | 'thought_leadership'
  | 'newsletter'
  | 'email'
  | 'adcopy'
  | 'report'
  | 'white_paper'
  | 'news_article'
  | 'how_to'
  | 'event_kit'
  | 'deck'
  | 'webinar_deck'
  | 'video'
  | 'clips'
  | 'other'
/** The four formats content_requests takes; a newer kind is filed under one of them and named by its content type. */
export type Base = 'ad' | 'thought_leadership' | 'newsletter' | 'email'
export type KindDef = { t: string; s: string; icon: string; gets: readonly string[]; btn: string; noun: string; base: Base }

/** The tiles (NW_CK with V113_CT_NEW): the title, its line, the icon, what comes back, the button and the base format. */
export const KINDS: Readonly<Record<KindKey, KindDef>> = {
  thought_leadership: { t: 'LinkedIn post', s: 'Thought leadership', icon: 'pen', gets: ['1 post', '3 opening lines to pick from'], btn: 'Generate post', noun: 'post', base: 'thought_leadership' },
  newsletter: { t: 'Newsletter', s: 'Full issue or one section', icon: 'news', gets: ['1 issue with short sections', '3 subject lines'], btn: 'Generate issue', noun: 'issue', base: 'newsletter' },
  email: { t: 'Email', s: 'Follow-up or nurture', icon: 'mail', gets: ['1 email with one call to action', '3 subject lines'], btn: 'Generate email', noun: 'email', base: 'email' },
  adcopy: { t: 'Paid ad', s: 'Ad copy from your material', icon: 'megaphone', gets: ['1 ad body', '3 hooks to test', 'A call to action and a headline'], btn: 'Generate ad copy', noun: 'ad', base: 'ad' },
  report: { t: 'Report', s: 'Findings and what to do', icon: 'chart', gets: ['1 report with an executive summary', '3 title options'], btn: 'Generate report', noun: 'report', base: 'newsletter' },
  white_paper: { t: 'White paper', s: 'A point of view, in depth', icon: 'book', gets: ['1 white paper with sections', '3 title options'], btn: 'Generate white paper', noun: 'white paper', base: 'newsletter' },
  news_article: { t: 'Article or news story', s: 'News or an explainer', icon: 'file', gets: ['1 article', '3 headline options'], btn: 'Generate article', noun: 'article', base: 'newsletter' },
  how_to: { t: 'How-to guide', s: 'Steps anyone can follow', icon: 'checkCircle', gets: ['1 guide with numbered steps', '3 title options'], btn: 'Generate guide', noun: 'guide', base: 'newsletter' },
  event_kit: { t: 'Event materials', s: 'Invite, page and reminders', icon: 'clock', gets: ['Invite post, event page, emails and run of show', '3 title options'], btn: 'Generate event materials', noun: 'event kit', base: 'thought_leadership' },
  deck: { t: 'Presentation deck', s: 'Slide by slide', icon: 'layers', gets: ['Slide-by-slide cards with speaker notes', '3 title options'], btn: 'Generate deck', noun: 'deck', base: 'thought_leadership' },
  webinar_deck: { t: 'Webinar deck', s: 'Slides and the run of show', icon: 'users', gets: ['Slide-by-slide cards for the webinar', '3 title options'], btn: 'Generate webinar deck', noun: 'webinar deck', base: 'thought_leadership' },
  video: { t: 'Video script', s: 'Scene by scene', icon: 'play', gets: ['A scene-by-scene script', '3 opening lines'], btn: 'Generate script', noun: 'script', base: 'thought_leadership' },
  clips: { t: 'Short clips', s: 'Cut from a long video', icon: 'repeat', gets: ['A plan for each clip: where to cut, the hook and the caption', '3 opening lines'], btn: 'Generate clip plan', noun: 'clip plan', base: 'thought_leadership' },
  other: { t: 'Something else', s: 'One-pager, case study, page', icon: 'plus', gets: ['1 draft in the shape you describe', '3 title options'], btn: 'Generate draft', noun: 'draft', base: 'thought_leadership' },
}
export const GROUPS: readonly (readonly [string, readonly KindKey[]])[] = [
  ['Posts and emails', ['thought_leadership', 'newsletter', 'email', 'adcopy']],
  ['Long reads', ['report', 'white_paper', 'news_article', 'how_to']],
  ['Events and decks', ['event_kit', 'deck', 'webinar_deck']],
  ['Video', ['video', 'clips']],
  ['Something else', ['other']],
]
export const isKind = (k: unknown): k is KindKey => typeof k === 'string' && Object.prototype.hasOwnProperty.call(KINDS, k)
/** A kind asked for from elsewhere: a format of the strategy read ('ad' is Paid ad), else a tile's own key. */
export const kindFrom = (k: unknown): KindKey | null => (k === 'ad' ? 'adcopy' : isKind(k) ? k : null)

// ---------- kinds of post: the shape and rules each is written to (V105_CT, V105_CT_D, V105_CT_TPL, v111, v113) ----------

type Sec = readonly [string, string]
type CtDef = { name: string; base: Base; d: string; out: string; sections: readonly Sec[]; rules: string }
const ct = (name: string, base: Base, d: string, out: string, sections: readonly Sec[], rules: string): CtDef => ({ name, base, d, out, sections, rules })
const v113 = (k: KindKey, d: string, sections: readonly Sec[], rules: string) => ct(KINDS[k].t, KINDS[k].base, d, KINDS[k].t + ' · ' + KINDS[k].gets[1], sections, rules)
export const CT: Readonly<Record<string, CtDef>> = {
  thought_leadership: ct(
    'Thought leadership',
    'thought_leadership',
    'A LinkedIn post with your point of view, and three openings to pick from.',
    'Thought leadership post · three openings',
    [
      ['The common belief', 'What most of the market assumes.'],
      ['What we see', 'Our point of view, from the material.'],
      ['Why it matters', 'An example or fact from the material, and what to do with it.'],
    ],
    'Write it as a point of view: one clear opinion, backed by the material.',
  ),
  educational: ct(
    'Educational',
    'thought_leadership',
    'A LinkedIn post that teaches one practical thing, step by step.',
    'Educational post · three openings',
    [
      ['Why it matters', 'One or two lines on the stakes.'],
      ['The steps', 'Three to five practical steps, in order.'],
      ['Where to start', 'The first step to take this week.'],
    ],
    'Teach one practical thing, in plain steps the reader can follow without us.',
  ),
  industry_news: ct(
    'Industry news',
    'thought_leadership',
    'A LinkedIn post on a news item or a piece of research, and what it means for your buyers.',
    'Industry news post · three openings',
    [
      ['The news', 'What happened, in one or two lines, and where it was reported.'],
      ['What it means', 'What it means for our buyers.'],
      ['What to do', 'One practical response.'],
    ],
    'Name the source of the news. Do not invent figures. Add our view of what it means.',
  ),
  social_proof: ct(
    'Social proof',
    'thought_leadership',
    'A LinkedIn post built on a client result or your method, within your approved proof.',
    'Social proof post · three openings',
    [
      ['The situation', 'Where the client started.'],
      ['What changed', 'What we did, and the method.'],
      ['The result', 'Only results in the approved proof, within its limits.'],
    ],
    'Use only approved proof, worded within its limits. Without approved proof, describe the method, never a result.',
  ),
  newsletter: ct(
    'Newsletter',
    'newsletter',
    'One issue with short sections and three subject lines.',
    'Newsletter · three subject lines',
    [
      ['The opening', 'Why this issue matters now, in two or three lines.'],
      ['Two to four short sections', 'Each with a sub-heading and one clear point from the material.'],
      ['The close', 'What to do next, and the call to action.'],
    ],
    'Keep the issue to one main idea that every section serves.',
  ),
  article: ct(
    'Article',
    'newsletter',
    'A stand-alone article with short sections and three title options.',
    'Article · three titles',
    [
      ['The hook', 'Open on the problem or the question the reader has.'],
      ['Two to four sections', 'Short sub-headed sections that build the argument from the material.'],
      ['The close', 'What to do next, and the call to action.'],
    ],
    'Write a stand-alone article, not a newsletter issue: 600 to 900 words with short sub-headings. This length replaces the newsletter length. Give three title options as the hooks.',
  ),
  event: ct(
    'Event',
    'thought_leadership',
    'A post that invites people to an event or webinar: what it is, why go, when and how.',
    'Event post · three openings',
    [
      ['What it is', 'The event, the topic and who it is for.'],
      ['Why go', 'Two or three things they will take away.'],
      ['When and how', 'Date, time, place or link, and how to register.'],
    ],
    'Use only event details given in the material or the request. If the date, time or link is missing, write [ADD DATE], [ADD TIME] or [ADD LINK] for the team to fill in.',
  ),
  email: ct(
    'Email',
    'email',
    'One short email with one call to action and three subject lines.',
    'Email · three subject lines',
    [
      ['The opening', 'One or two lines on why you are writing.'],
      ['The point', 'One idea from the material, and why it matters to them.'],
      ['The ask', 'One call to action, said once.'],
    ],
    'Write it as a note from one person to another, not a campaign.',
  ),
  video_script: ct(
    'Video or podcast script',
    'thought_leadership',
    'A short script for a video or a podcast segment: a hook, three points and a close.',
    'Video or podcast script · three openings',
    [
      ['The hook', 'The first ten seconds: the question or claim that makes someone keep watching.'],
      ['Three points', 'Three short spoken points from the material, each with one example.'],
      ['The close', 'What to do next, said once.'],
    ],
    'Write it to be spoken: short sentences and plain words, about 90 seconds long. Mark [B-ROLL] where a visual would help. No headings read aloud.',
  ),
  report: v113(
    'report',
    'A report the reader can act on: an executive summary, the findings, what they mean and what to do.',
    [
      ['Executive summary', 'Three to five lines: what was found and what to do about it.'],
      ['What we found', 'The findings from the material, each with its evidence.'],
      ['What it means', 'What the findings mean for the reader, in plain words.'],
      ['What to do next', 'Three to five recommendations, in order.'],
      ['Sources', 'Where the findings come from.'],
    ],
    'Write a report with short sub-headed sections. Use only figures from the material and mark anything that needs checking [CHECK].',
  ),
  white_paper: v113(
    'white_paper',
    'A white paper: a point of view, argued in depth from the material, with sub-headings.',
    [
      ['Executive summary', 'The argument in four or five lines.'],
      ['The problem', 'What is not working today and why it matters now.'],
      ['Our view', 'The point of view, argued from the material.'],
      ['The evidence', 'Examples, data and cases from the material.'],
      ['How to act on it', 'A practical path, step by step.'],
      ['Conclusion', 'The takeaway and the next step.'],
    ],
    'Write it authoritative and specific, argued from the material. No hype. Use only figures from the material and write [ADD DATA] where a figure is missing.',
  ),
  news_article: v113(
    'news_article',
    'An article or news story: the facts first, then what they mean.',
    [
      ['Headline and standfirst', 'The news in one line, then why it matters in two.'],
      ['What happened', 'The facts, and where they were reported.'],
      ['Why it matters', 'What it means for the reader.'],
      ['What to do', 'One or two practical responses.'],
    ],
    'Write it like a trade publication piece: facts first and sourced, then our view, clearly marked as our view.',
  ),
  how_to: v113(
    'how_to',
    'A how-to guide with numbered steps someone can follow without us.',
    [
      ['Who it is for', 'Two lines on who it helps and what they will get.'],
      ['Before you start', 'What they need first.'],
      ['The steps', 'Numbered steps, one action each, with a short why.'],
      ['Mistakes to avoid', 'Two or three.'],
      ['Next step', 'Where to go from here.'],
    ],
    'Number the steps as "Step 1:", "Step 2:" and so on, each on its own line.',
  ),
  event_kit: v113(
    'event_kit',
    'Event materials: the invite post, the event page, the emails and the run of show.',
    [
      ['The invite post', 'A social post: what, why go, when.'],
      ['The event page', 'Headline, what they will learn in three bullets, who it is for, when and how to register.'],
      ['Invite email', 'Subject and body.'],
      ['Reminder emails', 'One day before and one hour before: subject and body.'],
      ['Follow-up email', 'After the event, with the replay and the next step.'],
      ['Run of show', 'The agenda with times.'],
    ],
    'Start each piece on its own line as "Card: <name>". Use only event details given and write [ADD DATE], [ADD TIME] or [ADD LINK] where one is missing.',
  ),
  deck: v113(
    'deck',
    'A presentation deck, written slide by slide with speaker notes.',
    [
      ['Title slide', 'The title and a one-line promise.'],
      ['The slides', 'One idea per slide, in order: a short headline, three bullets at most and speaker notes.'],
      ['The close', 'What to do next.'],
    ],
    'Start each slide on its own line as "Slide N: <headline>", then up to three bullets, then "Notes:" with what to say. Keep each slide under 25 words.',
  ),
  webinar_deck: v113(
    'webinar_deck',
    'A webinar deck: the slides, the moments to interact and the run of show.',
    [
      ['Opening', 'Welcome, the promise and who is presenting.'],
      ['Teaching slides', 'The main points, one per slide, with notes.'],
      ['Interaction', 'Poll questions and a Q&A slide where asked for.'],
      ['The offer', 'The next step, said once.'],
      ['Run of show', 'Times for each part.'],
    ],
    'Start each slide on its own line as "Slide N: <headline>", up to three bullets, then "Notes:". Put the run of show last as "Card: Run of show".',
  ),
  video: v113(
    'video',
    'A video script, scene by scene, written to be spoken.',
    [
      ['The hook', 'The first five seconds, on screen and out loud.'],
      ['Scenes', 'Each scene: what is said and what is on screen.'],
      ['The close', 'The call to action.'],
    ],
    'Start each scene on its own line as "Scene N: <what happens>", then the spoken lines, then [ON SCREEN: ...] and [SHOT: ...] where they help. Short spoken sentences.',
  ),
  clips: v113(
    'clips',
    'A plan for short clips cut from a long video or talk.',
    [['The clips', 'For each clip: where to cut from the material, the hook line, the caption and the post copy.']],
    'Start each clip on its own line as "Clip N: <hook>", then "From:" with the quote or timestamp to cut from, then "Caption:" with the on-screen text, then "Post copy:". Use only what is in the material.',
  ),
  other: v113('other', 'The piece the team describes, in a shape that suits it.', [], 'Write the piece described in the answers below, in a shape that suits it.'),
}

// ---------- categories (V111_CATS as v113 left them) ----------

/** A category: its key, its name, and the kind of post it is written as (only LinkedIn post and Newsletter change it). */
export type Cat = readonly [string, string, string]
const C: Readonly<Record<string, string>> = {
  opinion: 'Opinion and frameworks',
  educational: 'Educational and how-to',
  case_studies: 'Case studies and results',
  research: 'Reports and white papers',
  news: 'News and announcements',
  events: 'Events and webinars',
  audio_video: 'Podcasts and video',
}
const cats = (k: KindKey, keys: string[]): Cat[] => keys.map((c) => [c, C[c], k] as const)
export const CATS: Readonly<Record<KindKey, readonly Cat[]>> = {
  thought_leadership: [
    ['opinion', C.opinion, 'thought_leadership'],
    ['educational', C.educational, 'educational'],
    ['case_studies', C.case_studies, 'social_proof'],
    ['research', C.research, 'industry_news'],
    ['news', C.news, 'industry_news'],
    ['events', C.events, 'event'],
    ['audio_video', C.audio_video, 'video_script'],
  ],
  newsletter: [...['news', 'research', 'opinion', 'educational', 'case_studies', 'events'].map((c) => [c, C[c], 'newsletter'] as const), ['articles', 'Stand-alone article', 'article']],
  email: [],
  adcopy: [
    ['ad_image', 'Image ad', ''],
    ['ad_text', 'Text ad', ''],
    ['ad_carousel', 'Carousel ad', ''],
    ['ad_video', 'Video ad script', ''],
  ],
  report: cats('report', ['research', 'news', 'case_studies', 'opinion']),
  white_paper: cats('white_paper', ['research', 'opinion', 'case_studies', 'news']),
  news_article: cats('news_article', ['news', 'research', 'opinion', 'events']),
  how_to: cats('how_to', ['educational', 'opinion', 'case_studies']),
  event_kit: cats('event_kit', ['events', 'educational', 'opinion']),
  deck: cats('deck', ['opinion', 'research', 'case_studies', 'educational']),
  webinar_deck: cats('webinar_deck', ['educational', 'events', 'opinion', 'research']),
  video: cats('video', ['audio_video', 'opinion', 'educational']),
  clips: cats('clips', ['audio_video', 'events', 'opinion']),
  other: cats('other', ['opinion', 'educational', 'research', 'news', 'case_studies', 'events', 'audio_video']),
}
/** The category in force for a kind: the one picked when it is one of its own, else its first ('' for Email). */
export function catOf(k: KindKey, picked: string | undefined): string {
  const L = CATS[k]
  if (!L.length) return ''
  return L.some((c) => c[0] === picked) ? (picked as string) : L[0][0]
}
export const catLabel = (k: KindKey, c: string) => CATS[k].find((x) => x[0] === c)?.[1] ?? ''
/** The kind of post a request is written as: the category's for LinkedIn post and Newsletter, 'ad' for Paid ad. */
export function typeOf(k: KindKey, cat: string): string {
  if (k === 'adcopy') return 'ad'
  if (k === 'thought_leadership' || k === 'newsletter') return CATS[k].find((x) => x[0] === cat)?.[2] || k
  return k
}

/** The ad types the copy writer has no structure for get their own shape (V111_ADT). */
export const AD_TYPES: Readonly<Record<string, { name: string; d: string; sections: readonly Sec[]; rules: string }>> = {
  ad_carousel: {
    name: 'Carousel ad',
    d: 'A carousel: one idea across five to seven slides, then the call to action.',
    sections: [
      ['Slide 1: the hook', 'One line that stops the scroll, from the hooks to test.'],
      ['Slides 2 to 5: the points', 'One short point per slide, from the material, in order.'],
      ['Last slide: the ask', 'The call to action and the offer, said once.'],
    ],
    rules: 'Write it slide by slide: under 20 words a slide. Give the caption that goes with the carousel as the body.',
  },
  ad_video: {
    name: 'Video ad script',
    d: 'A 30 to 45 second video ad: hook, problem, proof, ask.',
    sections: [
      ['The first three seconds', 'The hook, said on screen and out loud.'],
      ['The problem', 'What the buyer is stuck on, in their words.'],
      ['The proof', 'One fact or example from the material.'],
      ['The ask', 'The call to action, said once.'],
    ],
    rules: 'Write it to be spoken, 30 to 45 seconds. Put on-screen text in [TEXT: ...] and visuals in [SHOT: ...].',
  },
}
/** The line under Paid ad's categories: the ad type's shape, else what any ad copy is. */
export const adTypeLine = (cat: string) => AD_TYPES[cat]?.d ?? 'Ad copy from your material: a body, three hooks and a call to action.'
const PAID_AD_D = 'One ad body from your material, three hooks to test, a call to action and a headline.'

/** What comes back (the side's You’ll get): a stand-alone article in place of an issue. */
export const getsOf = (k: KindKey, t: string) => (k === 'newsletter' && t === 'article' ? ['1 article with short sections', '3 title options'] : KINDS[k].gets)

// ---------- the questions each kind asks (V113_CTQ, V113_CTQ_ALL) ----------

export type Answer = string | boolean | string[]
export type Q = { id: string; label: string; kind: 'seg' | 'multi' | 'yes' | 'text'; opts?: readonly string[]; ph?: string; def?: Answer }
const seg = (id: string, label: string, opts: readonly string[], def?: string): Q => ({ id, label, kind: 'seg', opts, def })
const yes = (id: string, label: string, def: boolean): Q => ({ id, label, kind: 'yes', def })
const text = (id: string, label: string, ph: string): Q => ({ id, label, kind: 'text', ph })
const multi = (id: string, label: string, opts: readonly string[], def: string[]): Q => ({ id, label, kind: 'multi', opts, def })
const PAGES = ['Short (2 to 3 pages)', 'Medium (5 to 8 pages)', 'Long (10 or more)']
const CHARTS = 'Suggest charts (only from figures in the material)'
export const QS: Readonly<Record<KindKey, readonly Q[]>> = {
  thought_leadership: [seg('goal', 'What is it for?', ['Share a point of view', 'Start a conversation', 'Point to an offer', 'Announce something']), seg('length', 'Length', ['Short', 'Medium', 'Long'], 'Medium')],
  newsletter: [
    seg('length', 'Length', ['Short and simple', 'Detailed'], 'Short and simple'),
    yes('summary', 'A short summary at the top', true),
    yes('visuals', 'Suggest visuals', false),
    yes('charts', CHARTS, false),
    seg('action', 'What should readers do?', ['Read more', 'Reply', 'Book a call', 'Register', 'Download']),
  ],
  email: [
    seg('goal', 'What is it for?', ['Follow up', 'Nurture', 'Invite', 'Announce']),
    text('recipient', 'Who gets it?', 'e.g. advisers who downloaded the scorecard'),
    seg('next', 'The next step', ['Reply', 'Book a call', 'Read', 'Register']),
  ],
  adcopy: [seg('goal', 'What is it for?', ['Book calls', 'Get leads', 'Sell a small offer', 'Registrations']), seg('length', 'Length', ['Short', 'Medium'], 'Short')],
  report: [
    seg('length', 'Length', PAGES, 'Medium (5 to 8 pages)'),
    yes('summary', 'Executive summary at the top', true),
    yes('charts', CHARTS, true),
    seg('goal', 'What is it for?', ['Inform', 'Persuade', 'Recommend']),
  ],
  white_paper: [
    seg('length', 'Length', PAGES, 'Medium (5 to 8 pages)'),
    yes('summary', 'Executive summary at the top', true),
    yes('charts', CHARTS, false),
    seg('goal', 'What is it for?', ['Argue a point of view', 'Educate', 'Support a sale']),
  ],
  news_article: [seg('angle', 'Angle', ['News', 'Explainer', 'Opinion'], 'News'), seg('length', 'Length', ['Short', 'Medium', 'Long'], 'Medium')],
  how_to: [
    seg('steps', 'How many steps', ['3 to 5', '6 to 8', '10 or more'], '3 to 5'),
    seg('level', 'Reader level', ['New to it', 'Some experience', 'Expert'], 'New to it'),
    seg('shape', 'Shape', ['Step by step', 'Checklist'], 'Step by step'),
  ],
  // the event kit's What to make went to its plan's parts (v121)
  event_kit: [
    seg('event', 'The event', ['Webinar', 'Workshop', 'Conference talk', 'Roundtable or dinner'], 'Webinar'),
    text('details', 'Date, time and link', 'e.g. Thursday 6 November, 12pm Pacific, Zoom link to follow'),
  ],
  deck: [
    seg('slides', 'Slides', ['8', '12', '20'], '12'),
    yes('notes', 'Speaker notes', true),
    seg('setting', 'Where it is shown', ['Sales meeting', 'Conference talk', 'Leadership or board', 'Training'], 'Sales meeting'),
  ],
  webinar_deck: [
    seg('mins', 'Length', ['30 min', '45 min', '60 min'], '45 min'),
    multi('include', 'Include', ['Poll questions', 'Q&A slide', 'Offer at the end'], ['Q&A slide', 'Offer at the end']),
    yes('notes', 'Speaker notes', true),
  ],
  video: [
    seg('length', 'Length', ['Under a minute', '1 to 2 min', '3 to 5 min', '8 to 10 min'], '1 to 2 min'),
    seg('style', 'Style', ['Talking to camera', 'Voiceover with b-roll', 'Screen share', 'Interview'], 'Talking to camera'),
    yes('captions', 'Captions', true),
  ],
  clips: [
    seg('cliplen', 'Clip length', ['15 sec', '30 sec', '60 sec', '90 sec'], '30 sec'),
    seg('count', 'How many clips', ['3', '5', '8'], '5'),
    seg('captions', 'Captions', ['Burned in', 'Separate file', 'None'], 'Burned in'),
    seg('goal', 'What are they for?', ['Reach new people', 'Drive to the full video', 'Book calls'], 'Reach new people'),
    text('sections', 'Parts to use first', 'timestamps, or what to look for'),
  ],
  other: [text('what', 'What is it?', 'e.g. a one-pager, a case study or a sales page'), seg('length', 'Length', ['Short', 'Medium', 'Long'], 'Medium')],
}
export const TOPICS: Q = text('topics', 'Topics or messages to stress', 'e.g. governance before tools; the October deadline')
export const questionsOf = (k: KindKey): readonly Q[] => [...QS[k], TOPICS]
export const ANSWER_MAX = 300

/** A kind's answers: what was picked or typed, else each question's default (v113CtA). */
export function answersOf(k: KindKey, saved: Record<string, Answer> | undefined): Record<string, Answer> {
  const A: Record<string, Answer> = { ...(saved ?? {}) }
  for (const q of questionsOf(k)) if (!(q.id in A) && q.def !== undefined) A[q.id] = Array.isArray(q.def) ? q.def.slice() : q.def
  return A
}
/** An answer as the request keeps it, checked against its question: a typed one trimmed and cut, an unknown choice dropped. */
function answerOf(q: Q, v: Answer | undefined): Answer | undefined {
  if (v === undefined || v === null) return undefined
  if (q.kind === 'yes') return typeof v === 'boolean' ? v : undefined
  if (q.kind === 'multi') return Array.isArray(v) ? v.filter((x) => q.opts?.includes(x)) : undefined
  if (q.kind === 'seg') return typeof v === 'string' && q.opts?.includes(v) ? v : undefined
  return typeof v === 'string' ? v.trim().slice(0, ANSWER_MAX) : undefined
}
/** The answers by their label, leaving out what is empty, so a switched-off yes goes as false (setup.questions). */
export function answersMap(k: KindKey, saved: Record<string, Answer> | undefined): Record<string, Answer> {
  const A = answersOf(k, saved)
  const out: Record<string, Answer> = {}
  for (const q of questionsOf(k)) {
    const v = answerOf(q, A[q.id])
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue
    out[q.label] = v
  }
  return out
}
/** The answers as one line the writer reads (v113Answers): a yes by its label, a list after its label. */
export function answersLine(k: KindKey, saved: Record<string, Answer> | undefined): string {
  const A = answersOf(k, saved)
  return questionsOf(k)
    .map((q) => {
      const v = answerOf(q, A[q.id])
      if (q.kind === 'yes') return v ? q.label : ''
      if (q.kind === 'multi') return Array.isArray(v) && v.length ? q.label + ': ' + v.join(', ') : ''
      return v ? q.label + ': ' + str(v) : ''
    })
    .filter(Boolean)
    .join('. ')
}

// ---------- the material ----------

export type Src = 'upload' | 'paste' | 'fathom' | 'idea'
/** The four ways in (NW_CT_SRC): the tab, its name, its icon and its tooltip. */
export const SRCS: readonly (readonly [Src, string, string, string])[] = [
  ['upload', 'Upload', 'upload', 'A file: an article, a transcript or a chapter, or a video or audio file'],
  ['paste', 'Paste', 'copy', 'Paste the text, or read it from a link'],
  ['fathom', 'Fathom call', 'msg', 'A recorded call: its transcript becomes your material'],
  ['idea', 'New idea', 'bulb', 'Start from a point you want to make, with no material yet'],
]
export const isSrc = (s: unknown): s is Src => s === 'upload' || s === 'paste' || s === 'fathom' || s === 'idea'
/** "What is this material?" (V113_SRCTY), sent as source_type. */
export const SRC_TYPES: readonly (readonly [string, string])[] = [
  ['article', 'Article or blog post'],
  ['report', 'Document or report'],
  ['presentation', 'Presentation'],
  ['video', 'Video'],
  ['podcast', 'Podcast or audio'],
  ['transcript', 'Talk or webinar transcript'],
  ['interview', 'Interview'],
  ['call', 'Call or meeting'],
  ['book_chapter', 'Book chapter'],
  ['other', 'Other marketing or educational content'],
]
export const srcTypeName = (v: string) => SRC_TYPES.find((x) => x[0] === v)?.[1] ?? SRC_TYPES[0][1]
/** Material from a file, a link, a call or pasted is kept to 120,000 characters (Content from Source reads the first 60,000). */
export const TEXT_MAX = 120_000
export const IDEA_MIN = 60
export const TEXT_MIN = 300
/** The sizes the request keeps, as far as Content from Source reads them. */
export const MAX = { thesis: 6000, proof: 1500, take: 600, title: 200, url: 2000, notes: 1500, must: 200, musts: 12 } as const

/** Try it with a sample article (V97_SAMPLE). */
export const SAMPLE = {
  type: 'article',
  title: 'Why AI pilots stall after week three',
  take: 'Pilots stall when nobody owns the workflow after launch.',
  text:
    'Most AI pilots do not fail in the demo. They fail in week three, when the excitement fades and the pilot meets the real workflow.\n\n' +
    'In the first two weeks, someone is watching every output. Questions get answered quickly, edge cases get fixed by hand, and the results look great. ' +
    'Then the pilot team goes back to their day jobs. Nobody owns the workflow the tool now sits inside. Exceptions pile up, people quietly route around it, ' +
    'and by the end of the month fewer people are using it.\n\n' +
    'The firms that get past week three do three things before launch. They name one person who owns the workflow, not just the tool. ' +
    'They write down what happens when the AI is unsure, so exceptions have a home. And they decide up front which number will tell them it is working.\n\n' +
    'None of this is technical. It is operating discipline, and it is the difference between a pilot and a process.',
} as const
export const isSample = (t: string) => str(t).trim() === SAMPLE.text

// ---------- the company profile: who it is for, what is offered, the proof, the voice, the templates ----------

export type Persona = { id: string; name: string; role: string; firm: string; size: string; pain: string; isDefault: boolean }
export type Offer = { id: string; name: string; price: number | null; priceLabel: string; timeline: string; action: string; whats: string; isDefault: boolean }
export type ProofItem = { name: string; status: string; source: string; expires: string }
export type Voice = { createdAt: string; tone: string[] }
export type Tpl = { id: string; name: string; format: string; description: string; sections: { title: string; guidance: string }[]; rules: string; example: string; uses: number }

const bool = (v: unknown) => v === true || v === 'true'
export const personaOf = (r: Row): Persona => ({
  id: str(r.id),
  name: str(r.name),
  role: str(r.role),
  firm: str(r.firm),
  size: str(r.size),
  pain: str(r.pain),
  isDefault: bool(r.is_default),
})
export const offerOf = (r: Row): Offer => ({
  id: str(r.id),
  name: str(r.name),
  price: r.price === null || r.price === undefined || r.price === '' ? null : Number(r.price),
  priceLabel: str(r.price_label),
  timeline: str(r.timeline),
  action: str(r.action),
  whats: str(r.whats_included),
  isDefault: bool(r.is_default),
})
export const proofOf = (r: Row): ProofItem => ({ name: str(r.name), status: str(r.status), source: str(r.source), expires: str(r.expires_on) })
export function tplOf(r: Row): Tpl {
  const secs = Array.isArray(r.sections) ? (r.sections as unknown[]) : []
  return {
    id: str(r.id),
    name: str(r.name),
    format: str(r.format),
    description: str(r.description),
    sections: secs.map((s) => (s && typeof s === 'object' ? { title: str((s as Row).title), guidance: str((s as Row).guidance) } : { title: str(s), guidance: '' })),
    rules: str(r.rules),
    example: str(r.example_text),
    uses: Number(r.uses) || 0,
  }
}

/** The default persona: the one marked default, else the oldest (v104DefPersona; personas are read oldest first). */
export const defaultPersona = (L: Persona[]) => L.find((p) => p.isDefault) ?? L[0] ?? null
/** The default offer: the one marked default, else the newest (v104DefOffer; offers are read newest first). */
export const defaultOffer = (L: Offer[]) => L.find((o) => o.isDefault) ?? L[0] ?? null
/** Who it is written for: nobody for Anyone who follows us, else the one picked, else the default (v105Per). */
export const pickPersona = (per: string, L: Persona[]) => (per === 'any' ? null : (L.find((p) => p.id === per) ?? defaultPersona(L)))
/** What is offered: nothing for Nothing to sell, else the one picked, else the default (v105Off). */
export const pickOffer = (off: string, L: Offer[]) => (off === 'none' ? null : (L.find((o) => o.id === off) ?? defaultOffer(L)))

/** "Ana Ruiz (Founder, Ruiz Advisory, 10 to 50)" (v104PersonaLine). */
export function personaLine(p: Persona): string {
  const who = [p.role, p.firm, p.size].filter(Boolean).join(', ')
  return p.name + (who ? ' (' + who + ')' : '')
}
/** The line under the persona chips. */
export const personaSum = (p: Persona | null) =>
  p ? [[p.role, p.firm, p.size].filter(Boolean).join(' · '), p.pain ? clip(p.pain, 120) : ''].filter(Boolean).join('. ') : 'Written for everyone who follows you, with no one buyer in mind.'

const ACTIONS: Readonly<Record<string, string>> = { call: 'Book a call', download: 'Download a resource', inquiry: 'Request a proposal', purchase: 'Buy a small offer' }
const priceText = (o: Offer) => o.priceLabel || (o.price === 0 ? 'Free' : o.price !== null && Number.isFinite(o.price) ? '$' + o.price : '')
/** "$497 · 2 weeks · Book a call" (v105OffLine). */
export const offerLine = (o: Offer) => [priceText(o), o.timeline, ACTIONS[o.action || 'call']].filter(Boolean).join(' · ')
export const offerSum = (o: Offer | null) => (o ? [offerLine(o), o.whats ? clip(o.whats, 110) : ''].filter(Boolean).join('. ') : '')
/** The offers as the select lists them: the default first, named so. */
export function offerChoices(L: Offer[]): { id: string; label: string }[] {
  const d = defaultOffer(L)
  return [...L].sort((a, b) => (d && b.id === d.id ? 1 : 0) - (d && a.id === d.id ? 1 : 0)).map((o) => ({ id: o.id, label: o.name + (d && d.id === o.id ? ' (default)' : '') }))
}

/** What they should do next (v105CtaList): the offer's own step, then what suits the kind of post. */
export function ctaList(t: string, o: Offer | null): string[] {
  const L: string[] = []
  if (o) {
    const a = o.action || 'call'
    L.push((a === 'call' ? 'Book a call: ' : a === 'download' ? 'Download: ' : a === 'inquiry' ? 'Request a proposal: ' : 'Get ') + o.name)
  }
  if (t === 'event') L.push('Register for the event')
  if (t === 'article' || t === 'newsletter') L.push('Read the full article')
  L.push('Reply or comment', 'Follow for more')
  if (t === 'newsletter' || t === 'email') L.push('Reply to this email')
  return uniq(L)
}
/** The call to action in force: the last pick when it is still listed, else the first. */
export const ctaOf = (picked: string, t: string, o: Offer | null) => {
  const L = ctaList(t, o)
  return L.includes(picked) ? picked : L[0]
}

export const SAVED_VOICE = 'Use my saved voice'
/** The voices (v97VoiceOpts): the saved one only when there is one. */
export const voiceOpts = (saved: boolean) => [...(saved ? [SAVED_VOICE] : []), 'Match my source', 'Clear and authoritative', 'Conversational']
export const voiceOf = (picked: string, saved: boolean) => {
  const L = voiceOpts(saved)
  return L.includes(picked) ? picked : L[0]
}

// ---------- structure: the usual shape, a simple shape, or one of the team's templates ----------

type Shape = readonly [string, string, readonly Sec[]]
/** The simple shapes (V97_STRUCT) and the shapes for paid ads (V97_AD_STRUCT). */
export const SHAPES: readonly Shape[] = [
  ['builtin:problem', 'Problem → insight → next step', [['The problem', 'Open on the problem the reader already feels.'], ['The insight', 'What you see that they do not, from the material.'], ['The next step', 'One practical step they can take this week.']]],
  ['builtin:story', 'Story → lesson → action', [['The story', 'A real moment from the material.'], ['The lesson', 'What it taught.'], ['The action', 'What the reader should do with it.']]],
  ['builtin:myth', 'Common belief → what is true → proof', [['The common belief', 'What most of the market assumes.'], ['What is actually true', 'The view from the material.'], ['The proof', 'An example or fact from the material.']]],
  ['builtin:steps', 'Practical steps', [['Why it matters', 'One or two lines on the stakes.'], ['The steps', 'Three to five steps, in order.'], ['Where to start', 'The first step to take.']]],
]
export const AD_SHAPES: readonly Shape[] = [
  ['ad:pain', 'Pain → proof → offer', [['The pain', 'Name the problem the reader already feels.'], ['The proof', 'One credible reason to believe it can be fixed.'], ['The offer', 'The next step and what they get from it.']]],
  ['ad:question', 'Question → answer → next step', [['The question', 'A question the reader has already asked themselves.'], ['The answer', 'A short, specific answer.'], ['The next step', 'What to do now, and why now.']]],
  ['ad:myth', 'Common belief → what is true → proof', [['The common belief', 'What most of the market assumes.'], ['What is actually true', 'The view the brief and the offer support.'], ['The proof', 'One example or fact that backs it.']]],
  ['ad:story', 'Story → lesson → next step', [['The story', 'A short moment the reader recognises.'], ['The lesson', 'What it shows.'], ['The next step', 'The offer as the natural next move.']]],
  ['ad:before', 'Before → after → how', [['Before', 'Life with the problem today.'], ['After', 'What changes once it is solved.'], ['How', 'How the offer gets them there.']]],
]
/** The team's templates a kind can follow: active, for its format or any (and those for other formats under Something else). */
export const tplsFor = (k: KindKey, base: Base, L: Tpl[]) => L.filter((t) => !t.format || t.format === base || t.format === 'any' || (k === 'other' && t.format === 'other'))
/** The Structure select: the usual shape first, the simple shapes, then the team's templates. */
export function structChoices(k: KindKey, t: string, templates: Tpl[]) {
  const ad = k === 'adcopy'
  const base = ad ? 'ad' : (CT[t]?.base ?? KINDS[k].base)
  return {
    first: ad ? 'Let the brief suggest a structure' : 'The usual ' + (CT[t]?.name ?? 'post').toLowerCase() + ' shape',
    shapes: (ad ? AD_SHAPES : SHAPES).map((s) => ({ value: s[0], label: s[1] })),
    templates: tplsFor(k, base, templates).map((x) => ({ value: x.id, label: x.name })),
  }
}
/** The structure in force: the one picked when the kind still offers it, else the usual shape (''). */
export function structOf(picked: string, k: KindKey, t: string, templates: Tpl[]): string {
  if (!picked) return ''
  const c = structChoices(k, t, templates)
  return [...c.shapes, ...c.templates].some((x) => x.value === picked) ? picked : ''
}
export type Template = { name: string; format: string; description: string; sections: { title: string; guidance: string }[]; rules: string; example_text: string }
/** A structure picked as the template it sends (v97StructTpl): a simple shape, or a saved template with its id. */
function pickedTemplate(v: string, fmt: Base, templates: Tpl[]): { id: string | null; template: Template } | null {
  if (!v) return null
  const b = [...SHAPES, ...AD_SHAPES].find((s) => s[0] === v)
  if (b) return { id: null, template: { name: b[1], format: fmt, description: 'A simple shape picked in the dashboard', sections: b[2].map(([title, guidance]) => ({ title, guidance })), rules: '', example_text: '' } }
  const t = templates.find((x) => x.id === v)
  return t ? { id: t.id, template: { name: t.name, format: t.format, description: t.description, sections: t.sections, rules: t.rules, example_text: t.example } } : null
}

// ---------- must use ----------

/** A thing it must use, typed in the box and kept as a chip; the box's own text counts too. */
export function mustOf(list: string[], typed = ''): string[] {
  const L = list.map((x) => str(x).trim().slice(0, MAX.must)).filter(Boolean)
  const t = str(typed).trim().slice(0, MAX.must)
  if (t && !L.includes(t)) L.push(t)
  return uniq(L).slice(0, MAX.musts)
}
const proofOk = (p: ProofItem, today: string) => p.status === 'approved' && !!p.source.trim() && (!p.expires || p.expires >= today)
/** Suggestions under Must use (nwMustSuggest): the first three approved proof items and the default offer. */
export function mustSuggest(proof: ProofItem[], offers: Offer[], today: string, have: string[]): string[] {
  const out: string[] = []
  for (const p of proof.filter((x) => proofOk(x, today)).slice(0, 3)) {
    const n = p.name.trim()
    if (n && n.length <= 60) out.push(n)
  }
  const o = defaultOffer(offers)
  if (o?.name) {
    const pl = o.priceLabel || (o.price === 0 ? 'Free' : '')
    out.push((pl && !o.name.toLowerCase().startsWith(pl.toLowerCase()) ? pl + ' ' : '') + o.name.trim())
  }
  return uniq(out)
    .slice(0, 4)
    .filter((s) => !have.includes(s))
}

// ---------- what the side pane says it will use ----------

/** A brief the draft can lead with: its run, when it was written, and the newest decision on it. */
export type BriefRow = { runId: string; createdAt: string; decision: string }
export type BriefPick = { use: BriefRow | null; newest: BriefRow | null }
/** The brief Content from Source uses (v97Pick): the newest approved, else the newest. */
export function pickBrief(rows: BriefRow[]): BriefPick {
  return { use: rows.find((r) => r.decision === 'approved') ?? rows[0] ?? null, newest: rows[0] ?? null }
}
/** Approved, changes asked, or waiting: an undone or edited brief waits for a review again, as Approvals counts it. */
export const briefState = (r: BriefRow) => (r.decision === 'approved' ? 'approved' : r.decision === 'changes' ? 'changes' : 'waiting')
const ageDays = (iso: string, now: number) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.floor((now - t) / 864e5) : null
}
export type Use = { ok: boolean; title: string; sub: string }
/** The brief row (nwBriefUse): the organic brief, or the ads brief for Paid ad; Approve while it waits, else Open. */
export function briefUse(pick: BriefPick, paid: boolean, now: number, day: (iso: string) => string): Use & { action: 'approve' | 'open' | null } {
  const u = pick.use
  const name = paid ? 'Ads brief' : 'Organic brief'
  if (!u) return { ok: false, title: 'No ' + name.toLowerCase() + ' yet', sub: paid ? 'Run the Ad Strategist, or it uses your material and voice only' : 'It uses your material and voice only', action: null }
  const st = briefState(u)
  const age = ageDays(u.createdAt, now)
  const old = age !== null && age > 21 ? ', ' + age + ' days old' : ''
  const sub = (st === 'approved' ? 'Approved' : st === 'changes' ? 'Changes asked' : 'Needs review') + old
  return { ok: st === 'approved' && !old, title: name + ' · ' + day(u.createdAt), sub, action: st === 'waiting' ? 'approve' : 'open' }
}
/** The warning under the plan preview (v97BriefWarn): no brief, one waiting or sent back, or a newer one waiting. */
export function briefWarn(pick: BriefPick, paid: boolean, now: number, short: (iso: string) => string): { text: string; link: 'brief' | 'agent' } | null {
  const u = pick.use
  const name = paid ? 'advertisement' : 'organic'
  let w = ''
  let link: 'brief' | 'agent' | null = null
  if (!u) w = 'No ' + name + ' brief yet. The draft uses your material and voice only.'
  else if (briefState(u) === 'waiting') w = 'The ' + name + ' brief is not reviewed yet.'
  else if (briefState(u) === 'changes') w = 'Changes were asked on the ' + name + ' brief.'
  else if (pick.newest && pick.newest.runId !== u.runId && briefState(pick.newest) === 'waiting') w = 'Uses the approved brief of ' + short(u.createdAt) + '. A newer one is waiting for review.'
  if (u && paid && (ageDays(u.createdAt, now) ?? 0) > 30) {
    w = (w ? w + ' ' : '') + 'It is from ' + short(u.createdAt) + '. Run the Ad Strategist for fresher patterns.'
    link = 'agent'
  }
  if (!w) return null
  return { text: w, link: link ?? (u || pick.newest ? 'brief' : 'agent') }
}

/** The material row (nwCtMatUse): the idea, or the file, call or text and how many words. */
export function materialUse(f: Pick<Form, 'src' | 'text' | 'thesis' | 'title' | 'fileName'>): Use {
  if (f.src === 'idea') {
    const th = f.thesis.trim()
    return { ok: th.length >= IDEA_MIN, title: 'Your idea', sub: th ? clip(th, 56) + (th.length < IDEA_MIN ? ' (a little more, please)' : '') : 'Not written yet' }
  }
  const label = f.src === 'upload' ? 'Your file' : f.src === 'fathom' ? 'Fathom call' : 'Pasted text'
  const txt = f.text.trim()
  if (!txt) return { ok: false, title: label, sub: f.src === 'upload' ? 'No file yet' : f.src === 'fathom' ? 'No call picked yet' : 'Nothing pasted yet' }
  const what = f.src === 'upload' && f.fileName ? f.fileName : f.title.trim()
  return {
    ok: txt.length >= TEXT_MIN,
    title: label,
    sub: (what ? clip(what, 40) + ' · ' : '') + num(wordCount(txt)) + ' words' + (txt.length < TEXT_MIN ? ', add a few more paragraphs' : '') + (isSample(txt) ? ' · sample' : ''),
  }
}
/** The line under the material tabs (nwCtMat): shown for a file or a call whose text is in, with See the text. */
export function materialLine(f: Pick<Form, 'src' | 'text' | 'title' | 'fileName'>): string | null {
  const txt = f.text.trim()
  if (f.src === 'idea' || f.src === 'paste' || !txt || (f.src === 'upload' && f.fileName)) return null
  return num(wordCount(txt)) + ' words ready' + (f.title.trim() ? ' from “' + clip(f.title.trim(), 60) + '”' : '')
}
/** The voice row (nwVoiceUse). */
export const voiceUse = (v: Voice | null, day: (iso: string) => string): Use =>
  v ? { ok: true, title: 'Your voice', sub: 'Saved' + (v.createdAt ? ' ' + day(v.createdAt) : '') } : { ok: false, title: 'Your voice', sub: 'Not set, so it uses a house voice' }

/** Ready to generate (nwCtReady): a few sentences for an idea, a few paragraphs of material. */
export const readyOf = (f: Pick<Form, 'src' | 'text' | 'thesis'>) => (f.src === 'idea' ? f.thesis.trim().length >= IDEA_MIN : f.text.trim().length >= TEXT_MIN)
/** The line under Generate, naming the step that holds the material. */
export function hintOf(f: Pick<Form, 'src' | 'text' | 'thesis'>, step: number): string {
  if (readyOf(f)) return 'About a minute. It lands in Drafts and waits in Approvals.'
  return f.src === 'idea' ? 'Write your point in step ' + step + ' to generate.' : 'Add your material in step ' + step + ' to generate.'
}

// ---------- what was asked to change on earlier drafts (v126Pick, v126Lines, v126UseRow) ----------

export type Ask = { feedback: string; createdAt: string; kind: string }
export const ASK_DAYS = 120
const ASK_MAX = 6
/** The asks a new draft of this kind reads: the last 120 days, its own kind first, newest first, at most 6. */
export function asksFor(asks: Ask[], kind: string, now: number): Ask[] {
  const since = now - ASK_DAYS * 864e5
  return asks
    .filter((a) => a.feedback.trim() && (Date.parse(a.createdAt) || 0) >= since)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (x.a.kind === kind ? 0 : 1) - (y.a.kind === kind ? 0 : 1) || x.i - y.i)
    .slice(0, ASK_MAX)
    .map((x) => x.a)
}
/** setup.feedback: each ask cut to 240 characters. */
export const feedbackLines = (asks: Ask[], kind: string, now: number) => asksFor(asks, kind, now).map((a) => clip(a.feedback, 240))
const WHY_NAMES = ['off-voice', 'too long', 'too generic', 'too salesy', 'weak hook', 'needs a real example', 'wrong audience', 'unclear point']
/** "LinkedIn post: too long, too salesy. Cut the intro." read back as its reasons and its note (v126Split). */
export function splitAsk(t: string): { why: string[]; note: string } {
  const s = str(t)
    .trim()
    .replace(/^[^:.]{2,40}:\s*/, '')
  const m = /^([^.]+)\.\s*([\s\S]*)$/.exec(s)
  if (m) {
    const parts = m[1].split(/\s*,\s*/).map((x) => x.toLowerCase())
    if (parts.length && parts.every((p) => WHY_NAMES.includes(p))) return { why: parts, note: m[2].trim() }
  }
  return { why: [], note: s }
}
/** The feedback row: the reasons asked most, and how many notes; null when nothing was asked. */
export function feedbackUse(asks: Ask[], kind: string, now: number): Use | null {
  const P = asksFor(asks, kind, now)
  if (!P.length) return null
  const n: Record<string, number> = {}
  let notes = 0
  for (const a of P) {
    const x = splitAsk(a.feedback)
    for (const w of x.why) n[w] = (n[w] ?? 0) + 1
    if (x.note) notes++
  }
  const top = Object.keys(n)
    .sort((a, b) => n[b] - n[a])
    .slice(0, 3)
    .map((w) => w + (n[w] > 1 ? ' (' + n[w] + ')' : ''))
  return {
    ok: true,
    title: 'Feedback on earlier drafts',
    sub: (top.length ? 'Avoids what was asked before: ' + top.join(', ') : 'Follows what the team asked to change before') + (notes ? ' · ' + plural(notes, 'note') : ''),
  }
}

/** The parts of the organic brief the team's layout switches off, by name (v111StOffNames: not the handoff or added parts). */
export const leaveOutOf = (saved: unknown) =>
  layoutOf(saved, 'org')
    .off.filter((k) => k !== 'hand' && k !== 'test' && !k.startsWith('x_'))
    .map((k) => SEC_TEXT.org[k]?.[0] ?? k)

/** A team idea counts as drafted when the idea that goes out still has its opening words (the old page marked any next idea). */
export function usesNote(thesis: string, note: string): boolean {
  const fold = (t: string) => str(t).replace(/\s+/g, ' ').trim().toLowerCase()
  const n = fold(note).slice(0, 60)
  return !!n && fold(thesis).includes(n)
}

// ---------- the form ----------

export type Form = {
  kind: KindKey
  /** the category picked for each kind, kept while the page is open */
  cat: Partial<Record<KindKey, string>>
  src: Src
  text: string
  url: string
  title: string
  /** What is this material? */
  type: string
  /** What is this material? was picked by hand: a file or a call no longer guesses it */
  typeSet: boolean
  fileName: string
  /** the title the material gave (a file, a call, a link): the next material's replaces it, a typed one stays */
  titleFrom: string
  thesis: string
  proof: string
  take: string
  must: string[]
  /** the answers to each kind's questions, kept while the page is open */
  answers: Partial<Record<KindKey, Record<string, Answer>>>
  notes: string
  /** '' the default persona, 'any' anyone who follows us, else a persona's id */
  per: string
  /** '' the default offer, 'none' nothing to sell, else an offer's id */
  off: string
  /** '' the first call to action listed */
  cta: string
  /** '' the first voice listed */
  voice: string
  /** '' the usual shape, else a simple shape or a template's id */
  struct: string
  /** a team idea drafted from Ideas (its id): marked used when an idea request goes out with its words */
  note: string | null
  /** the plan the side shows (its key and parts), sent with the request; null leaves the template's own parts */
  plan: { key: string; steps: Step[] } | null
}
export const blankForm = (): Form => ({
  kind: 'thought_leadership',
  cat: {},
  src: 'upload',
  text: '',
  url: '',
  title: '',
  type: 'article',
  typeSet: false,
  fileName: '',
  titleFrom: '',
  thesis: '',
  proof: '',
  take: '',
  must: [],
  answers: {},
  notes: '',
  per: '',
  off: '',
  cta: '',
  voice: '',
  struct: '',
  note: null,
  plan: null,
})

/** A form sent from the browser, checked: known kinds, tabs and choices only, every text cut to what the request keeps. */
export function formFrom(input: unknown): Form {
  const o = input && typeof input === 'object' ? (input as Row) : {}
  const f = blankForm()
  if (isKind(o.kind)) f.kind = o.kind
  if (isSrc(o.src)) f.src = o.src
  const cat = o.cat && typeof o.cat === 'object' ? (o.cat as Row) : {}
  for (const k of Object.keys(KINDS) as KindKey[]) if (typeof cat[k] === 'string' && CATS[k].some((c) => c[0] === cat[k])) f.cat[k] = cat[k] as string
  f.text = str(o.text).slice(0, TEXT_MAX + 2000)
  f.url = str(o.url).trim().slice(0, MAX.url)
  f.title = str(o.title).trim().slice(0, MAX.title)
  f.type = SRC_TYPES.some((x) => x[0] === o.type) ? str(o.type) : 'article'
  f.fileName = str(o.fileName).trim().slice(0, 200)
  f.thesis = str(o.thesis).slice(0, MAX.thesis + 1000)
  f.proof = str(o.proof).trim().slice(0, MAX.proof)
  f.take = str(o.take).trim().slice(0, MAX.take)
  f.must = mustOf(Array.isArray(o.must) ? o.must.map(str) : [])
  const ans = o.answers && typeof o.answers === 'object' ? (o.answers as Row) : {}
  const mine = ans[f.kind] && typeof ans[f.kind] === 'object' ? (ans[f.kind] as Row) : {}
  const A: Record<string, Answer> = {}
  for (const q of questionsOf(f.kind)) {
    const v = answerOf(q, mine[q.id] as Answer | undefined)
    if (v !== undefined) A[q.id] = v
  }
  f.answers = { [f.kind]: A }
  f.notes = str(o.notes).trim().slice(0, MAX.notes)
  f.per = str(o.per).slice(0, 60)
  f.off = str(o.off).slice(0, 60)
  f.cta = str(o.cta).slice(0, 300)
  f.voice = str(o.voice).slice(0, 60)
  f.struct = str(o.struct).slice(0, 60)
  f.note = UUID.test(str(o.note)) ? str(o.note) : null
  f.plan = planFrom(o.plan)
  return f
}

/** What a send reads besides the form: who sends it, the company profile, the templates and what the briefs leave out. */
export type Ctx = {
  email: string
  personas: Persona[]
  offers: Offer[]
  templates: Tpl[]
  voice: Voice | null
  /** the parts of the organic brief the team's layout switched off, by name */
  leaveOut: string[]
  asks: Ask[]
  now: number
}

/** The template the draft follows (v105CtTemplate, nwCtTemplate): the shape, who it is for, the offer and what it must use. */
function templateOf(f: Form, c: Ctx, t: string, base: Base, p: Persona | null, o: Offer | null, must: string[]): { id: string | null; template: Template } {
  const mustRule = must.length
    ? 'It must use these, word for word where they are figures, names or offers: ' + must.join('; ') + '. Leave one out only if the material does not support it, and say so in the review notes.'
    : ''
  const tp = pickedTemplate(structOf(f.struct, f.kind, t, c.templates), base, c.templates)
  const who = p ? 'Write for ' + personaLine(p) + '.' + (p.pain ? ' Their main pain: ' + tidyEnd(p.pain) + '.' : '') : ''
  if (f.kind !== 'adcopy') {
    const def = CT[t]
    const rules: string[] = []
    if (def?.rules) rules.push(def.rules)
    rules.push(who || 'Write for everyone who follows us, not one buyer.')
    rules.push(
      o
        ? 'The offer to point to: ' + o.name + (o.whats ? ' (' + clip(o.whats, 200) + ')' : '') + '. Mention it once, near the end, as the natural next step.'
        : 'Do not sell anything. Give value, then the call to action.',
    )
    const out = tp
      ? { id: tp.id, template: { ...tp.template, rules: join([tp.template.rules, rules.join(' ')]) } }
      : {
          id: null,
          template: {
            name: def?.name ?? 'Post',
            format: base,
            description: def?.d ?? '',
            sections: (def?.sections ?? []).map(([title, guidance]) => ({ title, guidance })),
            rules: rules.join(' '),
            example_text: '',
          },
        }
    if (mustRule) out.template.rules = join([out.template.rules, mustRule])
    return out
  }
  const rules: string[] = []
  if (who) rules.push(who)
  if (o) rules.push('The offer: ' + o.name + (o.whats ? ' (' + clip(o.whats, 200) + ')' : '') + '.')
  if (mustRule) rules.push(mustRule)
  if (tp) return { id: tp.id, template: { ...tp.template, rules: join([tp.template.rules, rules.join(' ')]) } }
  return {
    id: null,
    template: {
      name: 'Paid ad',
      format: 'ad',
      description: PAID_AD_D,
      sections: [{ title: 'Follow the ads brief', guidance: 'Order the body the way the copy formula in the ads brief does, with each hook as the opening.' }],
      rules: rules.join(' '),
      example_text: '',
    },
  }
}

/**
 * The template before the plan: the structure picked or the kind's usual shape, with who it is for, the offer and what
 * it must use; a carousel or a video ad takes its own shape (its parts are what the plan starts from, so the plan the
 * side shows is the one sent; v111Dress put the shape over the plan, the answers and the notes, so they were lost).
 */
function baseTemplate(f: Form, c: Ctx, must: string[]): { id: string | null; template: Template } {
  const k = f.kind
  const ad = k === 'adcopy'
  const cat = catOf(k, f.cat[k])
  const t = typeOf(k, cat)
  const base: Base = ad ? 'ad' : (CT[t]?.base ?? KINDS[k].base)
  const tp = templateOf(f, c, t, base, pickPersona(f.per, c.personas), pickOffer(f.off, c.offers), must)
  const A = ad ? AD_TYPES[cat] : undefined
  if (!A) return tp
  const T = tp.template
  return { id: tp.id, template: { ...T, name: A.name, description: A.d, sections: A.sections.map(([title, guidance]) => ({ title, guidance })), rules: join([A.rules, T.rules]) } }
}
/** The plan's key for the form as it is: the kind of post, a paid ad's shape, and the structure picked. */
export function planKeyOf(f: Pick<Form, 'kind' | 'cat' | 'struct'>, c: Pick<Ctx, 'templates'>): string {
  const k = f.kind
  const cat = catOf(k, f.cat[k])
  const t = typeOf(k, cat)
  return planKey(k, t, cat, structOf(f.struct, k, t, c.templates))
}
/** The parts the plan starts from (v121Builtin): the template's sections, and the saved template's name when one is picked. */
export function baseParts(f: Form, c: Ctx): { sections: { title: string; guidance: string }[]; template: string | null } {
  const tp = baseTemplate(f, c, mustOf(f.must))
  return { sections: tp.template.sections, template: tp.id ? tp.template.name || 'saved' : null }
}

export type Built = { ok: true; row: Row; templateId: string | null; title: string } | { ok: false; error: string }

/**
 * The content_requests row a send writes (nwCtSend with its wrappers): who asked, the kind and its format, the setup
 * (who it is for, the offer, the call to action, where the material came from, what it must use, what was asked to
 * change on earlier drafts, the answers and notes, the category), the material or the idea, and the template.
 */
export function buildRequest(f: Form, c: Ctx): Built {
  const k = f.kind
  const ad = k === 'adcopy'
  const idea = f.src === 'idea'
  const cat = catOf(k, f.cat[k])
  const t = typeOf(k, cat)
  const base: Base = ad ? 'ad' : (CT[t]?.base ?? KINDS[k].base)
  const p = pickPersona(f.per, c.personas)
  const o = pickOffer(f.off, c.offers)
  const must = mustOf(f.must)
  const cta = ctaOf(f.cta, t, o)
  const voice = voiceOf(f.voice, !!c.voice)
  const feedback = feedbackLines(c.asks, k, c.now)
  const notes = f.notes.trim()
  const setup: Row = {
    type: t,
    persona_id: p?.id ?? null,
    persona: p?.name ?? null,
    offer_id: o?.id ?? null,
    offer: o?.name ?? null,
    cta: cta || null,
    angle: null,
    source: f.src,
    must_use: must,
    ...(feedback.length ? { feedback } : {}),
    questions: answersMap(k, f.answers[k]),
    notes: notes || null,
    format_label: KINDS[k].t,
    category: cat || null,
    category_name: catLabel(k, cat) || null,
    ...(ad && cat ? { ad_type: cat } : {}),
  }
  const row: Row = {
    requested_by: c.email,
    start_mode: idea ? 'idea' : 'source',
    format: base,
    content_type: ad ? cat || 'ad' : t,
    setup,
    desired_action: cta || null,
    voice: voice || null,
    status: 'queued',
  }
  if (!idea) {
    const text = f.text.trim().slice(0, TEXT_MAX).trim()
    if (text.length < TEXT_MIN) return { ok: false, error: 'Add your material first, at least a few paragraphs: a file, pasted text, a link or a Fathom call.' }
    Object.assign(row, {
      source_type: SRC_TYPES.some((x) => x[0] === f.type) ? f.type : 'article',
      title: (isSample(text) ? 'Sample · ' : '') + (f.title.trim() || f.fileName.trim() || '') || null,
      source_url: f.url.trim() || null,
      source_text: text,
      takeaway: f.take.trim() || null,
      source_file_name: f.fileName.trim() || null,
    })
  } else {
    const th = f.thesis.trim().slice(0, MAX.thesis).trim()
    if (th.length < IDEA_MIN) return { ok: false, error: 'Say a little more about the point you want to make, a few sentences, so there is something real to build from.' }
    Object.assign(row, {
      audience: p ? personaLine(p) : 'Everyone who follows us',
      pain: p?.pain || null,
      thesis: th,
      proof: [f.proof.trim(), must.length ? 'It must use: ' + must.join('; ') : ''].filter(Boolean).join('\n\n') || null,
      title: th.split(/[.\n]/)[0].slice(0, 90),
    })
  }
  const tp = baseTemplate(f, c, must)
  const T: Template = { ...tp.template }
  // the plan the side shows is what is sent: its parts are the template's sections (v121), for the kind and structure it was made for
  if (f.plan && f.plan.key === planKeyOf(f, c)) T.sections = planSections(f.plan.steps)
  const ans = answersLine(k, f.answers[k])
  const extra = join([ans ? 'The team answered: ' + ans + '.' : '', notes ? 'Notes from the team: ' + notes : ''])
  if (extra) T.description = join([T.description, extra])
  if (c.leaveOut.length) T.rules = join(['Leave these parts of the organic brief out: ' + c.leaveOut.join(', ') + '.', T.rules])
  row.template = T
  if (tp.id) row.template_id = tp.id
  return { ok: true, row, templateId: tp.id, title: str(row.title) }
}

/** What the form keeps after a send: the choices stay, the material, the idea, what it must use and the notes go (nwCtSend). */
export function afterSend(f: Form): Form {
  const typed = Object.fromEntries(questionsOf(f.kind).filter((q) => q.kind === 'text').map((q) => [q.id, '']))
  const base = { ...f, must: [], notes: '', note: null, answers: { ...f.answers, [f.kind]: { ...answersOf(f.kind, f.answers[f.kind]), ...typed } } }
  return f.src === 'idea' ? { ...base, thesis: '', proof: '' } : { ...base, text: '', take: '', title: '', titleFrom: '', url: '', fileName: '' }
}

/** Material that came in whole (a file, a call, a link, a piece or a request to use, what Fill it in picked). */
export type Material = {
  text: string
  title: string
  url?: string
  fileName?: string
  /** what the material is, always set */
  type?: string
  /** what the material looks like, set unless What is this material? was picked by hand */
  guess?: string
}
const isType = (t: string | undefined): t is string => !!t && SRC_TYPES.some((x) => x[0] === t)
/**
 * The form with this material in it: its text (cut to 120,000 characters), its link and file name, what it is, and its
 * title, unless one was typed (the current dashboard kept the first file's title for a second file).
 */
export function withMaterial(f: Form, m: Material): Form {
  const typed = !!f.title.trim() && f.title !== f.titleFrom
  const title = typed ? f.title : str(m.title).trim().slice(0, MAX.title)
  const type = isType(m.type) ? m.type : isType(m.guess) && !f.typeSet ? m.guess : f.type
  return {
    ...f,
    text: str(m.text).slice(0, TEXT_MAX),
    title,
    titleFrom: typed ? f.titleFrom : title,
    type,
    url: str(m.url).trim().slice(0, MAX.url),
    fileName: str(m.fileName).trim().slice(0, 200),
  }
}

/** Why a request could not be saved, in the current dashboard's words (apCfDbErr). */
export function dbErr(e: { code?: string; message?: string } | null | undefined): string {
  const m = str(e?.message)
  if (e?.code === '42501' || /row-level security/i.test(m)) return 'your account is not allowed to create content requests. Only @aiparagonconsulting.com accounts can.'
  if (e?.code === '23514') return 'one of the values is not accepted by the table.'
  return m.slice(0, 160) || 'something went wrong'
}

// ---------- See everything it will use (v97PlanPreview, rebuilt from the request) ----------

export type Preview = {
  making: { big: string; d: string }
  substance: { rows: (readonly [string, string])[]; quote: string; misses: string[] }
  who: (readonly [string, string])[]
  asked: (readonly [string, string])[]
  signals: { lead: string; items: SnapItem[]; miss: string; support: string }
  voice: string
  structure: { name: string; sections: { title: string; guidance: string }[]; rules: string } | { none: string }
}
export type PreviewCtx = Ctx & { org: BriefPick; ads: BriefPick; orgItems: SnapItem[] }
/** What the generator will use, from the same pieces the request is built from. */
export function previewOf(f: Form, c: PreviewCtx, short: (iso: string) => string): Preview {
  const k = f.kind
  const ad = k === 'adcopy'
  const cat = catOf(k, f.cat[k])
  const t = typeOf(k, cat)
  const base: Base = ad ? 'ad' : (CT[t]?.base ?? KINDS[k].base)
  const p = pickPersona(f.per, c.personas)
  const o = pickOffer(f.off, c.offers)
  const must = mustOf(f.must)
  const A = ad ? AD_TYPES[cat] : undefined
  const making = ad ? { big: (A?.name ?? 'Paid ad') + ' · ' + KINDS.adcopy.gets[1], d: A?.d ?? PAID_AD_D } : { big: CT[t]?.out ?? '', d: CT[t]?.d ?? '' }

  const rows: (readonly [string, string])[] = []
  const misses: string[] = []
  let quote = ''
  if (f.src !== 'idea') {
    const txt = f.text.trim()
    if (!txt) misses.push('No source text yet. Paste it or load a file.')
    else {
      if (isSample(txt)) misses.push('This is the sample source. Swap in your own material for a real draft.')
      rows.push(['Source', srcTypeName(f.type) + ' · ' + num(wordCount(txt)) + ' words'])
      if (f.title.trim()) rows.push(['Title', f.title.trim()])
      rows.push(['Core takeaway', f.take.trim() || 'Not given. It picks the strongest point in the source.'])
      if (f.url.trim()) rows.push(['Link', f.url.trim()])
      quote = clip(txt, 320)
      if (txt.length < TEXT_MIN) misses.push('Add a few more paragraphs before you generate.')
    }
  } else {
    const th = f.thesis.trim()
    if (!th) misses.push('No key idea yet. Describe it in a few sentences.')
    else {
      rows.push(['Key idea', clip(th, 320)])
      if (p?.pain) rows.push(['Their problem', p.pain])
      rows.push(['Proof', clip(f.proof, 220) || 'None given. It will not invent any.'])
      if (th.length < IDEA_MIN) misses.push('Add a little more on your point of view before you generate.')
    }
  }
  const who: (readonly [string, string])[] = [
    ['Written for', p ? personaLine(p) : 'Everyone who follows you, no one buyer'],
    ['Offer', o ? o.name : 'Nothing to sell, just value'],
    ['Call to action', ctaOf(f.cta, t, o) || 'None'],
  ]
  const asked: (readonly [string, string])[] = []
  const ans = answersLine(k, f.answers[k])
  if (ans) asked.push(['Your answers', ans])
  if (must.length) asked.push(['Must use', must.join('; ')])
  if (f.notes.trim()) asked.push(['Notes', clip(f.notes, 300)])
  const fb = feedbackLines(c.asks, k, c.now)
  if (fb.length) asked.push(['Asked on earlier drafts', fb.join(' / ')])
  if (c.leaveOut.length) asked.push(['Leaves out of the organic brief', c.leaveOut.join(', ')])

  const state = (r: BriefRow) => ({ approved: 'approved', changes: 'changes asked', waiting: 'waiting for review' })[briefState(r)]
  const lead = ad ? c.ads.use : c.org.use
  const signals = {
    lead: lead ? (ad ? 'the Ad Strategist’s brief of ' : 'the Intel Tracker brief of ') + short(lead.createdAt) + ', ' + state(lead) : '',
    items: !ad && lead ? c.orgItems.slice(0, 3) : [],
    miss: lead ? '' : 'No ' + (ad ? 'ads' : 'organic') + ' brief yet. It leans on your material and your voice only.',
    support: !ad && c.ads.use ? 'Paid findings from the brief of ' + short(c.ads.use.createdAt) + ' may support the pain points.' : '',
  }
  const vs = voiceOf(f.voice, !!c.voice)
  const voice =
    vs === SAVED_VOICE
      ? c.voice
        ? 'Your saved voice' + (c.voice.tone.length ? ': ' + c.voice.tone.join(', ') : '')
        : 'Your voice is not set up yet, so it writes plainly and clearly.'
      : vs === 'Match my source'
        ? 'It matches the voice of your source.'
        : vs + '.'
  const tp = pickedTemplate(structOf(f.struct, k, t, c.templates), base, c.templates)
  const def = ad ? undefined : CT[t]
  const planned = f.plan && f.plan.key === planKeyOf(f, c) ? planSections(f.plan.steps) : null
  const secs = planned ?? (A ? A.sections.map(([title, guidance]) => ({ title, guidance })) : tp ? tp.template.sections : def ? def.sections.map(([title, guidance]) => ({ title, guidance })) : [])
  const own = join([A?.rules, tp?.template.rules, def?.rules])
  const structure = planned && !planned.length
    ? { none: 'No set parts. The writer picks a shape from your answers.' }
    : secs.length
    ? { name: A?.name ?? tp?.template.name ?? def?.name ?? 'Paid ad', sections: secs, rules: own }
    : ad && !tp
      ? { name: 'Paid ad', sections: [{ title: 'Follow the ads brief', guidance: 'Order the body the way the copy formula in the ads brief does, with each hook as the opening.' }], rules: own }
      : { none: 'No set shape. It follows the usual ' + (def?.name ?? 'piece').toLowerCase() + ' format.' }
  return { making, substance: { rows, quote, misses }, who, asked, signals, voice, structure }
}

// ---------- filled in from elsewhere: Ideas, the quick starts, the strategy read ----------

/** What the address asks the form to fill in (nwCtApply): a kind, a tab, an idea, a title and takeaway, a piece to use. */
export type Prefill = {
  sig: string
  kind: KindKey | null
  src: Src | null
  thesis: string | null
  title: string | null
  take: string | null
  note: string | null
  use: { kind: 'piece' | 'request'; id: string } | null
  /** a Fathom call whose transcript becomes the material (Calls' Use as content source), and its share link */
  call: string | null
  link: string
  say: string
}
const PRE_KEYS = ['kind', 'src', 'idea', 'title', 'take', 'note', 'use', 'call', 'link', 'from'] as const
/** A Fathom call's id, as the address carries it. */
export const CALL_ID = /^[\w-]{1,80}$/
const FATHOM = /^https:\/\/([a-z0-9-]+\.)*fathom\.video\//i
/** The prefill an address asks for, or null when it asks for none. */
export function prefillOf(sp: { get(k: string): string | null }): Prefill | null {
  const v = Object.fromEntries(PRE_KEYS.map((k) => [k, sp.get(k)])) as Record<(typeof PRE_KEYS)[number], string | null>
  if (!PRE_KEYS.some((k) => v[k] !== null)) return null
  const use = /^(piece|req):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(v.use ?? '')
  const call = CALL_ID.test(v.call ?? '') ? (v.call as string) : null
  // a piece or a request's material goes on Paste once its text is in (nwCtUsePiece reads it first); a call is a call
  const src = call ? 'fathom' : isSrc(v.src) ? v.src : v.idea !== null || v.note !== null ? 'idea' : null
  const read = v.from === 'read'
  return {
    sig: PRE_KEYS.map((k) => k + '=' + (v[k] ?? '')).join('&'),
    kind: kindFrom(v.kind),
    src,
    thesis: v.idea !== null ? v.idea.slice(0, MAX.thesis) : null,
    title: v.title !== null ? v.title.slice(0, MAX.title) : null,
    take: v.take !== null ? v.take.slice(0, MAX.take) : null,
    note: UUID.test(v.note ?? '') ? (v.note as string) : null,
    use: use ? { kind: use[1].toLowerCase() === 'piece' ? 'piece' : 'request', id: use[2] } : null,
    call,
    link: call && FATHOM.test(v.link ?? '') ? (v.link as string).slice(0, MAX.url) : '',
    say: read ? (src === 'idea' ? 'Filled in from the strategy read. Check it, then generate.' : 'Filled in from the strategy read. Add your material, then generate.') : '',
  }
}
/** The address that starts a draft with these filled in. */
export function newDraftHref(o: {
  kind?: string
  src?: Src
  idea?: string
  title?: string
  take?: string
  note?: string
  use?: string
  call?: string
  link?: string
  from?: 'read'
}): string {
  const q = new URLSearchParams()
  for (const k of PRE_KEYS) {
    const x = o[k]
    if (x) q.set(k, x)
  }
  const s = q.toString()
  return '/content-transformation' + (s ? '?' + s : '')
}
/** A brief's idea drafted from Ideas (nwCtDraftIdea): its text, then why. */
export const ideaThesis = (it: Pick<SnapItem, 'text' | 'why'>) => tidy(it.text) + (it.why ? '. ' + tidy(it.why) : '')
/** A recommendation of the strategy read made here (v98Make): from material, or as an idea. */
export function readHref(r: { title: string; why: string; angle: string; start: string; format: string }): string {
  const kind = ['ad', 'thought_leadership', 'newsletter', 'email'].includes(r.format) ? r.format : 'thought_leadership'
  if (r.start === 'source') return newDraftHref({ kind, src: 'upload', title: r.title, take: r.angle || r.why || '', from: 'read' })
  const text = (str(r.title).replace(/\.$/, '') + '. ' + (r.angle || r.why || '')).trim()
  return newDraftHref({ kind, src: 'idea', idea: text, from: 'read' })
}
