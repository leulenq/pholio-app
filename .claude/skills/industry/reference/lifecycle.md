# Lifecycle — Canonical State Models

The state machines the industry actually runs on. Use these to (a) name states correctly, (b) find the states Pholio is *missing*, and (c) check that transitions and ownership (who can move a state) are realistic. Most "modeling CRM" software collapses these into "active/inactive" + "applied/accepted" and thereby erases the business. When you run `lifecycle`, map the Pholio flow onto the relevant machine below and grade every missing or mislabeled state.

A correct state name carries *who acts*, *what's reversible*, and *what it obligates*. "Pending" answers none of those; "1st option" answers all three.

---

## 1. Representation lifecycle (talent ↔ agency)

How a person becomes, and stays, a represented model. **Not** a single "signed up" boolean.

```
Prospect / lead
  → Scouted (or self-submitted via open call)
  → Digitals requested
  → Reviewed → [Declined | Kept on file | Meeting]
  → Meeting / go-see with agency
  → Development offer  → New face (developing)        ┐
  → Signed / represented                              ├─ can run in parallel across markets
       ├─ Mother-agency representation (primary)       │
       └─ Placed with market agency(ies) (non-excl.)  ┘
  → Active on a board
  → [On bookout | On booking | Available]   ← operating sub-states, not lifecycle exits
  → Inactive / on hold / dropped / left / contract ended
```

**States Pholio commonly lacks:** "kept on file" (the most common real outcome of a submission), "new face / development," the distinction between **mother-agency** vs **placed market** representation, and **non-exclusive multi-agency** representation. Also: *who* owns each transition — talent self-submits; the **agency** decides declined/file/meeting/offer.

**Realism checks:** Can a talent be represented by >1 agency? Is there a mother-agent concept? Is "rejected" actually "kept on file" (soft, common) vs. a hard no? Is "new face" distinct from "bookable"?

---

## 2. Application / inbound lifecycle (the Pholio "apply to agency" flow)

What an inbound submission really is. It is a **submission of digitals + stats**, judged by a booker — not a job application with a cover letter.

```
Submitted (digitals + measurements + basics)
  → Received / in review
  → [Auto/early decline]            ← most submissions
  → Shortlisted / kept on file       ← the common "soft yes"
  → Requested more (more digitals, specific shots, in-person)
  → Invited to meeting / go-see
  → Outcome:
       ├─ Development offer (new face)
       ├─ Signed / represented
       └─ Declined (with or without "try again later")
```

**Agency-side mirror:** a booker triages an **inbox** of submissions, tags/sorts them, and pushes promising ones to a **board/shortlist**. Pholio's agency inbox + casting board should reflect: bulk triage, "keep on file," request-more, and meeting scheduling — not a binary accept/reject.

**Realism checks:** Does talent submit **digitals** (raw) — not portfolio glamour shots? Are required submission fields the real ones (stats dual-unit, current digitals, height/measurements, location, age, board interest)? Is "kept on file" representable? Is rejection humane and non-terminal (industry norm: "we'll keep you on file / reapply")? For minors, does the path branch to guardian consent before anything is collected?

---

## 3. Booking / option lifecycle (the calendar engine)

The core operating loop of an agency. If Pholio's roster has only active/inactive, this entire machine is missing.

```
Inquiry / availability check (client → booker)
  → Quote / negotiate (rate + usage)
  → OPTION placed on dates
       ├─ 1st option  (priority claim)
       ├─ 2nd option  (queued behind 1st)
       └─ Hold        (soft; "keep it open")
  → Challenge: if another client wants the dates, 1st option is asked to "confirm or release"
  → [Confirmed / BOOKED]   or   [Released / expired]
  → Pre-production: casting / call-back / FITTING
  → Job day: call sheet, call time, work, VOUCHER signed
  → Wrapped → billing
  → [Cancelled (with cancellation-fee window) | Postponed]

Parallel talent-set state: BOOKOUT (unavailable: vacation, school, conflict, other market)
```

**States/concepts Pholio commonly lacks:** options at all; **1st vs 2nd** priority; **hold**; the **confirm-or-release** challenge; **bookout**; **fitting** as a distinct event; **cancellation window/fee**; the voucher as the booking's closing artifact. "Available / on booking / unavailable" is a *derived* view of these states — not a substitute.

**Realism checks:** Can two clients hold overlapping options with priority? Can talent book out dates that block options? Is a confirmed booking distinct from an option (different reversibility, different obligation)? Does a booking carry rate **and** usage, not just a date?

---

## 4. Payment / money lifecycle

Money is net-of-commission, voucher-gated, and slow. Model accordingly.

```
Booking confirmed (rate + usage agreed)
  → Job worked → VOUCHER signed (hours/rate/usage)
  → Agency invoices client (rate + usage + agency service charge)
  → Client pays agency        ← often 30–90 days
  → Agency deducts COMMISSION (and SPLITS with mother agency)
  → Talent paid NET            ← commonly 60–90 days after the job
       (advance sometimes issued earlier against the voucher)
  → Usage/buyout may renew later (new territory/term → new payment)
```

**States Pholio commonly lacks:** voucher status, invoiced, client-paid, commission deducted, **split** to mother agency, net payout, **expected pay date**, advance, and usage **renewal**. A credible earnings/commission view shows the chain — gross → usage → commission(+split) → net → date — not a single instant number.

**Realism checks:** Is commission shown and split-aware? Is usage/buyout separate from day rate? Is the pay *delay* represented (status + expected date), not instant? Is there a voucher gating payment?

---

## 5. Minor (under-18) overlay — applies across all four

Whenever talent is under 18, every lifecycle above gains a consent/compliance layer that must precede data collection and exposure:

```
Guardian consent FIRST (before collecting digitals/measurements/contact)
  → Work permit (jurisdiction) on record before booking
  → Coogan/trust account for earnings (where required)
  → Chaperone + limited hours + schooling on bookings
  → Restricted visibility of measurements / full-length & swim images / contact
```

If a Pholio flow handles a minor on the same path as an adult — collecting measurements/full-length images, exposing stats, allowing direct contact without guardian consent — that's a **P0** compliance/trust gap, not a polish item.
