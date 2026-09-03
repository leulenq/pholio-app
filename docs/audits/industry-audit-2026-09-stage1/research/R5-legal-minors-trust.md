# R5 — The legal, compliance and trust layer of modeling (2026)

Scope: minors; fees and scams; model-management regulation; AI / likeness / digital replicas; data
protection for measurements and body images; and the exact language legitimate players use and avoid.

All sources accessed **2026-09-03** unless noted. Verbatim quotes are marked with quotation marks and
attributed. Where I could not verify something from a primary source I say so explicitly.

---

## 1. Summary of the mental model

The practitioner's frame, stated plainly:

**A model is a worker, not a customer.** Every legitimate structure in this industry — statute, industry
code, agency policy — is built on one axiom: money flows *toward* the model. The agency's income is
"derived solely on work obtained for their models" (BFMA Code of Practice). The moment a business's
revenue comes from the talent rather than from the client who books the talent, it stops being an agency
in the industry's eyes and becomes, in regulators' eyes, an *advance-fee talent service* — a category
California criminalises and New York flags as "fraudulent or a scam."

**Representation is a fiduciary relationship, not a marketplace listing.** New York's Fashion Workers Act
(Labor Law Art. 36, eff. 19 June 2025) makes model management companies "deemed to have a fiduciary duty
to the models they represent." That is a much heavier obligation than a platform's terms of service. Any
product that sits between a model and an agency has to be extremely careful not to *look like* it is
performing representation, because performing representation carries registration, bonding, commission
caps, contract-copy duties and a private right of action.

**The three regulated verbs are: procure, represent, and charge.** Every statute in this space keys off
one of them. Procuring employment for an artist = talent agency licensing (CA §1700.5; NY GBL Art. 11).
Representing/managing models = model management company registration (NY Art. 36). Charging the artist
= advance-fee talent service (CA §1702) or the FWA's fee/deposit prohibition. A platform that hosts
portfolios and forwards submissions must be able to say honestly that it does none of the three.

**Minors change the category, not just the settings.** Under-18 work is not "adult modeling with a consent
checkbox." It triggers a separate licensing regime (NY Child Performer Permit; CA entertainment work
permit + Child Performer Services Permit; UK local-authority performance licences), a compulsory savings
regime (15% trust in both NY and CA), a chaperone regime, an education regime, and — in industry practice
— a *hard prohibition on the body data and imagery that adult modeling runs on*. The BFMA states flatly
that measuring anyone under 18 beyond height is inappropriate and that body/bikini/lingerie digitals of
under-18s are "unacceptable." A minor's profile is a fundamentally different data object.

**AI moved from "policy" to "statute" between 2024 and 2026.** NY now requires separate, explicit written
consent for a digital replica, specifying scope, purpose, rate of pay and duration; a power of attorney
*cannot* cover digital replicas at all. The EU AI Act's Art. 50 transparency duties apply from 2 Aug 2026.
UK agencies (Storm) now publish AI codes citing UK GDPR Art. 9 and EU AI Act Art. 50 and say model imagery
"must not be used in any AI training datasets." Any product feature that runs AI over a model's photos
lands squarely inside this, and inside special-category data analysis.

**Trust is verified, not asserted.** Since 21 Dec 2025 a New York model management company must carry a
DOL registration number, display its certificate on its website, and appear in a public registry
(79 active registrants as of the dataset's last update). That is the first machine-checkable legitimacy
signal this industry has ever had. Models and bookers will increasingly check it.

---

## 2. Vocabulary table

Evidence count = number of distinct primary sources in this research that use the term in this sense.

| Term | Meaning | Who uses it | Region | Ev. | Verbatim example + URL |
|---|---|---|---|---|---|
| **model management company** | The statutory term for a modeling agency in NY. Entity that manages models, procures engagements for a fee, or renders vocational guidance to models | NY DOL, statute, law firms | US-NY | 4 | "Model management company or model management group that engages in business in New York State or provides model management company services in New York State" — [dol.ny.gov FAQ](https://dol.ny.gov/new-york-state-fashion-workers-act-faqs) |
| **model management group** | "two or more model management companies that are majority owned by the same ultimate parent" | statute, NY DOL registry | US-NY | 2 | [NY Lab §1031](https://www.nysenate.gov/legislation/laws/LAB/1031); registry counts 3 groups vs 75 companies |
| **client** | "a person or entity that contracts for and manages the performance of modeling services" — the *brand/production*, NOT the model | statute, agencies | US/UK | 5 | [NY Lab §1031](https://www.nysenate.gov/legislation/laws/LAB/1031). Note: BFMA also uses "clients" for booking brands throughout its Code |
| **model** | "an individual who performs modeling services, regardless of employee or independent contractor status"; "a person who performs modeling services as part of their trade, occupation, or profession" | statute, DOL | US-NY | 3 | [NY Lab §1031](https://www.nysenate.gov/legislation/laws/LAB/1031) |
| **modeling services** | "Performing in photoshoots or in a runway, live, filmed, or taped appearance, including on social media" where the person "pose[s], provide[s] an example or standard or artistic expression, or represent[s] something…for purposes of display or advertisement" | NY DOL | US-NY | 2 | [dol.ny.gov FAQ](https://dol.ny.gov/new-york-state-fashion-workers-act-faqs) |
| **deal memo** | "a summary written in plain language which identifies the key components of any employment" incl. scope, pay, expenses; must be given **before work begins** and must state total compensation and payment term | statute, DOL | US-NY | 3 | [NY Lab §1031](https://www.nysenate.gov/legislation/laws/LAB/1031) |
| **digital replica** | "a significant, computer-generated or artificial intelligence-enhanced representation of a model's likeness" that substantially replicates their appearance | statute, DOL, agencies | US-NY | 4 | [NY Lab §1031](https://www.nysenate.gov/legislation/laws/LAB/1031) |
| **digital version / digital human / avatar** | UK industry term for the same thing: "'Digital Version' means Digital Human or Avatar and all data included" | BFMA | UK | 1 | [BFMA Code of Practice](https://bfma.fashion/bfma-code-of-practice/) |
| **mother agent** | The originating/scouting agency that places a model with other markets; fees "will only be paid directly to that model and not to their mother agent" wherever practical | BFMA, agencies | UK/global | 2 | [BFMA CoP](https://bfma.fashion/bfma-code-of-practice/) |
| **new face** | A newly signed, undeveloped model; a board name AND a lifecycle stage | agencies | UK/US | 4 | Storm, Premier, Milk, Elite all run "New Faces" boards |
| **advance-fee talent representation service** | CA statutory category: offers to procure employment/auditions/management while charging the artist for photos, websites, promo materials or training. **Flatly prohibited.** | CA statute, LA City Attorney | US-CA | 3 | "No person shall own, operate, or act in the capacity of an advance-fee talent representation service or advertise, solicit for, or knowingly refer a person to, an advance-fee talent representation service" — [Lab. Code §1702](https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=LAB&division=2.&title=&part=6.&chapter=4.5.&article=2.) |
| **talent listing service** | CA statutory category: for a fee, provides artists "a list of one or more auditions or employment opportunities" or a searchable database of them. **Legal but heavily regulated** | CA statute | US-CA | 2 | [Lab. Code §1701](https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=LAB&division=2.&title=&part=6.&chapter=4.5.&article=1.) |
| **talent scout** | "An individual employed, appointed, or authorized by a talent service, who solicits or attempts to solicit an artist" — a regulated role in CA | CA statute; agencies use it non-statutorily | US-CA / global | 4 | [Lab. Code §1701](https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=LAB&division=2.&title=&part=6.&chapter=4.5.&article=1.) |
| **Coogan account / trust account** | Blocked account holding ≥15% of a minor's gross earnings until 18 | SAG-AFTRA, CA/NY law, parents | US | 4 | NY: "At least 15% of the child model's earnings are put into that trust account" — [dol.ny.gov child model FAQ](https://dol.ny.gov/child-model-frequently-asked-questions) |
| **responsible person** | NY statutory term for the chaperone a child performer under 16 must have | NY DOL | US-NY | 2 | "A responsible person, designated by the parent or guardian, must be at work with the child model if the model is under age 16" — [dol.ny.gov](https://dol.ny.gov/child-model-frequently-asked-questions) |
| **chaperone / matron** | UK equivalent; must be local-authority approved unless the child's own parent/guardian | UK councils, BFMA | UK | 3 | "Under 18s must be chaperoned" — [BFMA CoP](https://bfma.fashion/bfma-code-of-practice/) |
| **BOPA (Body of Persons Approval)** | UK exemption letting an organiser use children across many performances without individual licences | UK councils | UK | 2 | [Birmingham CC](https://www.birmingham.gov.uk/info/50075/children_in_entertainment_and_employment/1096/body_of_person_approval_bopa_certificate_for_multiple_performances_involving_children) |
| **digitals / polaroids** | Unretouched, no-makeup, natural-light reference photos | agencies | global | 4 | Milk: "You don't need professional images and please don't retouch or use any filters" — [milkmanagement.co.uk/apply](https://www.milkmanagement.co.uk/apply) |

### Wrong / outsider terms practitioners flinch at

| Outsider term | Why it flinches | Evidence |
|---|---|---|
| **"get discovered"** | Consumer-facing scam-marketing register. BFMA's scam page describes exactly this pitch — selling "a space on their online website" with claimed agency connections. A real agency says "apply", "submit", "get scouted", never "get discovered". | [BFMA scams](https://bfma.fashion/avoiding-frauds-and-scams/) vs [getscouted.co](https://www.getscouted.co/): "Create your profile and get discovered at no cost" |
| **"boost your profile" / "premium listing" / "increase visibility to agencies"** | This is the paid-listing model the BFMA names as a scam and CA regulates as a *talent listing service*. | BFMA: "the agency that tries to sell you a space on their online website. They claim to have direct contact with any number of professional agencies and that they can get you placement. **They can't.**" |
| **"guaranteed" work / auditions / placement** | NYC's employment-agency regime prohibits agencies "from guaranteeing clients jobs". CA requires a service to state it is "PROHIBITED BY LAW FROM OFFERING OR ATTEMPTING TO OBTAIN AUDITIONS OR EMPLOYMENT FOR YOU". | [NYC DCWP](https://nyc-business.nyc.gov/nycbusiness/description/employment-agency-license); [Lab. Code §1703](https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=LAB&division=2.&title=&part=6.&chapter=4.5.&article=3.) |
| **"registration fee" / "activation fee" / "sign-up fee"** | Prohibited outright in NY; the BBB names these as the exact euphemisms scammers use ("'registration,' 'consultation,' or 'administrative' fees"). | [NY Lab §1035](https://www.nysenate.gov/legislation/laws/LAB/1035) |
| **"talent agency"** applied to a manager/platform | In CA only a licensed talent agent may procure employment. Misusing the word is itself the violation the §1703 notice is designed to cure. | [Lab. Code §1703](https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=LAB&division=2.&title=&part=6.&chapter=4.5.&article=3.) |
| **"model" used for a minor's public body data** | Adult board conventions (bust/waist/hips) applied to under-18s reads as a safeguarding failure. BFMA: "We believe it is inappropriate to measure any young person under the age 18 except for their height." | [BFMA CoP](https://bfma.fashion/bfma-code-of-practice/) |
| **"AI-analysed" / "AI-scored" photos, unqualified** | Storm's AI code requires prior written consent for "any capture, storage & manipulation of their data in any AI system/software". Unlabelled AI scoring of a model reads as the thing the industry just legislated against. | [Storm AI Code of Practice](https://www.stormmanagement.com/ai-code-of-practice/) |

---

## 3. Statutory / workflow state model

### 3.1 New York — Fashion Workers Act (Labor Law Ch. 31, Art. 36, §§1031–1039)

Signed 21 Dec 2024 (Ch. 676 of 2024), chapter-amended by S823 (2025). Duties/prohibitions live from
**19 June 2025**; registration obligations from **21 Dec 2025**.

**Who must register (§1032–1033).** "Model management company or model management group that engages in
business in New York State or provides model management company services in New York State." Explicitly
**not limited to NY-based companies** — DOL FAQ: "No. The Fashion Worker's Act requires that a model
management company register…if it engages in business in New York State or provides model management
company services in New York State."

Registration mechanics, verbatim from §1033 / DOL FAQ:
- All trading names, principal place of business, every NY office, TIN/EIN, five-year name history
  including predecessors and successors.
- Beneficial ownership: "a list of all persons or entities that beneficially own a five percent or greater
  interest" (private) / fifty percent (public).
- Fees: **$500** (≤5 employees) / **$700** (>5). Half refunded if withdrawn or denied.
- Bond: >5 employees must "deposit with the department a surety bond in the sum of fifty thousand dollars."
- Valid **two calendar years**; renew "at least 90 days before a current registration expires."

**Post-registration display duties (§1034; DOL).** Verbatim:
> "Post a physical copy of their Certificate of Registration in a clearly visible place in the office…
> Post a digital copy of their Certificate of Registration on their website.
> Include the model management company's registration number **in any advertisement seeking models to
> represent, including on the company's social media profiles**.
> Include the model management company's registration number in any contract with a model or client."

**Duties owed to models (§1034 / DOL "Responsibilities" page), verbatim:**
- Fiduciary: "be deemed to have a fiduciary duty to the models they represent and shall be required to act
  in good faith"; DOL renders it as "Act in the best interest of the models they represent…with honesty
  and integrity."
- Due diligence that work "does not put models at an unreasonable risk of danger."
- A written abuse/harassment policy shared **in writing** with every represented model, electronically or
  in print.
- "Use best efforts to secure paid work for represented models."
- **Deal memo before work begins**, stating "the model's total compensation and payment term."
- **Final booking agreement** "in the language requested by the model…within seven days of the end of the
  model's booking", with best efforts to sign before work begins.
- Deductions: clearly communicate before charges, and get "written approval from represented models, after
  providing an **itemized recitation as to how each item is to be computed**."
- Disclose "any financial relationship that might exist between the model management company and the client."
- Continue notifying **former** models in writing about royalties owed to them after representation ends.
- Digital replica: "Obtain clear written approval from the model to create or use a model's digital replica.
  **This approval must be separate from the representation agreement.** It must detail the scope, purpose,
  rate of pay, and length of time the replica will be used."

**Prohibitions (§1035), verbatim:**
1. "require or collect any fee or deposit from a model upon the signing of, or as a condition to entering
   into, any contract"
2. accommodation without prior written disclosure of the rate
3. "deduct or offset from a model's payment or compensation any fee or expense, including interest, other
   than the agreed upon commission"
4. advance travel/visa costs "without informed written consent from the model"
5. contract term "greater than three years"
6. auto-renewal "without the model's affirmative written consent"
7. "impose a commission fee greater than twenty percent of the model's payment or compensation"
8. discrimination/harassment on any protected status
9. "create, alter, or manipulate a model's digital replica using artificial intelligence without clear,
   conspicuous and separate written consent from the model"
10. (DOL) requiring a power of attorney as a condition of representation

**Power of attorney (§1036).** Must be "presented as an optional component", terminable by the model at any
time without cause, limited to modeling services, and explicitly excluding "the use of the model's digital
replica." Non-conforming POAs are "considered void as a matter of public policy" — including pre-existing
ones, per DOL FAQ.

**Client duties (§1037), verbatim in full** — see source; key items: 1.5× hourly over 8 hours in 24;
one 30-minute meal break over 8 hours; no unreasonable danger; Civil Rights Law §52-c compliance for
nudity; "allow the model to be accompanied by their agent, manager, **chaperone**, or other representative";
liability insurance; and prior written digital-replica consent "detailing the scope, purpose, rate of pay,
and duration of such use."

**Enforcement (§1038).** Civil penalties $3,000 first / $5,000 subsequent. Model complaints to the
Commissioner within **six years**; respondent has **20 days** or a rebuttable presumption of violation
attaches. Private right of action for §§1034–1035 violations: actual damages + attorneys' fees + liquidated
damages up to **100%**, or up to **300%** if willful. AG may sue for "repeated fraudulent or illegal acts…
or persistent fraud or illegality" without any model complaint. **Anti-retaliation (§1038(9)):** "No client,
model management company, or model management group shall be permitted to retaliate against a model for
exercising any of such model's rights under this article."

**⚠️ Contested: the "45 days" payment rule.** Press coverage (WWD, FashionUnited) repeatedly says the FWA
requires payment "within 45 days of completing a job." **I could not find 45 days anywhere in the enacted
text or in NY DOL guidance.** §§1031–1039 contain no payment-timing section; the DOL "Responsibilities"
page contains no such duty; the string "45 day"/"forty-five" does not appear in the DOL FAQ. What the
enacted law actually does is require the *deal memo to state a payment term* and give the model a remedy
if it is missed — DOL FAQ: "your model management company is required to provide you with a deal memo that
specifies the payment term. If your client or model management company fails to disburse payment to you
within the term specified, you have the right to file an action in court…" **Treat 45 days as a bill-stage
provision that did not survive, and do not build product copy on it.**

**Public registry.** [data.ny.gov `hder-iq9y`](https://data.ny.gov/Government-Finance/Model-Management-Registry-Three-Year-Window/hder-iq9y/data_preview) — columns verbatim: Certificate Number, Business Name, DBA, Phone,
Address1, Address2, City, State, Zip Code, Model Management Business Type, Group Companies, Group
Locations, Additional Locations, Issue date, Expiration date, Status. **79 rows, all "Active"; 75 "Model
Management Company", 3 "Model Management Group"** (last updated 2026-08). Certificate numbers look like
`26-675DJ-LSFW`; two-year validity is visible in issue/expiration pairs.

### 3.2 California

**Talent agency licence (Lab. Code §1700 series).** Only a licensed talent agent may procure employment
for an artist. This is the hinge the whole Krekorian scheme swings on.

**Krekorian Talent Scam Prevention Act (AB 1319, eff. 1 Jan 2010; Lab. Code Ch. 4.5, §§1701–1704.9).**
Applies to all artists of any age, not just children.

- **§1701 definitions.** *Talent listing service*: for a fee, provides "a list of one or more auditions or
  employment opportunities" or database search for them. *Talent counseling service*: "career counseling,
  vocational guidance, aptitude testing, or career evaluation as an artist" for compensation without
  managing career development. *Talent training service*: "lessons, coaching, seminars, workshops, or
  similar training." *Talent scout*: "An individual employed, appointed, or authorized by a talent
  service, who solicits or attempts to solicit an artist."
- **§1702 prohibition, verbatim:** "No person shall own, operate, or act in the capacity of an advance-fee
  talent representation service or advertise, solicit for, or knowingly refer a person to, an advance-fee
  talent representation service." The definition catches anyone who offers to procure employment/auditions
  /management/agent-introductions *while charging the artist* for photographs, websites, promotional
  materials or training.
- **§1703 contract requirements.** Written contract; service description and duration; all fees and
  payment dates; the $50,000 bond disclosure; a **10-business-day cancellation right with full refund**
  ("within 10 business days from the above date or the date on which you commence utilizing the services",
  refunded "within 10 business days after delivery of the cancellation notice"); pro-rata refund after
  that window.
- **The statutory capital-letter notice (§1703), verbatim:**
  > "(Name of talent service) IS A TALENT COUNSELING SERVICE, TALENT LISTING SERVICE, OR TALENT TRAINING
  > SERVICE (whichever is applicable). THIS IS NOT A TALENT AGENCY CONTRACT. ONLY A TALENT AGENT LICENSED
  > PURSUANT TO SECTION 1700.5 OF THE LABOR CODE MAY ENGAGE IN THE OCCUPATION OF PROCURING, OFFERING,
  > PROMISING, OR ATTEMPTING TO PROCURE EMPLOYMENT OR ENGAGEMENTS FOR AN ARTIST. (Name of talent service)
  > IS PROHIBITED BY LAW FROM OFFERING OR ATTEMPTING TO OBTAIN AUDITIONS OR EMPLOYMENT FOR YOU."
- **Listing-service specific (§1703.4).** May not own or hold a financial interest in a competing service
  category; must remove an artist's information **within 10 days** of request.
- **Bond.** $50,000 posted with the Labor Commissioner before advertising or operating.
- **Remedies (§1704 et seq.).** Willful violation is a **misdemeanor** (up to 1 year, up to $10,000, or
  both), restitution taking precedence over fines. AG/DA/city attorney may sue or enjoin (§1704.1).
  Private action (§1704.2): damages or injunction, mandatory fees to prevailing plaintiff, and
  **"The amount awarded for damages…shall be not less than three times the amount paid by the artist…to
  the talent service"** — statutory treble minimum.

**Coogan (Family Code §§6750–6753; Lab. Code §151).** Court shall require **15% of the minor's gross
earnings** be set aside by the employer into a blocked trust until 18 (extras/background exempted).
Employer deposits "within 15 business days after receiving a true and accurate copy of the trustee's
statement…a certified copy of the minor's birth certificate, and, in the case of a guardian, a certified
copy of the court document appointing the person as the minor's guardian."

**Child Performer Services Permit (Lab. Code ch. 5, §1706).** "No person shall represent or provide
specified services to any artist who is a minor, under 18 years of age, without first submitting an
application to the Labor Commissioner for a Child Performer Services Permit and receiving that permit."
Requires DOJ/FBI fingerprint background check; the permit issues on a determination the person is not
required to register under Penal Code §§290–290.006; biennial renewal without re-fingerprinting.
**Practical upshot: an individual who represents minors in California needs a personal, criminal-background
-checked permit.** Separately, a minor working in CA entertainment needs an entertainment work permit.

### 3.3 New York minors — Child Model Law (2013 amendment to Labor Law Art. 4-A, §§150–154)

Signed 21 Oct 2013, effective 20 Nov 2013; extended child-performer protections to **print and runway
models under 18**. Verbatim / near-verbatim from NY DOL and Cowan DeBaets:

- **Permit:** "Child models must have a Child Performer Permit issued by the Department of Labor before
  they begin work." Guardians are obligated to secure it.
- **Employer side:** employer must obtain a **Certificate of Eligibility** (three years, $350) and notify
  DOL of intent to employ minors.
- **Trust:** "At least 15% of the child model's earnings are put into that trust account", held until 18.
- **Chaperone:** "A responsible person, designated by the parent or guardian, must be at work with the
  child model if the model is under age 16"; that person must be 18 or older.
- **Education:** "Employers must provide for a child performer's education while the child's school is in
  session and when the child is not otherwise receiving instruction due to his/her employment schedule" —
  averaging at least three hours per school day weekly.
- **Hours:** "The total daily and weekly hours worked by a child model must be limited, depending on the
  age of the child and whether or not the child is required to attend school."
- **Guardian obligations:** provide identification, proof of education status, establish the trust account,
  submit health documentation, and ensure the child maintains "satisfactory academic performance or is no
  longer required by law to be in school."

Regulatory detail lives in **12 NYCRR Part 186** ([forms.labor.ny.gov/WP/Part186.pdf](https://forms.labor.ny.gov/WP/Part186.pdf)) — not fetched in full here.

### 3.4 UK minors

- Child performance licences are issued by the **child's home local authority**; paid photographic
  modelling falls within the licensable regime (Children (Performances and Activities) (England)
  Regulations 2014). BFMA simply instructs members to "Ensure all legal requirements for under age
  modelling are followed" and links [gov.uk/child-employment](https://www.gov.uk/child-employment).
- **Chaperones:** "All children who need a performance licence must be chaperoned by either the child's
  parents/legal guardian or an approved adult (chaperone/matron)." Relatives cannot chaperone unless
  locally approved. Ratio 1:12 under the 2014 Regulations, "although best practise is 2:12."
- **BOPA:** organisation-level approval replacing individual licences for large numbers of children
  (20+), conditional on a track record (e.g. Birmingham: six prior performances without concerns) and an
  approved chaperone in charge throughout.
- **DBS:** BFMA members "are required to ensure all relevant personnel have current DBS certification
  where any supervised teaching, training or instruction of under 18 models is concerned."

### 3.5 France (relevant to data + imagery)

- **Medical certificate (Arrêté du 4 mai 2017).** A doctor's certificate is required to work as a model
  in France, "attest[ing] that the overall evaluation of the model's state of health, assessed in
  particular regarding their body mass index, is compatible with exercising their profession." Issued for
  persons over 16; valid up to two years. **This means French agencies structurally hold health data
  about models** — Art. 9 GDPR special category, by definition.
- **"Photographie retouchée" labelling (eff. 1 Oct 2017).** Commercial photographs where a model's body
  appearance has been slimmed or thickened must carry the label "photographie retouchée", "presented in
  an accessible and visible way" and "clearly distinguished from the other parts of the advertising."
  Fines up to €37,500 per violation.
- **Norway (Marketing Act amendment, 2021).** Retouched body images in paid/sponsored posts must carry a
  standardised government-designed label; escalating fines and, in extreme cases, imprisonment.

**On "unretouched" as a verified claim:** I found **no** agency or platform operating "unretouched" as a
*verified* badge. The legal architecture runs the other way — it labels the *retouched*, not certifies the
un-retouched. What agencies do use is an **instruction at submission time**: Milk — "please don't retouch
or use any filters"; Storm — "We prefer natural snapshots taken in daylight…Please ensure your child is
not wearing makeup"; Elite — "Do not wear makeup. Take images in front facing natural daylight." Treat
"unretouched" as a *submission requirement*, never as a product's verified claim.

---

## 4. Data conventions and who sees what

**Adult vs minor is the sharpest data line in the industry.**

| | Adult model | Under-18 |
|---|---|---|
| Measurements | Bust/chest, waist, hips, height, shoe, hair, eyes shown publicly on agency boards | **Height only.** BFMA: "We believe it is inappropriate to measure any young person under the age 18 except for their height." Kids' cards/profiles carry age, height, clothing size, shoe size |
| Body imagery | Swim/underwear digitals may be requested to assess body type (BFMA explicitly permits this and explicitly forbids nudes) | **Prohibited.** BFMA: "It is unacceptable to take, send or receive body, bikini or lingerie digitals of any young person under the age of 18. Members will actively discourage third parties from submitting similar imagery." Milk's public instruction: "Don't submit any lingerie, swimwear, or bikini images." |
| Who communicates | Model directly | Guardian. BFMA: "direct contact with any model under 18 can only be done with parental consent." Elite: "your parent/legal guardian contact information will be the only ones we will utilise, should we intend to contact you" |
| Who signs | Model | "All agreements for any model who is under 18 must be signed by the parent/s or guardian" (BFMA). "On attaining the age of 18, all models should re-sign their model agreements on their own behalf." |

**Data-protection posture (UK/EU).**

- **Photographs are not automatically special category.** ICO, tracking Recital 51: photographs "will only
  constitute special category data if they fall within the scope of biometric data, such as their use for
  facial recognition." But "photographs can disclose or be used to infer special categories of data such
  as racial or ethnic origin, health, religion or sexual orientation." And "If biometric data can be used
  to infer special category personal data…such biometric data may be special category personal data in and
  of itself."
- **Consequence for a modeling product:** a plain portfolio photo is ordinary personal data. The moment
  you run *facial* processing for identification, or derive/store attributes like ethnicity, body
  composition or health inferences, you are in Art. 9 and need an Art. 9 condition (in practice, explicit
  consent) **on top of** an Art. 6 basis. Measurements alone are ordinary personal data; a BMI-linked
  health certificate (France) is health data and is Art. 9 outright.
- **Storm's published UK privacy posture** ([privacy notice](https://www.stormmanagement.com/legal/privacy-notice/)) is a usable template, verbatim:
  - "Our lawful bases for processing include contractual necessity, legitimate interests, and legal
    obligations. Where required, we may rely on consent (e.g. for marketing or under-18 applications)."
  - "Applications from individuals under 18 must be completed by a parent or legal guardian who provides
    clear consent. If an applicant is shortlisted, we may request additional verification of age and
    parental consent as part of our safeguarding procedures. All application data, including photos and
    personal information, is automatically deleted within 30 days if the application is not progressed."
  - Storm's under-18 FAQ repeats it model-facing: "All application data, including photos, is stored
    securely in our online portal and is used only to assess suitability for representation. If your
    child's application is unsuccessful, all data is automatically deleted after 30 days."
- **Elite's EU-shaped consent stack** ([get-scouted](https://elitemodelmanagement.com/get-scouted.web)) — verbatim, and the strongest single specimen of
  compliant minor-handling I found:
  > "in case you are under the age of 18, your application must be approved by your parents/legal guardian.
  > We will not be in a position to consider your application, unless we receive your parental/legal
  > guardian's approval… In case of his/her refusal, or in the event the approval is not granted within
  > 15 days from our request, we will delete all the data supplied by you in the application… we will
  > require that your parent/legal guardian attend any meeting we might propose to you in the future."
  >
  > "We will utilise the information, the photographs and the personal data provided by you for the sole
  > scope of a preliminary evaluation of your potential as a model… please verify you are legally in a
  > position to provide us with the photos you are annexing herewith and that no third party (the
  > photographer or others) may object to this."
  >
  > "Your personal data will be stored in the EU… The storage and the treatment of your data will last for
  > the period that is reasonably necessary in order to do the evaluation described above."
  >
  > Marketing and third-party transfer are **separate, explicitly non-compulsory** opt-ins: "I understand
  > and agree that, upon my acceptance (**that is not compulsory**)…"

**Public profile vs client package.** Direct evidence is thin and I am flagging it as such. What I can
evidence: adult agency boards publish measurements openly; kids' boards publish age/height/clothing/shoe
only; Wilhelmina's site gates some content behind "Enter password to access content", indicating a
client-only layer exists. The confidential layer in practice is availability, rates, usage terms and
contact routing — none of which appear on public boards. I did not obtain a primary source that
enumerates a client package's contents.

---

## 5. Trust and legitimacy signals — what legitimate players say and refuse to say

### 5.1 The "we never" list (verbatim, 6 sources)

- **BFMA:** "Legitimate model agencies will never ask you for money. If an agency does ask for a fee when
  you sign up with them or even at a later stage, you should be alarmed as it is not common practice for
  legitimate modelling agencies."
- **BFMA:** "Overall, a legitimate modelling agency should not be charging their models anything up-front.
  Legitimate agencies make their money once they have booked their models in modelling jobs. In other
  words, none of their income should come directly from their models, only from clients who want to book
  them."
- **BFMA:** "legitimate modelling agencies should never ask you to pose for nude photographs."
- **BFMA:** "No agency will ever ask for your contact details or, particularly, any banking information
  on-line. Anyone who does is a fraud."
- **Premier Model Management:** "scouts and agents from our organisation will never: – Request payment to
  become a model – Request nude or lingerie photos – Need you to submit a portfolio of modelling work to
  apply".
- **Elite Model Management:** "Our team of scouts and agents will never: Request payment for
  representation / Request nude or lingerie photos."
- **Heroes Model Management:** "We will never ask for pictures of you in your underwear or nude, and will
  never request a fee to represent you."
- **Storm Models:** "No, there is no fee to apply or to sign with Storm Models. We do not charge any
  application or registration fees."
- **FTC:** "Paying to get a job is always a sign of a scam. Real companies won't ask you to pay anything
  upfront." / "A real talent agency finds jobs for you and pays you after the client pays them."
- **NY Assembly Consumer Affairs:** legitimate agencies "never charge advance fees for photos or headshots,
  resumes, acting lessons, interviews, or auditions"; they "don't advertise through the mail or in
  newspapers, nor do they scout for talent in shopping centers"; they charge "a flat percentage of the
  performer's earnings, usually around ten percent"; they don't require clients to "use a specific vendor
  or photography service."
- **NY DOL, FWA FAQ:** "Q: I responded to an advertisement to provide modeling services and was told I need
  to pay a fee or place a deposit to hold my spot to be considered. Do I have to pay? **A: This
  advertisement could be fraudulent or a scam.**"
- **BBB (secondary, via aggregators):** disreputable agencies ask for up-front money "which may be called
  'registration,' 'consultation,' or 'administrative' fees."

### 5.2 Scam-coded phrases legitimate players avoid

Compiled from BFMA, FTC, NY Assembly, and the FTC's own complaint language:

| Phrase / pattern | Source flagging it |
|---|---|
| "get discovered" / "be seen by hundreds of agencies" | BFMA on-line scams section: selling "a space on their online website… They claim to have direct contact with any number of professional agencies and that they can get you placement. They can't." |
| "guaranteed" work / auditions | BBB; NYC DCWP prohibits agencies "from guaranteeing clients jobs"; CA §1703 forces the opposite statement |
| "premium membership" gating job access | FTC v. Explore Talent: "only its pro members could apply for potential job opportunities available on the site" — $39.95/month |
| Naming a real casting director / production to close a sale | FTC v. Explore Talent: telemarketers claimed "the casting director for a sequel of the movie 'Jack Reacher' wanted the user to audition… but only if the user signed up for a pro membership first" |
| "you've got the look" | FTC 1999 Virginia modeling agencies action — the literal street pitch, charged as a lure |
| "highly selective" / "acceptance is extremely limited" | FTC 1999: falsely claimed they were "highly selective in their scouting, screening and review process" and that "acceptance into their training program is extremely limited" |
| Implying past placements in "popular movies, tv shows, or print ads" | FTC 1999 |
| Claiming income comes from commissions when it doesn't | FTC 1999: falsely stated their "primary source of income comes from the commissions on the modeling and acting jobs they get for consumers" |
| Pay "to secure your spot" / for test shoots / headshots | FTC 2025 casting-call alert |
| Advance fees for "expensive photography packages, website services, or open call notices" | NY Assembly Consumer Affairs |
| Hotel-based "open calls" claiming agency affiliation | BFMA: "It is prohibited by law to charge up-front fees and these set ups usually do." |
| Lookalike email domains / redirection to Gmail/WhatsApp/Telegram | Premier; BFMA; Heroes |

**Contrast case, verbatim, for calibration.** [getscouted.co](https://www.getscouted.co/) — a paid-listing app — uses nearly every
flagged register at once: "The first app that directly connects aspiring models with legitimate agencies";
"Create your profile once and **instantly become visible to over 1,000 legitimate modeling agencies
worldwide**"; "Create your profile and **get discovered** at no cost. Premium features available when
you're ready to level up"; "optional premium features for models who want to **boost their visibility**".
It does add genuine mitigations — "Every agency on our platform goes through a verification process. We
check their business credentials, reputation, and track record… We continuously monitor agencies and remove
any that don't meet our standards" and "Users between 16 and 18 years old can use Get Scouted with
verifiable consent from a parent or legal guardian. Users under 16 are not permitted to use the service."
**This is exactly the product shape a compliance review will scrutinise:** the mitigations are real, but
the marketing verbs are the ones the BFMA names as the scam pitch.

### 5.3 How the paid-listing model is actually treated

- **Legally (CA):** a *talent listing service* is **lawful but regulated** — contract in writing, the
  capital-letter §1703 notice, $50,000 bond, 10-business-day full-refund window, no financial interest in
  a competing service category, removal of the artist's info within 10 days on request. It becomes
  **illegal** the moment it also offers to procure employment/auditions/representation — that converts it
  into an advance-fee talent representation service under §1702, with misdemeanour exposure and treble
  damages.
- **Legally (NY):** the FWA prohibition is narrower but sharper — no fee or deposit "upon the signing of,
  or as a condition to entering into, any contract or agreement" with a model management company. If a
  platform is a model management company, a paid tier tied to representation is straightforwardly barred.
- **Reputationally:** the BFMA condemns it without qualification for adult fashion. But note the single
  carve-out in the BFMA's own Code, which is the most interesting nuance in this whole research:
  > "Agents income is derived solely on work obtained for their models. **A child agency, which finds
  > acting as well as modelling work, may charge a fee for inclusion in a directory or website.**"
  So the UK industry body itself concedes that directory fees are a legitimate, established practice in the
  *child acting/modelling* segment — the one segment where the fee is paid by a parent. This is genuinely
  contested territory, not a settled prohibition.

### 5.4 Verifiable trust signals a working model or booker actually checks

1. **NY DOL registration number and public registry entry** — a certificate number like `26-675DJ-LSFW`, an
   Active status, and a matching entry in the [public dataset](https://data.ny.gov/resource/hder-iq9y.json). Required on the company's website, in
   any ad seeking models, and in every model and client contract.
2. **Certificate of Registration posted on the website and in the office.**
3. **Trade-body membership** — BFMA membership in the UK; the BFMA explicitly positions itself as the
   verification shortcut: "you can be secure in the knowledge that BFMA agents are clearly legitimate."
4. **Email domain discipline** — Premier: "all Premier employees (including our scouts) will correspond via
   an email domain ending with premiermodelmanagement.com" and warns specifically about being redirected
   to "a Gmail, iCloud, Yahoo or other email client or a messaging app/social media channel", and about
   replies from generic mailboxes: "Always check the 'reply to' email address ends with
   premiermodelmanagement.com and is coming from a named individual, rather than 'info or safety.'"
5. **Named, listed verified social handles** — Premier publishes its exact handles on the safety page.
6. **A real board** — models with agency-hosted portfolios, credits, and current fashion-week presence.
7. **A dedicated safety contact** — Premier runs `safety@premiermodelmanagement.com` plus a phone number.
8. **CA:** Labor Commissioner talent-agency licence; Child Performer Services Permit for anyone
   representing minors; the $50,000 bond.
9. **Software provenance** — Mediaslide, Syngency and similar agency-software footers in page source are a
   weak but real signal of an operating agency back-office (observed on Wilhelmina, Premier, Milk).

### 5.5 Transparency norms for outcome communication

This is the most product-relevant section. The industry norm is **non-committal, no-outcome, no-timeline**:

- **Milk (verbatim):** "Your application has been submitted and thank you for your interest in The MiLK
  Collective. Due to the high number of applications that we receive daily, we are unable to respond to
  every application individually. A member of our team will be in touch if we wish to take your
  application further."
- **Elite (verbatim):** "We are always looking for new faces/new looks. If you believe you have the
  necessary skills and physical characteristics, please feel free to submit your application. We will do a
  first screening based on the information supplied by you and, **should we deem it interesting to go
  further**, we will propose you a meeting in our offices." And: "Thanks, the application will be reviewed
  as soon as possible."
- **Storm (verbatim, under-18):** "If selected, you and your child will be invited for a follow-up meeting
  or video call where we will explain the next steps in detail."
- **BFMA ethical scouting (verbatim):** "It must be made clear that modelling is a career and not a hobby.
  It must be taken seriously. **No individual must be led to have unreasonable expectations.**"
- **BFMA (verbatim):** members must "exercise care and sensitivity when managing career expectations and
  releasing models from agreements."

What is prohibited on the other side of that line, with authority:
- **Guaranteeing a job** — NYC DCWP licensing prohibits it for employment agencies.
- **Stating or implying that a named client/casting is interested when it is not** — FTC v. Explore Talent
  is precisely this fact pattern, settled with a $500,000 civil penalty (suspended to $235,000).
- **Implying selectivity you don't practise, or a placement record you don't have** — FTC 1999 Virginia
  action.
- **Implying commission-based economics while actually living off talent fees** — FTC 1999 action.
- **Charging for the *chance* of being considered** — NY DOL FAQ: "This advertisement could be fraudulent
  or a scam."

Note also the COPPA overlay: Explore Talent "collected the personal information of more than 100,000
children" and was charged for failing to obtain verifiable parental consent and for a privacy policy
falsely stating it did not knowingly collect data from under-13s. **Any talent platform that lets minors
create profiles is a COPPA target if it accepts under-13s at all.**

### 5.6 AI, likeness and retouching — what legitimate consent looks like

**Statutory floor (NY FWA):** consent for a digital replica must be
(a) **written**, (b) **clear and conspicuous**, (c) **separate from the representation agreement**, and
(d) specify **scope, purpose, rate of pay, and duration**. A power of attorney can never cover it. Prior
POAs purporting to cover digital replicas were void from 19 June 2025. Per secondary legal commentary,
routine retouching is outside the "digital replica" definition — the statutory hook is a "significant"
AI-enhanced representation that substantially replicates the model's likeness — but I did not verify the
carve-out's exact statutory wording and flag it as **needing primary confirmation**.

**DOL's own worked example (verbatim):** "I have photos of a model from a past photo shoot that would be
perfect for a new advertising campaign, if I adjust them with some AI manipulation. The model agreed to
the use of AI for the previous job, but our contract did not cover future campaigns. Do I have to ask the
model to approve this even though I already have the photos I need?" — the framing itself answers it:
**consent is per-use, not perpetual.**

**Industry ceiling (Storm AI Code of Practice, verbatim, developed against "the Data Protection Act 2018,
the UK General Data Protection Regulation (2021, Article 9), and the EU Artificial Intelligence Act (2024,
Article 50)"):**
- "AI must not be used to mislead audiences — particularly through synthetic / AI-generated digital
  humans, undisclosed digital replicas of models, manipulated likenesses or fabricated endorsements."
- "Agencies, clients and partners must be transparent about their use of AI – disclosing both to consumers
  when AI-generated models or enhancements are used and to each other when sharing materials that include
  AI/CGI-generated or AI-modified content."
- "AI must not discriminate or introduce bias **in casting**, representation or client deliverables."
- "individuals must retain ownership of & have complete access to any personal data (including but not
  limited to biometric data and any digital version or twin generated from that data)."
- **"Prior written consent must be obtained from the Model / Talent prior to any capture, storage &
  manipulation of their data in any AI system/software, as must any commercial usage of that data by a
  client or third party."**
- **"Data collected from a model or talent through photography or videography must not be used in any AI
  training datasets."**
- "Only AI tools that have been **pre-disclosed and properly vetted** for safety, security and ethical use
  should be used in casting, retouching, talent management or content creation."
- "Human oversight and accountability must always be maintained." / "AI should support and not replace
  human talent."

**BFMA "My Digital Human Model — A Statement of a Model's Rights"** (10 rights, first-person, verbatim
headings): TRANSPARENCY, REPRESENTATION, SECURITY, EXPLOITATION, PERMITTED USE/USAGE, DATA PROTECTION,
MISUSE, VALUE, OWNERSHIP, AUTONOMY. Key clauses: "I have the right to be aware, at all stages, of the
terms, creation and use of my digital version"; "I will not…allow my personal data nor a representation of
my physical self be exploited in a digital form, except as approved in writing by me"; "Where my personal
data is captured and used, all parties will comply with data protection and privacy laws…including but not
limited to GDPR"; "My digital version(s) cannot exist beyond me unless stated otherwise by me or my next of
kin"; "I must always maintain the position to make informed, independent and uncoerced decisions on my own
accord, **or by my parental guardian in whom I trust**."

**Anti-scraping stance.** Premier publishes a standalone "Anti-AI Data Mining" agreement prohibiting
"automated scraping, extraction, collection, or analysis of data from the Website without the explicit
written permission of the Website Owner… includ[ing] the use of artificial intelligence, machine learning
algorithms, or any other automated means", with LCIA arbitration seated in London. **Agencies now treat
their own boards as protected assets against AI ingestion** — relevant to any product that imports agency
data or presents itself as aggregating agency-adjacent content.

**EU AI Act Art. 50** applies from **2 August 2026** (i.e. now). Deployers creating deepfakes must disclose
that content is artificially generated or manipulated, "upon first exposure at the latest in a clear and
distinguishable manner", understandable "without need for any specific technical tools"; providers of
generative systems must mark outputs "in a machine-readable format and detectable as artificially
generated or manipulated."

**What a legitimate "consent for AI analysis of photos" would have to look like**, synthesising the above:
1. **Separate** from account signup and from any representation/portfolio terms — a distinct affirmative
   act, not bundled, not pre-ticked (FWA §1034/§1035 pattern; Elite's "that is not compulsory" pattern).
2. **Specific as to purpose** — Elite's "sole scope of a preliminary evaluation of your potential as a
   model" is the model to copy. Not "to improve our services."
3. **Names the system** and states human oversight ("pre-disclosed and properly vetted", "Human oversight
   and accountability must always be maintained").
4. **Explicit no-training commitment** — "not…used in any AI training datasets" is now the published
   industry expectation, not a nicety.
5. **Explicit no-digital-replica commitment**, or, if replicas are in scope, a wholly separate consent
   carrying scope/purpose/rate of pay/duration.
6. **Art. 9 handling** if any derived attribute could reveal ethnicity, health or body composition:
   explicit consent, or don't derive it.
7. **Withdrawable, with deletion** and a stated retention period (Storm: 30 days for unsuccessful
   applications; Elite: 15 days for absent guardian approval).
8. **Never available to a minor's account without the guardian being the consenting party.**
9. **Output framed as an internal aid, never as a verdict about the person** — an AI "score" surfaced to a
   model reads as an implied-outcome claim, which is the FTC's exact enforcement lane, and as bias risk
   under Storm's clause 5.

---

## 6. Deliverable A — Compliance language checklist for a talent platform

### MUST NOT say or imply
- ❌ "Get discovered", "be seen by hundreds of agencies", "instantly visible to N agencies".
- ❌ Any guarantee, or near-guarantee, of work, auditions, agency interest, or representation.
- ❌ "Boost your profile to agencies", "premium listing", "featured placement", "priority review" —
  anything selling *rank in front of agencies*. This is the exact BFMA-flagged pitch and, in California,
  converts you into a regulated talent listing service (and, if you also offer to procure work, into a
  prohibited advance-fee talent representation service).
- ❌ Naming a real agency, brand or casting as interested unless it demonstrably is (FTC v. Explore Talent).
- ❌ "Registration fee", "activation fee", "signing fee", "deposit to hold your spot", "consultation fee",
  "administrative fee" — banned in NY, named by BBB as the scammer's euphemism set.
- ❌ Gating the ability to *apply* behind payment.
- ❌ Requiring a paid photoshoot, portfolio, headshot package, training or website as a condition of
  anything.
- ❌ Calling yourself a "talent agency", "agent", or describing what you do as "getting you work",
  "placing you", or "submitting you for jobs" unless licensed to do so.
- ❌ Predicting outcomes ("high chance of signing", "strong match", "top 5% of applicants") in
  talent-facing copy.
- ❌ Nude / lingerie / swimwear requests to any user, and any such request at all to an under-18.
- ❌ Requesting banking details online at application stage.
- ❌ "Unretouched, verified" as a product claim.

### MUST say, or be able to say
- ✅ "There is no fee to apply." / "We do not charge any application or registration fees." (Storm's
  wording.)
- ✅ "We are not a modeling agency and we do not procure work." If any paid tier exists in California,
  the §1703 capital-letter notice becomes near-mandatory reading for your contract.
- ✅ Non-committal outcome copy: "We are unable to respond to every application individually. A member of
  our team will be in touch if we wish to take your application further." (Milk.) / "should we deem it
  interesting to go further" (Elite).
- ✅ Purpose limitation, verbatim-grade: "used only to assess suitability for representation" (Storm).
- ✅ Stated retention and auto-deletion: "automatically deleted after 30 days" if unsuccessful.
- ✅ Domain/identity anti-impersonation notice, naming the exact domain and official handles (Premier).
- ✅ A named safety contact route.
- ✅ Where agencies are listed: how they are verified, and that verification is ongoing.
- ✅ If a NY-registered model management company uses the product: surface its **registration number** and
  make it checkable against the public registry.

### Terminology corrections
- Use **"apply" / "submit"**, never "get discovered".
- Use **"agency" / "model management company"**, never "talent agency" unless licensed.
- Use **"client"** for the booking brand, never for the model.
- Use **"parent or guardian"** (the dominant construction across BFMA, Storm, Milk, Elite, Premier,
  Heroes and NY DOL). "Legal guardian" appears in Elite and Storm; "parent/s or guardian" in BFMA;
  "responsible person" is NY's statutory chaperone term.
- Use **"deal memo"**, **"booking agreement"**, **"digitals"**, **"new face"**, **"mother agent"**.
- Never render an under-18's bust/waist/hip anywhere.

---

## 7. Deliverable B — Obligations that flow from minors

If a product touches under-18 talent, these follow. Ordered by how early they bite.

1. **Set and enforce a minimum age.** Evidence spread: Storm accepts 15–18; IMG's Get Scouted permits
   16–18 with verifiable guardian consent and bars under-16s; getscouted.co matches that (16–18 with
   verifiable consent, under-16 barred); US kids agencies take infants upward through parent-run
   accounts. **Under-13 acceptance triggers COPPA verifiable-parental-consent obligations** — the exact
   charge in FTC v. Explore Talent.
2. **The guardian is the account holder, not a co-signer.** Storm privacy notice: "Applications from
   individuals under 18 **must be completed by** a parent or legal guardian who provides clear consent."
3. **The guardian is the only communication channel.** Elite: "your parent/legal guardian contact
   information will be the only ones we will utilise, should we intend to contact you to propose a
   meeting." BFMA: "direct contact with any model under 18 can only be done with parental consent."
4. **Time-bound guardian verification with deletion on failure.** Elite: approval not granted "within 15
   days from our request" ⇒ "we will delete all the data supplied by you."
5. **No body data.** Height only. No bust/waist/hips. (BFMA.)
6. **No body imagery.** No bikini/lingerie/underwear/nude digitals, and actively discourage third parties
   from submitting them. (BFMA; Milk states it publicly at submission.)
7. **Guardian signs every agreement; re-sign at 18.** (BFMA.)
8. **Chaperone facts must be capturable and surfaced**: NY requires a "responsible person" 18+ for models
   under 16; BFMA requires under-18 chaperoning at tests and go-sees; UK licences require an approved
   chaperone at 1:12 (best practice 2:12); FWA §1037(5) obliges *clients* to allow the chaperone on set.
9. **Permits are a hard gate, not metadata.** NY: Child Performer Permit before work + employer
   Certificate of Eligibility. CA: entertainment work permit + a Child Performer Services Permit for
   anyone *representing* the minor (criminal background checked). UK: local-authority performance licence
   or BOPA.
10. **Trust account, 15%, both NY and CA.** Any product that models a minor's earnings must not present
    gross as available.
11. **Education and hours constraints** — tutoring while school is in session, ~3 hrs/school day averaged
    weekly (NY); daily/weekly caps by age and school status.
12. **DBS / background checks** for anyone teaching or instructing under-18 models (BFMA), and CA §1706 for
    representatives.
13. **Some agencies bar under-18 work entirely.** Premier's Child Labour Policy: minors "cannot enter into
    a commercial agreement with us unless they are represented by a parent/guardian" and "we do not launch
    the model or require any work to be undertaken (neither paid nor unpaid) until they reach the adult
    age of 18." A product should not assume every agency wants under-18 submissions at all.
14. **Consent for AI processing of a minor's images must be given by the guardian**, and the industry
    default should be *not to run it at all* on minors.

---

## 8. Open questions and contested points

| Question | Evidence for | Evidence against | My read |
|---|---|---|---|
| Does the FWA impose a **45-day** payment deadline? | WWD, FashionUnited, Village View all state it; repeated widely in trade press | Not in §§1031–1039; not in the DOL "Responsibilities of Fashion Management and Clients" page; string absent from DOL FAQ. DOL instead frames it as "the payment term" stated in the deal memo | **Very likely a bill-stage provision that did not survive.** Do not rely on it. Needs a diff of S2477-A vs Ch. 676/S823 to settle |
| When must the final booking agreement be given? | DOL: "within seven days of the end of the model's booking", best efforts to sign before work begins | Ogletree (Jan 2025, pre-chapter-amendment) says "at least twenty-four hours prior to the start of a model's services" | The chapter amendment appears to have moved this. **Trust the DOL page over 2024/early-2025 law-firm alerts** |
| Are **paid directory listings** legitimate? | BFMA's own carve-out: "A child agency, which finds acting as well as modelling work, may charge a fee for inclusion in a directory or website." CA licenses them as *talent listing services* | BFMA's scams page condemns selling "a space on their online website" without qualification; NY FWA bars fees "as a condition to entering into any contract" with an MMC | **Genuinely contested.** Lawful-but-regulated in CA; conventionally accepted in the UK *child acting* segment only; reputationally toxic in adult fashion |
| Is **routine retouching** a "digital replica"? | Secondary legal commentary says routine retouching is excluded; the definition requires a "significant" AI-enhanced representation that substantially replicates the likeness | I did not read the full statutory definition sentence | **Needs primary confirmation** against §1031's full text before relying on it |
| Are **photographs** special-category data? | ICO/Recital 51: not systematically; only if biometric (e.g. facial recognition) | ICO: photos "can disclose or be used to infer" ethnicity/health etc., and biometric data that can infer special categories may itself be special category | **Depends entirely on what you do with them.** A portfolio photo: ordinary. A facial-recognition or attribute-inference pipeline: Art. 9 |
| Do UK child performance licences cover **photographic modelling**? | Strong industry inference; BFMA points members at gov.uk/child-employment and requires compliance | I did not obtain a primary local-authority page explicitly naming photographic modelling — my LBHF fetch returned empty | **Probable but unverified here.** Confirm against the Children (Performances and Activities) (England) Regulations 2014 before asserting |
| Public profile vs client package contents | Adult boards publish measurements; kids' boards publish age/height/clothing/shoe; Wilhelmina gates content behind a password | No primary source enumerating a client package | **Under-evidenced.** Flagged as a gap |

**Failed fetches, for the record:** models1.co.uk, selectmodel.com, nextmanagement.com, fordmodels.com,
elitemodel.com, wilhelmina.com/scouting (all 404/403/JS-gated on the URLs tried); the British Fashion
Council "Best Practice Guide for Model Agencies 2021" PDF and the Model Alliance FWA Explainer PDF (both
image/subset-font PDFs, not text-extractable in this environment); M+P Models "Parental Guidance" PDF
(same); NY Labor Law §1032 (nysenate section page returned no body). Where an agency page failed I
substituted another agency and noted it.

---

## 9. Source list

**Statutes and regulators (primary)**
1. NY Labor Law §1031 — definitions. https://www.nysenate.gov/legislation/laws/LAB/1031 — model, client, MMC, deal memo, digital replica
2. NY Labor Law §1033 — registration process. https://www.nysenate.gov/legislation/laws/LAB/1033 — fees, bond, term
3. NY Labor Law §1034 — MMC duties. https://www.nysenate.gov/legislation/laws/LAB/1034 — fiduciary duty, deal memo, itemisation, replica consent
4. NY Labor Law §1035 — prohibitions. https://www.nysenate.gov/legislation/laws/LAB/1035 — fee ban, 20% cap, 3-year cap, AI clause
5. NY Labor Law §1036 — power of attorney. https://www.nysenate.gov/legislation/laws/LAB/1036 — optional, no replicas, void otherwise
6. NY Labor Law §1037 — client duties. https://www.nysenate.gov/legislation/laws/LAB/1037 — full verbatim text obtained
7. NY Labor Law §1038 — enforcement/retaliation. https://www.nysenate.gov/legislation/laws/LAB/1038 — penalties, 6-year window, 100%/300% liquidated damages
8. NY Labor Law §1039. https://www.nysenate.gov/legislation/laws/LAB/1039 — CBA savings clause
9. NY DOL, Responsibilities of Fashion Management and Clients. https://dol.ny.gov/responsibilities-fashion-management-and-clients — the operative plain-language duty list
10. NY DOL, Fashion Workers Act FAQs. https://dol.ny.gov/new-york-state-fashion-workers-act-faqs — definitions, scope, worked examples, scam framing
11. NY DOL, Fashion Workers Act landing. https://dol.ny.gov/fashion — registry link, complaint route
12. NY DOL, Child Model FAQ. https://dol.ny.gov/child-model-frequently-asked-questions — permit, 15% trust, under-16 chaperone, tutoring, guardian duties
13. NY Model Management Registry (Socrata). https://data.ny.gov/resource/hder-iq9y.json — 79 active registrants, column schema, certificate format
14. CA Labor Code ch. 4.5 art. 1 (§1701 definitions). https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=LAB&division=2.&title=&part=6.&chapter=4.5.&article=1.
15. CA Labor Code ch. 4.5 art. 2 (§1702 advance-fee prohibition). …&article=2.
16. CA Labor Code ch. 4.5 art. 3 (§1703 contract + capital-letter notice, §1703.4 listing services). …&article=3.
17. CA Labor Code ch. 4.5 art. 4 (§1704 misdemeanour, §1704.1 public enforcement, §1704.2 treble damages). …&article=4.
18. CA Labor Code §1706 — Child Performer Services Permit. https://law.justia.com/codes/california/code-lab/division-2/part-6/chapter-5/section-1706/
19. NY GBL Art. 11 §185 — theatrical employment agency fee caps (10%/20%). https://www.nysenate.gov/legislation/laws/GBS/185 — evidences the pre-FWA gap for models
20. NYC DCWP Employment Agency Licence. https://nyc-business.nyc.gov/nycbusiness/description/employment-agency-license — prohibition on "guaranteeing clients jobs"
21. NY Assembly Consumer Affairs, "Modeling Scams". https://nyassembly.gov/comm/Consumer/20051026/ — legislature's own scam-tell list
22. Arrêté du 4 mai 2017 (model medical certificate / BMI). https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000034580535
23. ICO, What is special category data? https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-is-special-category-data/
24. EU AI Act Art. 50. https://artificialintelligenceact.eu/article/50/ — applies from 2 Aug 2026
25. UK child performance licensing / BOPA / chaperones — Birmingham CC, Hammersmith & Fulham, Blackpool chaperone guidance (as cited above)

**Industry bodies (primary)**
26. BFMA Code of Practice. https://bfma.fashion/bfma-code-of-practice/ — measurements, under-18s, finance, ethical scouting, "My Digital Human Model" 10 rights, client responsibilities, the child-directory carve-out
27. BFMA, Avoiding Frauds and Scams. https://bfma.fashion/avoiding-frauds-and-scams/ — full verbatim scam taxonomy
28. Model Alliance, Fashion Workers Act. https://www.modelalliance.org/fwa — "closed the legal loophole by which model management companies have long escaped accountability"
29. Model Alliance research (AI/body-scan survey with Data & Society + Cornell ILR). https://www.modelalliance.org/research

**Agencies (primary)**
30. Storm, Under 18 Applicants. https://www.stormmanagement.com/legal/under-18-applicants/ — 15–18, guardian consent, no fee, chaperone fallback, 30-day deletion
31. Storm, AI Code of Practice. https://www.stormmanagement.com/ai-code-of-practice/ — 13 clauses incl. no-training-datasets, prior written consent, casting-bias
32. Storm, Privacy Notice. https://www.stormmanagement.com/legal/privacy-notice/ — lawful bases, under-18 guardian completion, 30-day deletion
33. Premier, Staying Safe. https://www.premiermodelmanagement.com/staying-safe/ — "will never" list, domain discipline, verified handles
34. Premier, Anti-AI Data Mining. https://www.premiermodelmanagement.com/anti-ai-data-mining/
35. Premier, Child Labour Policy 2022 (PDF). https://www.premiermodelmanagement.com/Child_Labour_Policy_2022.pdf — no work under 18; guardian representation required
36. Elite Model Management, Get Scouted. https://elitemodelmanagement.com/get-scouted.web — guardian approval, 15-day deletion, purpose limitation, EU storage, non-compulsory consents, "will never" list
37. Milk Management, Apply. https://www.milkmanagement.co.uk/apply — guardian permission, no filters/retouching, no lingerie/swimwear, volume disclaimer
38. Heroes Model Management, Get Scouted. https://www.heroesmodels.com/get-scouted/ — under-18 rule, "will never" list

**Enforcement (primary)**
39. FTC, "Online Talent Search Company Settles FTC Allegations…" (Explore Talent / Prime Sites, Feb 2018). https://www.ftc.gov/news-events/news/press-releases/2018/02/online-talent-search-company-settles-ftc-allegations-it-collected-childrens-information-without
40. FTC, "Virginia-Based Modeling Agencies Lure Thousands of Consumers…" (1999). https://www.ftc.gov/news-events/news/press-releases/1999/05/virginia-based-modeling-agencies-lure-thousands-consumers-exaggerated-promises-lucrative
41. FTC consumer alert, "Lights, camera, scam! Spot virtual casting call scams" (Dec 2025). https://consumer.ftc.gov/consumer-alerts/2025/12/lights-camera-scam-spot-virtual-casting-call-scams

**Contrast case (primary)**
42. Get Scouted (getscouted.co) homepage + support. https://www.getscouted.co/ , https://www.getscouted.co/support — paid-listing marketing register; agency verification; 16–18 guardian consent, under-16 barred

**Secondary (corroboration only, labelled as such)**
43. Ogletree, "The New York State Fashion Workers Act…" (Jan 2025) — used only to surface the 24-hour vs 7-day discrepancy
44. Morgan Lewis, "New York State Enacts Fashion Workers Act" (Jan 2025)
45. Cowan DeBaets, "New York Includes 'Print And Runway Model' In Child Performers…" — 2013 amendment mechanics
46. Proskauer, "New York State Amends Labor Law To Protect Child Models"
47. SAG-AFTRA Coogan Law pages; BizParentz Krekorian page
48. WWD / FashionUnited / Village View — source of the unverified "45 days" claim
49. Fashionista / France24 / Global Legal Post — France "photographie retouchée"; Vice / it's nice that — Norway
50. BBB-derived scam-language aggregations (EntertainmentCareers.Net, Conflict International) — used only for the "registration/consultation/administrative fee" euphemism set
