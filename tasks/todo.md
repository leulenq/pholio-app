# Product plan 2026-08 — Phase 1: compliance

Source: [`docs/pholio-product-plan-2026-08.md`](../docs/pholio-product-plan-2026-08.md), section
**Sequencing → "Now — compliance"**. Scope is A2 fixes 1–8, 10, 11 plus the C1 discovery-cap
tripwire. Removals (A4/A3), defects (A5), and the Part B wedge are deliberately **not** in
this phase.

## The rule being enforced

> Anything an agency sees is identical for every talent. Payment may only change what the
> talent keeps for themselves.

## Items

- [x] **A2-1** Agency directory truncated to 20 for free users — `talent/routes/agencies.js`
- [x] **A2-2/3** Comp card watermark (reading `"ZipSite"`) on free cards — comp card templates + `pdf.js`
- [x] **A2-4** QR code Studio+ only — `compcard.ejs`, `compcard-standard.ejs`
- [x] **A2-5** Agency logo Studio+ only — `compcard.ejs` + the three `/api/pdf/agency-logo*` routes
- [x] **A2-6** Socials hyperlinked for Studio+ only — `compcard.ejs`
- [x] **A2-7** "Advanced" stats block and styling Studio+ only — `compcard.ejs`
- [x] **A2-8** Social URL generation degrades for free users — `shared/lib/social-helpers.js`
- [x] **A2-10** Open-call submissions capped at 3/month — `open-call-claims.js`, `applications.js`
- [x] **A2-11** Quota rationale contradicts itself — `submission-program-content.js`
- [x] **C1-1** Studio+ lifts the discovery cap (Cal. Lab. Code §1701 tripwire) — `application-quota.js`
- [x] **Sweep** Remaining `is_pro` branches against invariant 2 — the plan says "assume there are more"

### Not in scope, deliberately

- **A2-9** (`routes/portfolio.js:478`, different public portfolio layout for paid users) — the plan
  rates this acceptable while portfolios are talent-owned artifacts.
- PDF theme gating (`isProTheme`) and `pdf_customizations` — A1 lists "multiple card designs" as
  legitimate Studio+.
- `talent/routes/intel.js` 7-vs-90-day analytics window — A1 lists "the talent's own portfolio
  analytics" as legitimate Studio+. Its removal belongs to the A3 removal phase, not here.

## Review

All eleven items done. The governing rule is now true in code: nothing an agency
receives varies with the talent's plan.

**Reach.** `GET /api/talent/agencies` returned the first 20 agencies
alphabetically to free users and all of them to Studio+. The slice is gone, and
with it the profile lookup that existed only to read `is_pro`.

**The comp card.** Bigger than the plan's list. Beyond the watermark (which read
`"ZipSite"`), the QR code, the agency logo, hyperlinked socials and the
"advanced" stat styling, `isPro` also gated the entire extended-content block —
languages, nationality, union membership, physical characteristics,
specializations, notable work and representation. Free users fell through to an
`else` branch rendering socials as plain text and nothing else. All of it now
renders for everyone; the watermark is deleted from all three templates
(`compcard`, `compcard-standard`, `compcard-composed`) along with its CSS and the
`watermark` local that `pdf.js` passed at three render sites. The three
`/api/pdf/agency-logo*` endpoints lost their Studio+ gate too — rendering a logo
nobody could set would have been a half fix.

**The quota — the statutory item.** `unlimited = Boolean(profile?.is_pro)` is
gone; `FREE_MONTHLY_APPLICATION_LIMIT` is now
`MONTHLY_DISCOVERY_SUBMISSION_LIMIT`, flat at 5 for every account, with the
Cal. Lab. Code §1701 reasoning recorded at the constant. The 3/month open-call
exemption cap is removed entirely — `OPEN_CALL_EXEMPT_MONTHLY_CAP` and
`countExemptThisMonth` deleted, along with the `open_call_exemption_cap_reached`
path. Open-call abuse stays structurally bounded: a claim needs an arrival on
that agency's own live link, and one claim per (agency, profile) can ever be
consumed.

**The claims.** A limit that no tier lifts must not be sold against.
`upgradeRequired: true` is gone from both 403 responses; the self-contradicting
disclosure ("keeps agency inboxes high-quality" followed by selling its removal)
is one honest sentence; `"Unlimited discovery submissions"` is off the Studio+
upsell; and `ApplicationsView` no longer renders "Unlimited" for paid accounts.

**Beyond the list.** `pool-status.js` derived `DISCOVERABLE` from
`profile.is_pro && profile.is_discoverable` — agency-side visibility as a
purchased state, invariant 2 and 7 both. Now keyed on consent alone. It has no
callers today, which is precisely why it was worth fixing rather than leaving to
be re-wired.

### Verification

- Backend: `npm test` — 186 suites / 2478 tests passing, identical to the
  pre-change baseline taken at this HEAD (5 failing suites, 39 failing tests,
  all pre-existing: seed-dependent `app`/`notifications`/`overview-backend`/
  `intel` and `password-changed-notification`).
- Client: `npm run lint` clean (one pre-existing warning in an untouched file),
  `npm run build` succeeds, `vitest` matches baseline — the 2 `ProfilePage`
  failures reproduce identically with the changes stashed.
- Tests updated to the new contract rather than deleted: the retired
  "reports unlimited accounts" case became "applies the same limit to a paid
  account", and "the monthly exemption cap downgrades further invited
  submissions" became "invited submissions stay exempt with no monthly ceiling"
  — both now guard the compliance property directly.

### Next phase

Per the plan's sequencing, next is **removals** (A4 agency list + A3 talent
list), then **defects** (A5), then the Part B wedge. None started — all involve
deleting live surfaces or building new features.
