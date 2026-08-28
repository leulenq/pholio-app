# UX writing evidence base

App-only reference. The research behind the product-language discipline in
`app-mechanics.md`. Kept separate so the discipline stays short and the
evidence stays checkable (research pass 2026-08-27).

---

## 1. Where the canon converges

Across Podmajersky (Strategic Writing for UX), NN/g, Google Material,
Apple HIG, Microsoft, Shopify Polaris, Atlassian, Mailchimp, GOV.UK, and
US plain-language guidance, the converged rules:

1. Fewer words, always ("weigh every word"; the Jenga test: remove a word,
   does meaning fall?).
2. Plain familiar words, no jargon, *including for experts*.
3. Write like you speak; read it aloud.
4. Active voice; verb-first buttons.
5. Front-load keywords.
6. Sentence case.
7. Errors: what happened + how to fix; no blame, no "invalid".
8. Avoid "we" and apology theater; the brand enters the conversation only
   when it caused the problem (Polaris, verbatim: "Don't... bring 'us'/'we'
   into the conversation unless Shopify caused the problem").
9. Descriptive labels; never "click here", never Yes/No on consequences.
10. Voice constant, tone situational.

Notable specifics: Material: numerals not words ("3 messages"), no
exclamation points, begin with the objective. Apple: positive instruction
over prohibition ("Use only letters" beats "Don't use numbers");
interjections like "oops" "can sound insincere". GOV.UK: sentences under
25 words; the FAQ ban; the banned-buzzword list. UX text should "pass
unremembered while it helps somebody to the thing they want"
(Podmajersky); celebration is reserved for the user's achievement, never
the product's.

Where guides differ: personality dial (Mailchimp's wink vs GOV.UK's zero;
Pholio sits near GOV.UK with Monzo's warmth-as-information); GOV.UK bans
*negative* contractions (low-literacy readers misread "can't");
Apple/Atlassian minimize possessives ("Favorites", not "Your Favorites";
Pholio's owner-settled possessive warmth, "your book", overrides this one).

## 2. Comprehension evidence

- **Simplicity raises perceived expertise.** Oppenheimer 2006: needless
  complexity lowered judged author intelligence across five experiments
  (processing fluency: Alter & Oppenheimer 2009). Trudeau 2012: the more
  educated and specialist the reader, the *greater* the preference for
  plain English. Plain language reads as more professional to agencies,
  not less.
- **Measured gains.** Nielsen's 6th-grade rewrite: task success 46% to 82%
  (low literacy) and 68% to 93% (high). Morkes & Nielsen: concise +58%,
  scannable +47%, objective non-promotional language alone +27%; "users
  detested marketese... promotional language imposes a cognitive burden."
- **Scanning.** 79% scan; F-pattern: first lines and first words get the
  fixations; users see roughly the first 11 characters of a link.
- **Labels.** Spool trigger-words: targets found 72% of the time when the
  user's own words appear on the page, 6% when absent. "Get Started"
  measurably stops users (NN/g eyetracking).
- **Errors.** Shneiderman 1982: specific messages improved repairs 28%;
  message tone measurably changes users' appraisal *of themselves*
  (Akgun 2010): blame direction is a psychological variable, not a style
  preference. (Caveat: the widely cited sentence-length percentages, 90%
  comprehension at 14 words, are untraceable to a primary study; treat
  length caps as directional.)

## 3. Trust in system communication

- **Visibility of system status** (Nielsen heuristic #1): "no action with
  consequences to users should be taken without informing them"; a lack
  of information equates to a lack of control.
- **Calibrated trust, not maximal trust** (Google PAIR): over-trust is a
  failure mode. Show confidence only when it changes what the user should
  do, and as categorical buckets mapped to actions, never raw
  percentages. Mental-model template: "This is X, it helps by Y, it
  cannot Z yet."
- **Microsoft HAX** (verbatim guidelines): G1 make clear what the system
  can do; G2 make clear how well; G8 easy dismissal; G9 easy correction;
  G10 "scope services when in doubt" (the doctrinal basis for hedged
  copy); G16 convey how user actions shape future behavior. Canonical
  microcopy: "Suggested", "Likely", "Did you mean".
- **Explanations inflate reliance** (Zhang, Liao & Bellamy 2020):
  confidence buckets helped calibrate; authoritative explanations
  increased reliance regardless of correctness. A hedge is safer than a
  rationale on uncertain output.
- **Progress** (NN/g): indicator over 1s; skeleton/spinner 2-10s;
  determinate progress with what-is-happening text over 10s ("Composing
  card 2 of 4"); never precise time estimates (a broken estimate costs
  more trust than none).
- **Contestable decisions.** GDPR Art. 22/Recital 71 (human intervention,
  explanation, challenge); CFPB Circular 2022-03: reasons "must be
  specific and indicate the principal reason(s)"; "did not meet our
  criteria" is illegal in credit and treated as banned genre here. Ustun
  et al. 2019: a stated reason must cite a factor the person can change,
  or it is not recourse.
- **Consent.** Nouwens et al. 2020: only 11.8% of consent flows met
  minimal legal requirements; removing the opt-out from the first page
  raised consent 22-23 points, which is the manipulation, quantified.
  EDPB/CNIL standard: refusal as easy and as prominent as acceptance,
  nothing pre-ticked, purpose-by-purpose, withdrawal as easy as grant.
- **Undo over confirmation** (Nielsen heuristic #3). Gmail's Undo Send is
  honest because copy and mechanism match: it holds the send, never
  claims recall. GitHub's type-the-name is honest friction: reserved for
  irreversibility.

## 4. Decision support without manipulation

- **Defaults are read as endorsements** (Johnson & Goldstein 2003;
  Jachimowicz et al. 2019 meta-analysis, d about 0.63): users assume the
  default is the recommendation whether or not you meant it.
- **Mild dark patterns more than doubled acceptance (11.3% to 25.8%) with
  no detectable user aggravation** (Luguri & Strahilevitz 2021), and
  less-educated users were more susceptible. User silence is not evidence
  of honesty. Awareness is not protection (Bongard-Blanchy 2021).
- **The affirmative line** (Thaler): transparent, never misleading;
  opt-out one click; good reason to believe it serves the user's own
  welfare. The publicity test: would we screenshot the flow in the
  changelog and explain the intent? Audit exit friction ("sludge") as
  rigorously as entry nudges.
- **Empty states** (NN/g 2021): four kinds needing four scripts:
  first-use (teach), user-cleared (confirm, don't re-teach), no-results
  (echo the query, offer to broaden), error/permission (the way out).
  Never show emptiness while loading.
- **Onboarding:** tutorials interrupt, don't improve performance, and are
  forgotten (paradox of the active user, Carroll & Rosson 1987);
  contextual just-in-time help wins; an overlay is a bandage over an
  unintuitive interface.
- **Notifications:** about 23 minutes to recover from an interruption
  (Mark); median 64 notifications/day and users cannot self-ration
  (Pielot 2014), so the product must exercise the restraint; batching
  beat both continuous delivery and none (Fitz 2019); repeated warnings
  habituate to invisibility (Anderson 2015). A receipt is not an upsell
  surface (CAN-SPAM primary-purpose discipline).

## 5. Voice-tone under stress

- **Trustworthiness explained 52% of brand desirability; friendliness 8%**
  (NN/g tone study). Casual-conversational raised both; humor raised
  friendliness and *cost* trust. Casual is not funny.
- **Monzo:** operational messages and support get "Wit: none". "It's never
  'We'd like to apologise', it's 'We're sorry'", said once, and never
  when nothing went wrong. Their gambling block states the reason for its
  own friction inside the copy.
- **GOV.UK error component, with reasons attached:** no "please" (implies
  choice); no "sorry" in validation errors (does not help fix); no
  "valid/invalid"; no blame words; no humor, no "oops"; specific over
  generic ("Enter your first name", never "This field is required").
  System failure gets the apology and the preservation fact ("We saved
  your answers. They will be available for 30 days.").
- **Stripe's safety exception:** for fraud/lost/stolen card declines,
  "Don't report more detailed information to your customer" - present as
  a generic decline. Where specificity endangers, honest-but-generic is
  the designed behavior. Everywhere else, per-code specific next steps.
- **Humor placement law** (four systems converge): banned wherever
  something is lost, failing, or costs money; allowed only in proportion
  to distance from consequence.
