import React from 'react';
import { Block, Panel, Finding, Emph } from '../Chrome';
import CurrencyAxis, { RangeMatrix } from '../charts/CurrencyAxis';
import { days as fmtDays, plural } from '../intelTheme';

function finding({ sendability, items, missingRange }) {
  const byKey = Object.fromEntries((items || []).map((i) => [i.key, i]));

  if (sendability === 'hold') {
    const d = byKey.digitals;
    const blockers = [];
    if (d && (d.state === 'stale' || d.state === 'missing')) {
      blockers.push(
        d.state === 'missing' ? (
          <Emph key="d">no digitals</Emph>
        ) : (
          <span key="d">digitals <Emph>{fmtDays(d.daysOver)}</Emph> past window</span>
        ),
      );
    }
    if (missingRange?.length) {
      blockers.push(
        <span key="r">
          book missing <Emph>{missingRange.length} of 3</Emph> core{' '}
          {plural(missingRange.length, 'frame')}
        </span>,
      );
    }
    return (
      <Finding verdict="Not today" tag="blocked" tone="warn">
        {blockers.map((b, i) => (
          <React.Fragment key={i}>
            {i > 0 ? ' · ' : ''}
            {b}
          </React.Fragment>
        ))}
      </Finding>
    );
  }

  if (sendability === 'caveat') {
    const dated = (items || []).filter((i) => i.state !== 'current');
    return (
      <Finding verdict="Yes, with a caveat" tag="send-ready">
        <Emph>{dated.map((i) => i.label.toLowerCase()).join(' and ')}</Emph>{' '}
        {plural(dated.length, 'is', 'are')} past date — neither blocks a submission
      </Finding>
    );
  }

  const soonest = (items || [])
    .filter((i) => i.daysLeft != null && i.windowDays)
    .sort((a, b) => a.daysLeft - b.daysLeft)[0];

  return (
    <Finding verdict="Yes" tag="everything current" tone="good">
      {soonest ? (
        <>
          {soonest.label.toLowerCase()} expires first, in <Emph>{fmtDays(soonest.daysLeft)}</Emph>
        </>
      ) : (
        'every piece is inside its window'
      )}
    </Finding>
  );
}

export default function MaterialsBlock({ materials }) {
  if (!materials) return null;

  return (
    <Block
      id="iv-materials"
      question={<>Can I send this package <em>today</em>?</>}
      finding={finding(materials)}
    >
      <CurrencyAxis items={materials.items} />
      <Panel label="What a booker scans for">
        <RangeMatrix range={materials.range} />
      </Panel>
    </Block>
  );
}
