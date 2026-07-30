# Talent Messages Coming-Soon Lock

## Goal

Temporarily prevent talent users from entering or using Messages while making
the feature’s upcoming status clear in the frontend.

## Shell behavior

- Replace the clickable Messages header link with a disabled, non-navigating
  control.
- Preserve the existing message icon’s position so the header layout does not
  shift.
- Add a small lock icon and expose “Messages — coming soon” on hover and
  keyboard focus.
- Do not show unread counts while Messages is locked.
- Do not fetch message-thread data from the talent shell while Messages is
  locked.
- Do not use a badge, pill, or animated status indicator.

## Direct-route behavior

`/dashboard/talent/messages` remains a valid frontend route but renders a static
coming-soon state instead of the inbox.

The state contains:

- Page title: “Messages”
- Primary copy: “Messages are coming soon”
- Supporting copy explaining that agency conversations will live there when the
  feature launches
- A link back to the talent overview

The route must not fetch threads, mark messages read, or render message compose
controls.

## Accessibility

- The disabled shell control remains keyboard focusable so its status can be
  discovered.
- It uses `aria-disabled="true"` and cannot navigate.
- The lock icon is decorative.
- The coming-soon route uses a normal `h1` and visible explanatory text.

## Verification

- Clicking the header control does not navigate.
- Keyboard users can focus it and discover “Messages — coming soon.”
- No message-thread request is issued from the talent shell or locked route.
- Direct navigation to the route renders only the static coming-soon state.
- Existing dashboard header and mobile layouts remain stable.
