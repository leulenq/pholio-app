# Round 1 — Founder / Product: opening position

## 1. Verdict
The record of who did what is the right thing to build, but the thesis sells it to the wrong buyer: hirers don't search for it today. **Rebuild Pholio as the organizer's casting-and-credits desk, with the credit record falling out of work the organizer already has to do.**

## 2. My three strongest arguments

**A. Credits only survive when they're a by-product of required work, and FWB has required work running on Google Forms right now.**
[FACT] Every credit system that lasted rides on something people must do anyway: IMDb rides on contractual screen credits, Discogs on collecting and selling, union rosters on payroll, Session Studio on a QR check-in at the studio. The ones built on curating a record for its own sake (Polywork, The Dots, Clowdy) died or pivoted (R1 "Patterns" #1, #10). [FACT] FWB registers models, stylists, the beauty team, volunteers and designers through linked Google Forms. Its designer package already staffs hair, makeup, styling, dressers, casting and a models coordinator, so FWB already holds the full roster for every show (https://www.fashionweekbrooklyn.com/registration-process, R4 §3). [FACT] Our codebase already has two-stage selection, designer pick lists, offer/confirm, immutable consent snapshots and registry verification (brief). If FWB runs open call → selection → confirmed roster → consent on Pholio, the ISSUED credit costs FWB one click. Nobody has to maintain anything.

**B. The paying customer is the issuer, not a hirer's search seat.**
[FACT] Jaxsta had about 380M issuer-supplied "official" credits from the major labels and still shut down in 2025 because "the model does not scale" (R1 §3). [FACT] R4 found no survey or source showing a fashion or photo hirer asking whether a credit is verified. Commercial buyers shortlist from curated portfolio platforms (44%) and their own network (24%), and only 7% use open search (AtEdge, https://campaigns.at-edge.com/survey-results/). [FACT] What the ecosystem does pay for is organizer- and designer-side visibility and tooling: designers pay about $20k a year for Vogue Runway placement, and indie magazines charge Kavyar submission fees with mandatory team credits (R2 §1, R4 §2). [BET] Organizers of school shows, regional weeks and indie magazines will pay a flat subscription for intake, roster, consent and a published credit page, because it replaces Google Forms plus spreadsheets plus DMs. It touches none of their payment or contracting systems: a card on file, on the Stripe subscriptions we already run.

**C. Creatives will show up for circulation, not for verification.**
[FACT] Creatives' public outrage is about lost exposure and stripped tags (Quavo, Marie Claire), not about a lack of proof (R4 §2). Credits at small weeks live only in scattered Instagram tags (R2 §5). Instagram collabs cap at about 6 accounts, and a 15-minute FWB show involves dozens of people (R2 §3). [BET] The unit a creative shares is the **official show page**: every role, every person, issued by FWB, one link. Each name on that page opens their Pholio portfolio. Claiming it is not admin. [ASSUMPTION] Being listed by name next to "hair team" is worth more to an uncredited assistant than to the lead artist. That assistant is our most motivated user.

## 3. The claim most wrong in the thesis
**"The later business is paid search seats on the verified graph … on the IMDbPro model."** IMDbPro inherited trust from guild-mandated screen credits and sells contact data on top of huge organic traffic (R1 §1). IMDb itself refuses to verify modeling and commercial credits and quarantines them as "self-verified" (R3 §1). Models.com already sells $20/month search seats for the curated top tier (R2 §1). Our graph would cover the tier those buyers search least (R4 "Against" #5). A close second: **"drafted from Instagram tags."** The Basic Display API died in December 2024, so we can't reliably read other people's tags (R3 §4). And Pholio-authored drafts weaken our Section 230 cover (R3 §6). Cut it from v1.

## 4. Proposed revision (attack this)
**Pholio is where creative events cast, confirm and credit their people. Every confirmed participant gets a portfolio that the official record keeps current.**

v1 scope, which is all we ship before FWB's next season:
1. **Organizer desk:** open call form (replaces Google Forms), two-stage selection, offer/confirm, consent, call sheet, and a roster export. All of this is mostly built.
2. **Published show page** after the event, never before (minors rule, R3 §6): designer, looks, and every confirmed role, "Issued by Fashion Week Brooklyn, [show, date]." Talent who didn't pay is attested by the issuer (R3 ladder, Tier 3).
3. **Portfolio** for every participant, auto-created and claimed with an emailed link. It's free forever, and the issued credits sit at the top.
4. **CLAIMED credits** must link an artifact, are labeled "Added by [name]," and are never indexed. **MUTUAL is cut from v1.** It's the most gameable tier (R3 §3), and Instagram collabs already do it.
5. **No search product, no seats, no Instagram drafting.**

Issuer ladder: FWB, then the school partners already on FWB's own schedule (Rutgers Young Designers and the Pratt Creative Exhibition, R4 §3), then Fashion Week Queens, then indie magazines. Issuers are onboarded by hand, with legal-entity and event evidence.

Kill criteria for the first FWB season [BET, our numbers to hit]: ≥70% of FWB registrations come through Pholio; ≥40% of credited participants claim their profile within 14 days; ≥1 independent (non-BK Style) organizer runs an event on Pholio within 90 days; ≥1 organizer agrees to pay by month 6. Miss two of these and we stop.

## 5. The question I most want answered
**For creative and hirer: name one real moment in the next 90 days when a Brooklyn creative would send someone a Pholio show page or profile link instead of their Instagram handle. If no such moment exists, what single feature would create it?**
