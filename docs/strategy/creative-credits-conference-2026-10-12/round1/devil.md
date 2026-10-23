# Round 1: Devil's advocate, opening position

## 1. Verdict
The credit-record thesis builds the most heavily tested failure in this space: a supply-side record with no buyer. Its one new feature, ISSUED, comes from issuers whose name lowers a credit's value for exactly the hirers Pholio would charge.

## 2. My three strongest arguments

**A. Verification quality has never been the bottleneck. Buyer demand has.**
- Jaxsta had about 380M issuer-supplied "official" credits from all three majors, which is better verification than Pholio will ever have. It closed in 2025 because "the current model does not scale" [FACT](https://en.wikipedia.org/wiki/Jaxsta).
- Behance has offered accepted co-ownership to about 56M members for a decade and is still not a hiring authority [FACT](https://help.behance.net/hc/en-us/articles/204483494-Guide-Co-owning-And-Crediting).
- IMDb refuses to verify modeling and commercial credits at all and keeps them in a self-verified Pro tier [FACT](https://help.imdb.com/article/imdbpro/manage-your-imdb-page/how-do-updates-on-my-resume-work/GMLWQXHRJL84G66W).
- R4 searched for any fashion or photo hirer asking "is this credit verified?" and found none [FACT of absence, R4 §Against-2].

The thesis spends its whole design budget (three tiers, plain-text provenance, issuer onboarding) on the variable the precedents show does not matter.

**B. Hirers vet the person and the work, not a credit line.**
- In fashion, 82% of jobs go through contacts, and only 27% of fashion roles are publicly advertised [FACT](https://bectu.org.uk/news/three-quarters-of-creative-industries-jobs-go-to-friends-and-connections-reveals-bectus-bectu-survey).
- Commercial buyers shortlist from curated portfolios and reels [FACT](https://campaigns.at-edge.com/survey-results/). Casting directors ask agents for referrals [FACT](https://atg.wa.gov/modeling-agencies-teens).

When a hirer does lose time or money, the failure is almost never "she lied about walking a Brooklyn show." It is "she doesn't look like her photos," "this account isn't her," or "this agency is fake":
- A casting director quoted anonymously said they called in children from AI photos and "were shocked when the real child walked in" [FACT, anecdotal](https://theplayground.com/ai-headshots-vs-real-photography-casting-directors-decide/).
- Agencies already require unretouched digitals for this reason [FACT](https://www.backstage.com/magazine/article/how-to-take-modeling-digitals-and-polaroids-76696/).
- Brands pay $99–399 a month per seat to verify that a creator is *authentic*, not to verify their history [FACT](https://modash.io/modash-vs-hypeauditor).

The verification that sells is *is this real and current*, not *did this happen*.

**C. The FWB seed is small and contaminated.** [FACT + ASSUMPTION]
- FWB has about 40 designer slots a season [FACT](https://www.fashionweekbrooklyn.com/schedule). R4 puts the ceiling at about 1,000 credited people a year, including Fashion Week Queens [ASSUMPTION, R4's estimate].
- The tier that Models.com leaves uncredited is the tier where pay-to-walk operators work. One NYFW-branded show charges models $625 to walk [FACT](https://form.jotform.com/260485991034159).
- To the casting director at a paying brand, "ISSUED by a regional fashion week" reads as *emerging, unpaid, exposure-tier*. That is a neutral-to-negative signal, not a credential [ASSUMPTION].
- Without hard issuer vetting, Pholio becomes the place to launder $625 into a "verified runway credit." With it, Pholio has about five issuers in year one [BET].

## 3. The claim I think is most wrong
**"Credits are drafted from work creatives already post, so the record stays current without the creative maintaining it."**

This sentence carries the word *living* in the thesis, and it is false on three counts.

1. **Technically conditional.** Meta's tags endpoint returns only media in which a *professional* account was tagged. Consumer accounts are inaccessible, and serving accounts Pholio doesn't own needs Meta Advanced Access approval [FACT](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/tags). The Basic Display API is gone [FACT](https://developers.secure.facebook.com/docs/instagram-basic-display-api). So the "living" pipe runs at the discretion of the incumbent it competes with.
2. **Semantically empty.** A tag is not a role. "Styled by" usually sits in caption text, and brands routinely strip it [FACT](https://www.papermag.com/instagram-2649343382.html). Some credits are left off on purpose for contract reasons [FACT](https://thefader.com/2014/09/23/alicia-keyes-stylists-legal-fracas).
3. **Legally, it becomes admin anyway.** If Pholio publishes drafts it authored, it weakens its Section 230 position. So every draft needs a human confirmation [FACT](https://www.minclaw.com/legal-resource-center/what-is-section-230-of-the-communication-decency-act-cda/), and a confirmation queue *is* the maintenance chore. Polywork, a self-curated activity record, died of exactly this "nice to have" chore [FACT](https://x.com/multiplay3r/status/1873859669065978327).

## 4. Alternative thesis: Pholio is the live, unfakeable portfolio, proof that *this is really me, as I look and work today*
The core object is a **capture-verified portfolio**, not a credit:
- **Digitals and self-tapes are shot inside Pholio.** They carry liveness and an ID-matched face, are signed with C2PA at the moment of capture, and are timestamped. The page states their age ("Digitals taken 9 days ago, unretouched"). Instagram strips C2PA, so Pholio signs at capture and becomes the origin rather than a downstream copy [FACT on stripping](https://www.softwareseni.com/how-c2pa-content-credentials-work-and-what-their-limits-are/).
- **The rest of the portfolio is labeled honestly:** "Retouched editorial," "AI-assisted," "Captured in Pholio."
- **Every application or submission sends a frozen snapshot of the live portfolio.** The existing submission-snapshot and consent-record system already does this. Agencies and castings, including FWB's open call, which runs on Google Forms today, receive "real, current, ID-matched" applicants and can reject unverified ones in one click.
- **Credits survive only as a supporting section.** The record is a side feature. The proof of identity and currency is the product.
- **Buyer:** whoever drowns in applications and gets burned by catfish and AI photos. That means agencies (hundreds of applications a week, per the brief), event casting, and brand casting. They do not pay to search a graph. They get a free intake that is pre-filtered for reality. Money comes later from agency and casting workspace seats. No payments are touched.
- **Expansion beyond models:** photographers, MUAs and stylists get "captured on set" proof-of-work (BTS shots signed at capture, geotimed to the shoot). That is a far stronger artifact than a friend's MUTUAL click, and it doesn't need Meta's API.
- **Kill test:** run FWB's next open call through Pholio. Do at least 30% of casting decisions change because of a mismatch Pholio flagged, or because applications came in pre-vetted and casting moved faster? If not, this thesis is dead too.

It is attackable: liveness friction, a narrow model and actor core, and Meta Verified or CLEAR could copy the identity layer. But it sells the attribute buyers already pay for.

## 5. The question I most want answered
**Name one specific hirer role that, in the last 30 days, lost time or money because it could not verify a *credit*, as opposed to because the person was fake, didn't match their photos, or flaked. If nobody can, why is the credit the center of the product?**
