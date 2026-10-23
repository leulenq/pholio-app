# Round 1: Trust & Safety (trust)

## 1. Verdict
The thesis sells "credible" as if it were a feature, but as written each of its three tiers is a laundering machine that runs at a different speed. The zero-maintenance drafting promise makes Pholio the author of claims it cannot stand behind.

## 2. Three strongest arguments

**A. Whatever the fine print says, readers will take any tier word to mean "Pholio vouches for this person". That makes ISSUED the tier with the largest blast radius.**
- [FACT](https://www.newsguardtech.com/press/most-americans-put-misplaced-trust-in-xs-blue-check-verification-system/) 60% of X users did not know the blue check had come to mean payment. Readers keep a badge's old meaning long after its criteria change.
- [FACT](https://form.jotform.com/260485991034159) A live NYFW-branded show charges models a $625 package that includes "the runway walk". [FACT](https://www.buzzfeed.com/hannahmarder/are-fashion-week-models-paid) Non-CFDA "NYFW" platforms run on waivers and exposure.
- [FACT](https://www.cbsnews.com/amp/chicago/news/designer-fashion-show-producer-scam-claim) Shows get sold and never happen. [FACT](https://dk.fashionnetwork.com/news/Philipp-Plein-defrauded-of-900-000,1066717.html) Organizer impersonation already exists at the top of the market.
- [ASSUMPTION] The thesis's expansion list (school shows, galleries, indie labels, indie magazines) overlaps heavily with the pay-to-play tier. [FACT](https://help.kavyar.com/article/p03wnxoixc) Indie magazines on Kavyar can charge non-refundable submission fees. Once a pay-to-publish magazine is an issuer, a $40 fee turns into an "ISSUED editorial credit". One bad issuer mints hundreds of false credits in a single CSV.

**B. MUTUAL is not verification. It is friends doing favors, which is the attack that graph defenses handle worst.**
- [FACT](https://par.nsf.gov//servlets/purl/10087133) "Elite Sybil" attacks recruit real, reputable users and get past filters at higher rates. [FACT](https://www.comp.nus.edu.sg/~yuhf/sybilguard-sigcomm06.pdf) Sybil detection assumes few attack edges. A ring of 20 real aspiring models in a group chat breaks that assumption completely.
- [FACT](https://www.socialmediatoday.com/social-business/linkedins-looking-make-endorsements-more-relevant-heres-how) LinkedIn needed about 84 signals before raw peer endorsements were usable.
- [FACT](https://www.inro.social/blog/instagram-collaboration-post-how-to-collab-add-after-posting-more) Instagram collab posts are already invite-and-accept mutual credits. So MUTUAL adds the least trust, carries the most gaming risk, and is the easiest piece for Meta to copy.
- [FACT](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials) The FTC rule covers fake "social media indicators". [BET] If paid seats are sold on a "verified graph" that includes MUTUAL, we reproduce Twitter Blue and add an FTC angle.

**C. A "living, public, current" record is a safety hazard for the people it is meant to serve.**
- [FACT](https://www.minclaw.com/legal-resource-center/what-is-section-230-of-the-communication-decency-act-cda/) Section 230 does not protect content the platform creates. A credit Pholio drafts from tags and publishes is arguably Pholio's own speech. [FACT](https://www.overlawyered.com/2007/05/so-you-want-to-be-in-pictures/) A false credit was litigated as defamation against IMDb.
- [FACT](https://thefader.com/2014/09/23/alicia-keyes-stylists-legal-fracas) Some credits are left off on purpose for contract reasons, and auto-drafting would publish them.
- [FACT](https://www.thefashionlaw.com/resource-center/models-laws-governing-the-modeling-industry-in-the-u-s) NY treats under-18 runway models as child performers. A current record of "who walked where, when" becomes a location log of minors. FWB's 2023 season included a kids' show ([FACT](https://www.bkreader.com/featured-news/where-brooklyn-at-fashion-week-brooklyn-highlights-hip-hop-culture-in-bk-the-metaverse-and-beyond-6831994)).
- [FACT](https://www.cbc.ca/1.6397323) Model likenesses are stolen for fake profiles again and again. A credible credit graph makes a likeness worth more to steal.
- [FACT](https://petapixel.com/2025/07/29/ai-generated-models-now-appear-in-vogue-magazine/) A completely honest issuer can still credit a synthetic person.

## 3. The claim most wrong
**"Credits are drafted from work creatives already post, so the record stays current without the creative maintaining it."**
Zero maintenance and credibility pull against each other. A credit that no accountable human confirmed is one of two things: Pholio's own assertion, which brings liability and the 230 exposure above, or an unconfirmed claim, which is worth nothing to a search seat. Instagram strips C2PA ([FACT](https://www.softwareseni.com/how-c2pa-content-credentials-work-and-what-their-limits-are/)), and C2PA cannot attribute authorship to a person anyway ([FACT](https://c2pa.org/faq/)). Drafting is fine as private input. "Current without maintenance" is a promise we cannot keep and still use the word credible.

## 4. Proposed revision: what "verified" means
Rule: **"Verified" describes a person only, never a credit.** Credits carry a provenance sentence instead of a tier badge. Drafts stay private until a named human confirms them.

| Label | Exact meaning | Requirements | How it gets gamed |
|---|---|---|---|
| **ID verified** (person) | A government ID plus liveness matches the profile, and the person controls the linked handle | Persona/Veriff (about $1/check, [FACT](https://withpersona.com/pricing)), handle bio-code or OAuth, re-check when the handle changes. Required to confirm anyone else's credit and to act as an issuer signatory | Bought or hacked handle (about $45, [FACT](https://www.malaymail.com/news/tech/gadgets/2021/04/27/how-much-is-your-social-media-profile-worth-on-the-dark-web/1969734)), staff or volunteer bribery ([FACT](https://siliconangle.com/blog/2017/09/03/details-6m-instagram-accounts-sale-online-employees-accused-corruption/)), minors lying about age |
| **Added by [name]** (was CLAIMED) | The account holder says so | Must link a public artifact. Account age shown. Never ranked in paid search | Stolen portfolios (Dawes), AI work, contractually omitted work |
| **Confirmed by [name, role]** (was MUTUAL) | Named ID-verified collaborators on the same artifact agree on roles | At least one confirmer from outside the claimant's existing cluster. Velocity caps. A confirmer caught lying loses confirming rights across their whole graph. **Never labeled or sold as verified** | Friend rings, role inflation, collusion on a real artifact |
| **Issued by [org], [event], [date]** | An accountable organization states who held which role at an evidenced event | Legal-entity check (reuse the registry code). Public evidence the event happened. A named, ID-verified signatory. A written attestation that no talent paid to take part, or else the credit is labeled "paid participation". A headcount cap. A 7-day private dispute window before publication. Issuers cannot credit themselves. One proven fraud revokes all of that issuer's credits, with public notice | Pay-to-walk laundering, ghost events, lookalike issuers, compromised issuer accounts, bulk CSV errors |

Launch gates I will not trade away:
- No credits for under-18s in v1.
- Nothing forward-dated is public.
- Append-only confirmation log, with personal data deletable (CNIL pattern). A person who deletes their account becomes "a collaborator" on others' credits.
- DMCA agent registered before launch.
- Impersonation reports open to non-members.
- Issuers added by hand, slowly. FWB is the only issuer this season.

## 5. My question for the room
**Who at BK Style Foundation will sign each ISSUED credit by name, and what do they personally or institutionally lose if a credit turns out to be false?** If the answer is "a volunteer, and nothing", explain why a paying search seat should value ISSUED above "Added by".
