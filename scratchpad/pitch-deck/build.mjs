import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('./deck/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const V = '#050505', C = '#FAF7F2', CW = '#F3EEE5', G = '#C9A55A', GD = '#A8894E', INK = '#1A1815';
const MC = '#6B6560', MV = 'rgba(250,247,242,0.58)', RC = 'rgba(26,24,21,0.14)', RV = 'rgba(250,247,242,0.16)';
const SERIF = "'Noto Serif Display', 'Didot', 'Bodoni 72', Georgia, serif";
const SANS = "Inter, 'Helvetica Neue', Arial, sans-serif";
const MONO = "'JetBrains Mono', Menlo, Consolas, monospace";

const slides = [];
const add = (name, tone, body) => slides.push({ name, tone, body });

const page = (n, total, tone, body) => {
  const dark = tone === 'dark';
  const bg = dark ? V : tone === 'warm' ? CW : C;
  const fg = dark ? C : INK;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+Display:ital,wght@0,300;0,400;0,500;1,300;1,400&amp;family=Inter:wght@400;500;600&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap">
  <style>
    html, body { margin: 0; background: ${bg}; }
    * { box-sizing: border-box; }
    a { color: ${G}; } a:hover { color: ${GD}; }
    h1, h2, p { margin: 0; }
  </style>
</helmet>
<div style="position: relative; width: 1920px; height: 1080px; overflow: hidden; background: ${bg}; color: ${fg}; font-family: ${SANS};">
${body}
  <div style="position: absolute; left: 120px; right: 120px; bottom: 48px; display: flex; justify-content: space-between; align-items: baseline; font-family: ${MONO}; font-size: 15px; color: ${dark ? MV : MC};">
    <span style="font-family: ${SERIF}; font-size: 19px; letter-spacing: 0.22em; color: ${fg};">PHOLIO</span>
    <span>${String(n).padStart(2, '0')} / ${total}</span>
  </div>
</div>
</x-dc>
</body>
</html>
`;
};

// ---------- helpers ----------
const px = (v) => (typeof v === 'number' ? `${v}px` : v);
const pos = (o) => Object.entries(o).map(([k, v]) => `${k}: ${px(v)};`).join(' ');
const H = (text, o = {}, dark = false) => `<h2 style="position: absolute; ${pos({ left: 120, top: 110, ...o.at })} width: ${px(o.w ?? 1500)}; font-family: ${SERIF}; font-weight: 400; font-size: ${o.size ?? 80}px; line-height: 1.05; letter-spacing: -0.005em; text-wrap: pretty; ${o.align ? `text-align: ${o.align};` : ''}">${text}</h2>`;
const it = (t, color) => `<span style="font-style: italic; font-weight: 300;${color ? ` color: ${color};` : ''}">${t}</span>`;
const mono = (text, o, color = MC, size = 20) => `<p style="position: absolute; ${pos(o)} font-family: ${MONO}; font-size: ${size}px; line-height: 1.6; color: ${color};">${text}</p>`;
const body = (text, o, color = MC, size = 28) => `<p style="position: absolute; ${pos(o)} font-family: ${SANS}; font-size: ${size}px; line-height: 1.45; color: ${color}; text-wrap: pretty;">${text}</p>`;
const shot = (src, o, dark = false) => `<img src="${src}" alt="" style="position: absolute; ${pos(o)} display: block; border-radius: 10px; border: 1px solid ${dark ? 'rgba(250,247,242,0.10)' : 'rgba(26,24,21,0.10)'}; box-shadow: 0 40px 90px ${dark ? 'rgba(0,0,0,0.55)' : 'rgba(26,24,21,0.16)'};">`;
const phone = (src, o, dark = false) => `<div style="position: absolute; ${pos(o)} padding: 7px; border-radius: 38px; background: #1C1B19; box-shadow: 0 34px 70px ${dark ? 'rgba(0,0,0,0.6)' : 'rgba(26,24,21,0.22)'}; border: 1px solid ${dark ? 'rgba(250,247,242,0.14)' : 'rgba(26,24,21,0.2)'};"><img src="${src}" alt="" style="display: block; width: 100%; border-radius: 31px;"></div>`;
const question = (q, dark) => `<h2 style="position: absolute; left: 120px; top: 120px; width: 760px; font-family: ${SERIF}; font-style: italic; font-weight: 300; font-size: 72px; line-height: 1.08; color: ${dark ? C : INK}; text-wrap: pretty;">“${q}”</h2>`;

// ================= ACT I — YOUR FRONT DOOR TODAY =================

add('Main', 'dark', `
  <div style="position: absolute; left: 120px; top: 150px; display: flex; flex-direction: column; gap: 44px; width: 900px;">
    <p style="font-family: ${SERIF}; font-size: 30px; letter-spacing: 0.32em; color: ${C}; -webkit-text-stroke: 0.6px rgba(201,165,90,0.6);">PHOLIO</p>
    <h1 style="font-family: ${SERIF}; font-weight: 400; font-size: 118px; line-height: 1.0; letter-spacing: -0.01em; color: ${C}; text-wrap: pretty;">A better front door ${it('for talent.', G)}</h1>
    <p style="font-family: ${MONO}; font-size: 22px; color: ${MV};">For modeling agencies and casting organizations</p>
  </div>
  ${phone('m-invite.jpg', { left: 1120, top: 120, width: 330 }, true)}
  ${phone('m-photos.jpg', { left: 1500, top: 220, width: 330 }, true)}`);

add('TheClick', 'light', `
  <div style="position: absolute; left: 120px; top: 330px; width: 1500px; display: flex; flex-direction: column; gap: 36px;">
    <p style="font-family: ${SERIF}; font-size: 112px; line-height: 1.02;">Someone taps Apply.</p>
    <p style="font-family: ${SERIF}; font-style: italic; font-weight: 300; font-size: 60px; line-height: 1.12; color: ${MC}; text-wrap: pretty;">Everything after that is your intake system, whether anyone designed it or not.</p>
  </div>`);

const today = [
  ['Publish', 'A form on your site. A Google Form. A post.'],
  ['Arrive', 'Email, Instagram DMs, walk-ins.'],
  ['Collect', 'Attachments, links, screenshots.'],
  ['Review', 'Someone’s inbox. A spreadsheet.'],
  ['Follow up', 'Threads across inboxes and phones.'],
  ['Close', 'Usually, nowhere.'],
];
add('IntakeToday', 'dark', `
  ${H(`After someone taps Apply, ${it('it lives in six places.', MV)}`, { w: 1500 })}
  <div style="position: absolute; left: 120px; right: 120px; top: 470px; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0;">
    ${today.map(([s, w], i) => `<div style="display: flex; flex-direction: column; gap: 26px; padding: 0 26px; ${i ? `border-left: 1px dashed ${RV};` : 'padding-left: 0;'}">
      <span style="font-family: ${MONO}; font-size: 18px; color: ${G};">${String(i + 1).padStart(2, '0')}</span>
      <span style="font-family: ${SERIF}; font-size: 46px; line-height: 1;">${s}</span>
      <span style="font-family: ${SANS}; font-size: 23px; line-height: 1.45; color: ${i === 5 ? G : MV};">${w}</span>
    </div>`).join('\n    ')}
  </div>
  ${mono('Every dashed line is a hand-off nobody owns.', { left: 120, top: 850 }, MV, 20)}`);

const mail = [
  ['jess.k2004', 'Model application!!', 'hi!! im 5’9 i think, my insta is @jessk…', 'IMG_4421.HEIC'],
  ['(no name)', '(no subject)', 'Sent from my iPhone', '6 attachments · 41 MB'],
  ['Daniel R.', 'Submission – Daniel', 'here are my photos: wetransfer.com/downloads/…', 'Link expired'],
  ['Priya', 'Re: Re: Fwd: digitals', 'sorry which ones did you need again?', ''],
  ['mariana.models', 'New faces', 'my portfolio is on my page, thank you!', 'Screenshot 2026-09-02 at 11.14.png'],
  ['T. Okoye', 'Application', 'Height 180, will send measurements soon', 'selfie_final_edit.jpg'],
];
add('WhatArrives', 'light', `
  ${H('What actually arrives.', { w: 700 })}
  ${body('No height. No full length. A file nobody on the team can open. Measurements “soon”.', { left: 120, top: 280, width: 560 }, MC, 30)}
  <div style="position: absolute; left: 760px; top: 110px; width: 1040px; background: #FFFFFF; border: 1px solid ${RC}; border-radius: 10px; box-shadow: 0 40px 90px rgba(26,24,21,0.12); overflow: hidden;">
    <div style="padding: 22px 28px; border-bottom: 1px solid ${RC}; font-family: ${SANS}; font-size: 20px; font-weight: 600;">applications@ · Inbox <span style="font-weight: 400; color: ${MC};">· 214 unread</span></div>
    ${mail.map(([from, subj, snip, att]) => `<div style="display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 20px; padding: 22px 28px; border-bottom: 1px solid ${RC}; font-family: ${SANS};">
      <span style="font-size: 19px; font-weight: 600;">${from}</span>
      <div style="display: flex; flex-direction: column; gap: 6px; min-width: 0;">
        <span style="font-size: 19px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><b style="font-weight: 600;">${subj}</b> <span style="color: ${MC};">— ${snip}</span></span>
        ${att ? `<span style="font-family: ${MONO}; font-size: 15px; color: ${att === 'Link expired' ? '#B0412F' : GD};">${att}</span>` : ''}
      </div>
    </div>`).join('\n    ')}
  </div>
  ${mono('Illustrative inbox', { left: 120, top: 900 }, MC, 16)}`);

const forms = [
  ['Q Management', 'JPG only, 3 MB max', 'Accepted a 4 MB file and a .txt'],
  ['Elite', 'Six photos', 'HEIC hidden in the picker, not blocked'],
  ['CURV', 'Four photo slots', 'No file size limit'],
  ['JAG', 'Three photos', '64 MB platform default'],
  ['Muse NYC', 'Email, “about 1MB” per image', 'Whatever lands in the inbox'],
];
add('FormNotFilter', 'dark', `
  ${H(`Your form collects. ${it('It doesn’t check.', G)}`, { w: 1500 })}
  <div style="position: absolute; left: 120px; right: 120px; top: 330px; display: flex; flex-direction: column;">
    <div style="display: grid; grid-template-columns: 380px minmax(0, 1fr) 640px; padding: 0 0 16px; font-family: ${MONO}; font-size: 17px; color: ${MV};">
      <span>Agency form</span><span>Says it wants</span><span>What it actually took</span>
    </div>
    ${forms.map(([a, b, c]) => `<div style="display: grid; grid-template-columns: 380px minmax(0, 1fr) 640px; align-items: baseline; padding: 22px 0; border-top: 1px solid ${RV};">
      <span style="font-family: ${SERIF}; font-size: 40px;">${a}</span>
      <span style="font-family: ${SANS}; font-size: 25px; color: ${MV};">${b}</span>
      <span style="font-family: ${MONO}; font-size: 23px; color: ${G};">${c}</span>
    </div>`).join('\n    ')}
  </div>
  ${mono('Application forms tested August 19, 2026. Most had no file size limit at all.', { left: 120, top: 930 }, MV, 17)}`);

add('Volume', 'light', `
  <p style="position: absolute; left: 110px; top: 120px; font-family: ${SERIF}; font-weight: 300; font-size: 300px; line-height: 1; letter-spacing: -0.03em;">~100</p>
  ${body('applications a day, reported by a single agency.', { left: 130, top: 460, width: 620 }, INK, 40)}
  <div style="position: absolute; left: 980px; top: 150px; width: 820px; display: flex; flex-direction: column; gap: 56px;">
    ${[
      ['“We are not able to respond to every submission.”', 'Muse NYC'],
      ['“Due to the volume of submissions, we are unable to respond to all inquiries.”', 'ONE Management'],
      ['“Someone will be in touch with you if we feel that you have the right look.”', 'Wilhelmina'],
    ].map(([q, s]) => `<div style="display: flex; flex-direction: column; gap: 14px; padding-top: 26px; border-top: 1px solid ${RC};">
      <p style="font-family: ${SERIF}; font-style: italic; font-weight: 300; font-size: 44px; line-height: 1.15; text-wrap: pretty;">${q}</p>
      <p style="font-family: ${MONO}; font-size: 18px; color: ${MC};">${s} · public application page</p>
    </div>`).join('\n    ')}
  </div>
  ${body('Silence became policy because the tools can’t carry the volume.', { left: 130, top: 760, width: 700 }, MC, 30)}`);

const thread = [
  ['Sep 2', 'Your booker', '“Love the look. Can you send unretouched digitals? No makeup, hair back.”', C],
  ['Sep 11', 'A different email address, a new thread', '“digitals!!” — wetransfer.com/…', C],
  ['Sep 18', 'Transfer link expires', '', G],
  ['Sep 19', 'Instagram DM', '“hi did u get my pics?”', C],
];
add('FollowUpBreaks', 'dark', `
  ${H(`The best applicants ${it('get lost in follow-up.', G)}`, { w: 1400 })}
  <div style="position: absolute; left: 120px; right: 120px; top: 520px; height: 1px; background: ${RV};"></div>
  <div style="position: absolute; left: 120px; right: 120px; top: 440px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) 220px; gap: 36px;">
    ${thread.map(([d, who, msg, col]) => `<div style="display: flex; flex-direction: column; gap: 20px;">
      <span style="font-family: ${MONO}; font-size: 20px; color: ${col === G ? G : MV}; height: 50px;">${d}</span>
      <span style="width: 14px; height: 14px; border-radius: 50%; background: ${col};"></span>
      <span style="font-family: ${SANS}; font-size: 22px; font-weight: 500; color: ${col};">${who}</span>
      <span style="font-family: ${SERIF}; font-style: italic; font-weight: 300; font-size: 30px; line-height: 1.25; color: ${C};">${msg}</span>
    </div>`).join('\n    ')}
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <span style="height: 50px;"></span>
      <span style="width: 14px; height: 14px; border: 1.5px solid ${G}; border-radius: 50%;"></span>
      <span style="font-family: ${SERIF}; font-size: 40px; line-height: 1.1; color: ${G};">Who asked?</span>
    </div>
  </div>
  ${mono('Illustrative', { left: 120, top: 920 }, MV, 16)}`);

add('Impersonation', 'light', `
  ${H(`Agencies now warn applicants ${it('about fake versions of themselves.', MC)}`, { w: 1300, size: 72 })}
  <div style="position: absolute; left: 120px; right: 120px; top: 420px; display: flex; flex-direction: column; gap: 48px;">
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <p style="font-family: ${SANS}; font-weight: 600; font-size: 50px; letter-spacing: 0.02em; line-height: 1.1; padding: 30px 36px; background: ${INK}; color: ${C};">PROTECT YOURSELF FROM IMPERSONATORS, FRAUD, SCAM, AND PREDATORS</p>
      <p style="font-family: ${MONO}; font-size: 18px; color: ${MC};">ONE Management · on every page of its website</p>
    </div>
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <p style="font-family: ${SANS}; font-weight: 600; font-size: 50px; letter-spacing: 0.02em; line-height: 1.1; padding: 30px 36px; border: 2px solid ${INK};">WARNING REGARDING IMPOSTERS</p>
      <p style="font-family: ${MONO}; font-size: 18px; color: ${MC};">Wilhelmina · shown before its application form</p>
    </div>
  </div>`);

// ================= ACT II — PHOLIO =================

const door = [
  ['One official link', 'Your brief, your requirements, your name on it.'],
  ['Applicants arrive prepared', 'Stats, digitals and consent, in the shape you asked for.'],
  ['One room to decide', 'Every submission, decision and reply on the record.'],
  ['Out to your tools', 'CSV or webhook, the moment a submission lands.'],
];
add('FrontDoor', 'dark', `
  ${H(`Pholio is a better ${it('front door for talent.', G)}`, { w: 1500, size: 96 })}
  <div style="position: absolute; left: 120px; right: 120px; top: 520px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0;">
    ${door.map(([t, d], i) => `<div style="display: flex; flex-direction: column; gap: 22px; padding: 0 34px; ${i ? `border-left: 1px solid ${RV};` : 'padding-left: 0;'}">
      <span style="font-family: ${SERIF}; font-weight: 300; font-size: 84px; line-height: 1; color: ${G};">${i + 1}</span>
      <span style="font-family: ${SERIF}; font-size: 40px; line-height: 1.08;">${t}</span>
      <span style="font-family: ${SANS}; font-size: 23px; line-height: 1.45; color: ${MV};">${d}</span>
    </div>`).join('\n    ')}
  </div>
  ${mono('Free for agencies.', { left: 120, top: 920 }, G, 22)}`);

add('TwoSides', 'warm', `
  ${H(`Each side ${it('makes the other better.', GD)}`, { w: 1400 })}
  <svg width="1680" height="560" viewBox="0 0 1680 560" style="position: absolute; left: 120px; top: 330px;" fill="none">
    <circle cx="260" cy="280" r="200" stroke="${INK}" stroke-width="1.5"></circle>
    <circle cx="1420" cy="280" r="200" stroke="${INK}" stroke-width="1.5"></circle>
    <path d="M470 200 C 760 90, 920 90, 1210 200" stroke="${GD}" stroke-width="2.5"></path>
    <path d="M1196 186 L1212 201 L1191 208" stroke="${GD}" stroke-width="2.5"></path>
    <path d="M1210 360 C 920 470, 760 470, 470 360" stroke="${GD}" stroke-width="2.5"></path>
    <path d="M484 374 L468 359 L489 352" stroke="${GD}" stroke-width="2.5"></path>
  </svg>
  <p style="position: absolute; left: 200px; top: 570px; width: 360px; text-align: center; font-family: ${SERIF}; font-size: 48px;">Your agency</p>
  <p style="position: absolute; left: 1360px; top: 570px; width: 360px; text-align: center; font-family: ${SERIF}; font-size: 48px;">Talent</p>
  <p style="position: absolute; left: 640px; top: 350px; width: 640px; text-align: center; font-family: ${SANS}; font-size: 25px; line-height: 1.4;">A clear brief, real requirements, and an answer</p>
  <p style="position: absolute; left: 640px; top: 790px; width: 640px; text-align: center; font-family: ${SANS}; font-size: 25px; line-height: 1.4;">Complete, current submissions from a record they keep</p>
  <p style="position: absolute; left: 700px; top: 575px; width: 520px; text-align: center; font-family: ${SERIF}; font-style: italic; font-weight: 300; font-size: 30px; line-height: 1.3; color: ${MC};">Talent keep their materials current because agencies answer. Agencies answer because what arrives is usable.</p>`);

const week = [['Mon', 'Publish the call'], ['Tue', 'Review the desk'], ['Wed', 'Follow up'], ['Thu', 'Compare'], ['Fri', 'Decide the board']];
add('OneWeek', 'dark', `
  <div style="position: absolute; left: 120px; top: 250px; width: 1400px; display: flex; flex-direction: column; gap: 28px;">
    <p style="font-family: ${SERIF}; font-size: 104px; line-height: 1.02;">One week at ${it('Meridian Model Management.', G)}</p>
    <p style="font-family: ${MONO}; font-size: 22px; color: ${MV};">A fictional New York agency. Real Pholio screens.</p>
  </div>
  <div style="position: absolute; left: 120px; right: 120px; top: 720px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border-top: 1px solid ${RV};">
    ${week.map(([d, t]) => `<div style="display: flex; flex-direction: column; gap: 10px; padding-top: 24px;"><span style="font-family: ${MONO}; font-size: 20px; color: ${G};">${d}</span><span style="font-family: ${SANS}; font-size: 26px;">${t}</span></div>`).join('')}
  </div>`);

const briefField = (label, value, h = 'auto') => `<div style="display: flex; flex-direction: column; gap: 10px;">
      <span style="font-family: ${SANS}; font-size: 13px; font-weight: 600; letter-spacing: 0.08em; color: ${MC};">${label}</span>
      <div style="border: 1px solid rgba(26,24,21,0.14); border-radius: 8px; padding: 14px 16px; font-family: ${SANS}; font-size: 19px; line-height: 1.5; color: ${INK}; background: #FFFFFF; min-height: ${h};">${value}</div>
    </div>`;
add('Brief', 'light', `
  ${H(`Monday. ${it('Write the brief.', MC)}`, { w: 640 })}
  ${body('Four answers. Applicants read them before they start, so the right people apply and know what happens next.', { left: 120, top: 300, width: 560 }, MC, 30)}
  <div style="position: absolute; left: 820px; top: 100px; width: 980px; background: #FFFFFF; border-radius: 12px; border: 1px solid rgba(26,24,21,0.12); box-shadow: 0 40px 90px rgba(26,24,21,0.14); padding: 40px 44px; display: flex; flex-direction: column; gap: 22px;">
    <p style="font-family: 'Playfair Display', Georgia, serif; font-weight: 600; font-size: 30px; color: ${INK};">Fall new faces — New York</p>
    ${briefField('WHO THIS CALL IS FOR', 'New faces for the women’s and men’s boards, New York. 5′8″ and over for women, 6′0″ and over for men.')}
    ${briefField('WHAT TO SEND', 'Four digitals — close-up, profile, waist-up, full length. No makeup, hair back.')}
    ${briefField('ELIGIBILITY', '18 and over.')}
    ${briefField('WHAT HAPPENS NEXT', 'We review every Tuesday and reply within 30 days, either way.')}
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <span style="font-family: ${SANS}; font-size: 13px; font-weight: 600; letter-spacing: 0.08em; color: ${MC};">WHEN IT CLOSES</span>
      <div style="display: flex; gap: 10px;">
        <span style="height: 44px; padding: 0 18px; display: flex; align-items: center; border: 1px solid rgba(26,24,21,0.14); border-radius: 8px; font-size: 16px; font-weight: 500;">Runs continuously</span>
        <span style="height: 44px; padding: 0 18px; display: flex; align-items: center; border-radius: 8px; background: ${INK}; color: #FFFFFF; font-size: 16px; font-weight: 500;">Closes on a date</span>
        <span style="height: 44px; padding: 0 18px; display: flex; align-items: center; border: 1px solid rgba(26,24,21,0.14); border-radius: 8px; font-family: ${MONO}; font-size: 16px;">Oct 15, 2026</span>
      </div>
    </div>
    <span style="align-self: flex-start; height: 44px; padding: 0 22px; display: flex; align-items: center; border-radius: 8px; background: ${G}; color: #141210; font-size: 17px; font-weight: 600;">Create link</span>
  </div>`);

add('Requirements', 'warm', `
  ${H(`State what you need, ${it('once.', GD)}`, { w: 700 })}
  ${body('Shots, how the pictures should look, file limits. Applicants see them before they apply, and Pholio shows each one which of their pictures already meet them.', { left: 120, top: 300, width: 620 }, MC, 29)}
  ${mono('Guidance, not a gate. Nobody is turned away by a rule.', { left: 120, top: 620, width: 600 }, GD, 20)}
  ${shot('requirements.jpg', { left: 860, top: 110, width: 940 })}`);

add('TheLink', 'dark', `
  ${H(`Put it wherever ${it('people already apply.', G)}`, { w: 1500 })}
  <p style="position: absolute; left: 120px; top: 360px; font-family: ${MONO}; font-size: 60px; letter-spacing: -0.01em; color: ${C};">app.pholio.studio/opencall/<span style="color: ${G};">h9TwXlhoEB23fU9a</span></p>
  <div style="position: absolute; left: 120px; right: 120px; top: 560px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; border-top: 1px solid ${RV};">
    ${[['Your website', 'Behind the Apply button you already have.'], ['Instagram', 'In the bio, and on every casting post.'], ['In person', 'A QR code at an open call or a school visit.']].map(([t, d], i) => `<div style="display: flex; flex-direction: column; gap: 14px; padding: 28px 34px 0; ${i ? `border-left: 1px solid ${RV};` : 'padding-left: 0;'}"><span style="font-family: ${SERIF}; font-size: 44px;">${t}</span><span style="font-family: ${SANS}; font-size: 24px; color: ${MV};">${d}</span></div>`).join('')}
  </div>
  ${mono('Pause · Resume · Revoke — each link counts its own arrivals and submissions.', { left: 120, top: 860 }, G, 21)}`);

const flow = [['m-invite.jpg', 'Your invitation'], ['m-height.jpg', 'One question per screen'], ['m-measure.jpg', 'Stats, as they write them'], ['m-email.jpg', 'Where the receipt goes'], ['m-photos.jpg', 'Photos last'], ['m-sent.jpg', 'Sent']];
add('ApplyFlow', 'dark', `
  ${H(`About four minutes on a phone. ${it('No account.', G)}`, { w: 1600, size: 72, at: { top: 90 } })}
  <div style="position: absolute; left: 120px; right: 120px; top: 250px; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 34px;">
    ${flow.map(([src, cap]) => `<div style="display: flex; flex-direction: column; gap: 22px;">
      <div style="padding: 6px; border-radius: 34px; background: #1C1B19; border: 1px solid rgba(250,247,242,0.14); box-shadow: 0 30px 60px rgba(0,0,0,0.6);"><img src="${src}" alt="" style="display: block; width: 100%; border-radius: 28px;"></div>
      <span style="font-family: ${MONO}; font-size: 18px; color: ${MV};">${cap}</span>
    </div>`).join('\n    ')}
  </div>`);

add('AlreadyOnPholio', 'light', `
  ${H(`Already on Pholio? ${it('They send the record they keep.', MC)}`, { w: 1600, size: 72, at: { top: 90 } })}
  ${shot('apply-board.jpg', { left: 120, top: 290, width: 1000 })}
  ${shot('apply-send.jpg', { left: 800, top: 420, width: 1000 })}
  ${mono('Board · digitals · comp card · review and send', { left: 120, top: 950 - 20 }, MC, 19)}`);

add('Desk', 'warm', `
  ${H(`Tuesday.<br>${it('The desk.', MC)}`, { w: 440 })}
  ${body('Every submission in the same shape: face, height, age, city. Anything missing says so.', { left: 120, top: 300, width: 400 }, MC, 29)}
  ${shot('desk.jpg', { left: 600, top: 110, width: 1200 })}`);

add('ReviewRoom', 'light', `
  ${shot('room.jpg', { left: 120, top: 110, width: 1280 })}
  <div style="position: absolute; left: 1480px; top: 120px; width: 330px; display: flex; flex-direction: column; gap: 30px;">
    <p style="font-family: ${SERIF}; font-size: 60px; line-height: 1.05;">One applicant. ${it('One screen.', MC)}</p>
    <p style="font-family: ${SANS}; font-size: 25px; line-height: 1.45; color: ${MC};">Digitals as sent, measurements in both units, where it came from and when.</p>
    <p style="font-family: ${MONO}; font-size: 18px; line-height: 1.6; color: ${GD};">← → to move through the desk</p>
  </div>`);

const verbs = [['F', 'Keep on file'], ['D', 'Request digitals'], ['M', 'Invite to meet'], ['S', 'Shortlist'], ['A', 'Offer'], ['X', 'Pass']];
add('Verdicts', 'dark', `
  ${H(`Decide in one keystroke. ${it('The talent hears it properly.', G)}`, { w: 1680, size: 68 })}
  <div style="position: absolute; left: 120px; right: 120px; top: 300px; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border-top: 1px solid ${RV};">
    ${verbs.map(([k, v]) => `<div style="display: flex; gap: 16px; align-items: baseline; padding-top: 22px;"><span style="font-family: ${MONO}; font-size: 22px; color: ${G}; border: 1px solid rgba(201,165,90,0.5); border-radius: 6px; padding: 2px 10px;">${k}</span><span style="font-family: ${SERIF}; font-size: 32px;">${v}</span></div>`).join('')}
  </div>
  ${shot('pass-bar.jpg', { left: 120, top: 470, width: 1680 }, true)}
  ${mono('Pass with a reason → the talent gets a considered sentence. The house note stays internal.', { left: 120, top: 610 }, MV, 20)}
  ${shot('offer-bar.jpg', { left: 120, top: 720, width: 1680 }, true)}
  ${mono('Offer → representation or development. Undo on every decision.', { left: 120, top: 830 }, MV, 20)}`);

add('EveryoneHearsBack', 'warm', `
  ${H(`Every applicant ${it('hears back.', GD)}`, { w: 900 })}
  <div style="position: absolute; left: 120px; top: 390px; width: 760px; display: flex; flex-direction: column; gap: 0;">
    ${[['Day 0', 'Submission received'], ['Days 1–29', 'Your review window. Decide whenever.'], ['Day 30', 'No decision? Closed for you, with an honest note.']].map(([d, t], i) => `<div style="display: grid; grid-template-columns: 180px minmax(0, 1fr); padding: 26px 0; border-top: 1px solid ${RC};"><span style="font-family: ${MONO}; font-size: 22px; color: ${i === 2 ? GD : MC};">${d}</span><span style="font-family: ${SANS}; font-size: 28px; line-height: 1.35;">${t}</span></div>`).join('')}
  </div>
  ${mono('Window set per agency or per call · 1 to 120 days, or off', { left: 120, top: 760 }, MC, 19)}
  <div style="position: absolute; left: 1000px; top: 380px; width: 800px; padding: 40px 44px; background: #FFFFFF; border: 1px solid ${RC}; border-radius: 12px; box-shadow: 0 30px 70px rgba(26,24,21,0.12); display: flex; flex-direction: column; gap: 14px;">
    <span style="font-family: ${MONO}; font-size: 16px; color: ${MC};">What the talent receives</span>
    <span style="font-family: ${SANS}; font-size: 28px; font-weight: 600;">Application closed — no response</span>
    <span style="font-family: ${SANS}; font-size: 25px; line-height: 1.5; color: ${MC};">Meridian Model Management did not respond within its review window. Treat this as a pass and keep going.</span>
  </div>`);

add('FollowUpFixed', 'light', `
  ${H(`Wednesday. ${it('Follow-up stays on the record.', MC)}`, { w: 1600, size: 72, at: { top: 90 } })}
  ${shot('messages.jpg', { left: 120, top: 250, width: 1120 })}
  ${phone('m-materials.jpg', { left: 1380, top: 230, width: 330 })}
  ${mono('Talent reply from their own email. No login.', { left: 120, top: 1000 - 70 }, MC, 19)}
  ${mono('Fresh digitals land on the same submission.', { left: 1300, top: 1000 - 70 }, MC, 19)}`);

add('Lineup', 'dark', `
  ${H(`Thursday. ${it('Side by side.', G)}`, { w: 800, at: { top: 90 } })}
  ${mono('Up to six. No score, no rank, no “best match”.', { left: 1060, top: 130 }, MV, 22)}
  ${shot('lineup.jpg', { left: 200, top: 250, width: 1520 }, true)}`);

add('Board', 'light', `
  ${H(`Friday.<br>${it('The board.', MC)}`, { w: 440 })}
  ${body('Everyone you’re considering, in the order decisions happen.', { left: 120, top: 300, width: 400 }, MC, 29)}
  ${mono('Needs a decision<br>Waiting on talent<br>Offer out<br>Represented', { left: 120, top: 520, width: 400 }, GD, 22)}
  ${shot('wall.jpg', { left: 600, top: 110, width: 1200 })}`);

// ================= CASTING =================
add('EventCall', 'dark', `
  ${H(`Casting a show? ${it('Same front door.', G)}`, { w: 1000 })}
  ${phone('m-event.jpg', { left: 120, top: 330, width: 300 }, true)}
  ${body('Every event call states what it pays — paid, stipend or unpaid — and that applicants must be 18 or older.', { left: 480, top: 360, width: 440 }, MV, 27)}
  ${shot('pool.jpg', { left: 980, top: 150, width: 820 }, true)}
  ${mono('Atelier Vey SS27 Presentation · the organizer’s pool', { left: 980, top: 700 }, MV, 19)}`);

add('DesignerPicks', 'light', `
  ${H(`Each designer ${it('picks from your pool.', MC)}`, { w: 1600, size: 72, at: { top: 90 } })}
  ${shot('picks.jpg', { left: 120, top: 240, width: 1000 })}
  ${phone('m-picks.jpg', { left: 1340, top: 230, width: 300 })}
  <div style="position: absolute; left: 1660px; top: 260px; width: 180px;"></div>
  ${mono('A private link per designer. No login. Digitals and measurements — never contact details.', { left: 120, top: 900, width: 1000 }, MC, 19)}
  ${mono('Pick · Maybe · Pass, back to you. Offers confirm within 72 hours.', { left: 1300, top: 900, width: 520 }, GD, 19)}`);

// ================= TALENT SIDE OF THE LOOP =================
add('TalentKeeps', 'dark', `
  ${H(`Why talent<br>${it('come back.', G)}`, { w: 600 })}
  ${body('Every applicant leaves with a profile: digitals, stats, and a comp card built from both.', { left: 120, top: 340, width: 540 }, MV, 29)}
  ${body('The next call takes a minute instead of four — and every submission shows where it stands.', { left: 120, top: 570, width: 540 }, MV, 29)}
  ${phone('m-claim.jpg', { left: 740, top: 130, width: 330 }, true)}
  ${shot('history.jpg', { left: 1110, top: 260, width: 700 }, true)}
  ${mono('Submission history', { left: 1110, top: 720 }, MV, 18)}`);

// ================= RUNNING IT =================
const roles = [['Owner', 'Everything, including the house'], ['Admin', 'Settings, team, links'], ['Agent', 'Review, decide, message'], ['Scout', 'Review and recommend'], ['Viewer', 'Read only']];
add('Team', 'warm', `
  ${H(`Your whole house, ${it('the right access.', GD)}`, { w: 700 })}
  <div style="position: absolute; left: 120px; top: 360px; width: 640px; display: flex; flex-direction: column;">
    ${roles.map(([r, d]) => `<div style="display: grid; grid-template-columns: 180px minmax(0, 1fr); align-items: baseline; padding: 20px 0; border-top: 1px solid ${RC};"><span style="font-family: ${SERIF}; font-size: 36px;">${r}</span><span style="font-family: ${SANS}; font-size: 23px; color: ${MC};">${d}</span></div>`).join('')}
  </div>
  ${shot('team.jpg', { left: 880, top: 110, width: 920 })}`);

const csv = ['Name', 'Email', 'Phone', 'City', 'Height', 'Measurements', 'Age', 'Notes', 'Tags', 'Status', 'Materials'];
add('Handoff', 'dark', `
  ${H(`Pholio hands off to ${it('the system you already run.', G)}`, { w: 1500 })}
  <div style="position: absolute; left: 120px; top: 400px; width: 440px; display: flex; flex-direction: column; gap: 14px;">
    <span style="font-family: ${SERIF}; font-size: 54px;">Pholio</span>
    <span style="font-family: ${SANS}; font-size: 23px; color: ${MV};">Submissions, decisions, notes</span>
  </div>
  <svg width="600" height="420" viewBox="0 0 600 420" style="position: absolute; left: 520px; top: 330px;" fill="none">
    <path d="M20 120 C 220 120, 300 60, 560 60" stroke="${G}" stroke-width="2"></path>
    <path d="M20 120 C 220 120, 300 300, 560 300" stroke="${G}" stroke-width="2"></path>
    <path d="M548 50 L562 60 L548 70" stroke="${G}" stroke-width="2"></path>
    <path d="M548 290 L562 300 L548 310" stroke="${G}" stroke-width="2"></path>
  </svg>
  <div style="position: absolute; left: 1120px; top: 340px; width: 680px; display: flex; flex-direction: column; gap: 14px;">
    <span style="font-family: ${SERIF}; font-size: 44px;">CSV, any time</span>
    <span style="font-family: ${MONO}; font-size: 19px; line-height: 1.6; color: ${MV};">${csv.join(' · ')}</span>
  </div>
  <div style="position: absolute; left: 1120px; top: 590px; width: 680px; display: flex; flex-direction: column; gap: 14px;">
    <span style="font-family: ${SERIF}; font-size: 44px;">A webhook, as it arrives</span>
    <span style="font-family: ${MONO}; font-size: 19px; line-height: 1.6; color: ${MV};">submission.received · signed · retried for up to 24 hours</span>
  </div>
  ${body('Your agency software stays your system of record. Pholio is the front door.', { left: 120, top: 860, width: 1200 }, C, 30)}`);

const ba = [
  ['Publish', 'A form, a Google Form, a post', 'One official link with your brief'],
  ['Arrive', 'Email, DMs, walk-ins', 'A guided application on a phone'],
  ['Collect', 'Attachments nobody can open', 'Digitals and stats in the shape you asked for'],
  ['Review', 'An inbox and a spreadsheet', 'The desk and the Review Room'],
  ['Follow up', 'Threads across inboxes', 'Requests and replies on the submission'],
  ['Close', 'Usually, nowhere', 'A decision, or an honest automatic close'],
];
add('BeforeAfter', 'light', `
  ${H(`The same week, ${it('two ways.', MC)}`, { w: 1000, at: { top: 90 } })}
  <div style="position: absolute; left: 120px; right: 120px; top: 250px; display: flex; flex-direction: column;">
    <div style="display: grid; grid-template-columns: 260px minmax(0, 1fr) minmax(0, 1fr); padding-bottom: 14px; font-family: ${MONO}; font-size: 18px; color: ${MC};"><span></span><span>Today</span><span style="color: ${GD};">With Pholio</span></div>
    ${ba.map(([s, a, b]) => `<div style="display: grid; grid-template-columns: 260px minmax(0, 1fr) minmax(0, 1fr); align-items: baseline; padding: 22px 0; border-top: 1px solid ${RC};"><span style="font-family: ${SERIF}; font-size: 38px;">${s}</span><span style="font-family: ${SANS}; font-size: 25px; color: ${MC}; text-decoration: line-through; text-decoration-color: rgba(26,24,21,0.3);">${a}</span><span style="font-family: ${SANS}; font-size: 25px; font-weight: 500;">${b}</span></div>`).join('')}
  </div>`);

// ================= OBJECTIONS =================
add('WhyChangeForm', 'dark', `
  ${question('Why would we change our existing form?', true)}
  <div style="position: absolute; left: 980px; top: 130px; width: 820px; display: flex; flex-direction: column; gap: 30px;">
    <p style="font-family: ${SERIF}; font-size: 64px; line-height: 1.06;">You don’t have to take it down.</p>
    <p style="font-family: ${SANS}; font-size: 29px; line-height: 1.45; color: ${MV};">Run one Pholio link beside it for one call. Compare what arrives, how long review takes, and who heard back.</p>
  </div>
  <div style="position: absolute; left: 980px; right: 120px; top: 640px; display: flex; flex-direction: column; gap: 28px;">
    ${[['Your form', RV, 'Inbox · spreadsheet · follow-up by hand'], ['Pholio link', G, 'Desk · Review Room · replies on the record']].map(([t, c, d]) => `<div style="display: grid; grid-template-columns: 220px minmax(0, 1fr); align-items: center; gap: 24px;"><span style="font-family: ${SERIF}; font-size: 34px;">${t}</span><div style="display: flex; flex-direction: column; gap: 10px;"><span style="height: 3px; background: ${c};"></span><span style="font-family: ${MONO}; font-size: 18px; color: ${MV};">${d}</span></div></div>`).join('')}
  </div>`);

add('NeedPholioAlready', 'light', `
  ${question('Does talent need to already use Pholio?')}
  <p style="position: absolute; left: 980px; top: 80px; font-family: ${SERIF}; font-weight: 300; font-size: 300px; line-height: 1;">No.</p>
  ${body('Anyone applies from your link, without an account. Afterwards they can keep what they sent as a Pholio profile.', { left: 990, top: 470, width: 800 }, INK, 32)}
  ${body('Talent already on Pholio apply with the record they keep.', { left: 990, top: 680, width: 800 }, MC, 28)}`);

add('Friction', 'dark', `
  ${question('Does this add friction to applying?', true)}
  ${body('One question per screen. Photos last. No account. Applicants know what’s next before they start.', { left: 120, top: 400, width: 700 }, MV, 30)}
  <div style="position: absolute; left: 960px; top: 110px; display: grid; grid-template-columns: repeat(3, 260px); gap: 30px;">
    ${['m-born.jpg', 'm-email.jpg', 'm-photos.jpg'].map((s) => `<div style="padding: 6px; border-radius: 34px; background: #1C1B19; border: 1px solid rgba(250,247,242,0.14);"><img src="${s}" alt="" style="display: block; width: 100%; border-radius: 28px;"></div>`).join('')}
  </div>
  ${mono('About four minutes, start to sent.', { left: 960, top: 710 }, G, 22)}`);

add('Replaces', 'warm', `
  ${question('What does it replace — and what does it sit beside?')}
  <div style="position: absolute; left: 980px; right: 120px; top: 130px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 60px;">
    ${[['Replaces', ['The application form', 'The intake inbox', 'Tracking who heard back', 'Decline emails', 'The shortlist spreadsheet'], INK], ['Sits beside', ['Your agency software', 'Your website', 'Instagram', 'Open calls in person', 'Your mother-agency relationships'], MC]].map(([t, items, col]) => `<div style="display: flex; flex-direction: column;"><span style="font-family: ${SERIF}; font-style: italic; font-weight: 300; font-size: 44px; padding-bottom: 20px; color: ${t === 'Replaces' ? GD : MC};">${t}</span>${items.map((x) => `<span style="font-family: ${SANS}; font-size: 27px; padding: 20px 0; border-top: 1px solid ${RC}; color: ${col};">${x}</span>`).join('')}</div>`).join('')}
  </div>`);

add('Cost', 'dark', `
  ${question('What does it cost the agency?', true)}
  <p style="position: absolute; left: 960px; top: 90px; font-family: ${SERIF}; font-weight: 300; font-size: 196px; line-height: 1; color: ${G};">Nothing.</p>
  ${body('Pholio doesn’t charge agencies or casting organizations. Applying is free for talent.', { left: 970, top: 430, width: 820 }, C, 32)}
  ${body('Talent can pay for studio tools they keep — never for access, visibility, or a better place in your desk.', { left: 970, top: 620, width: 820 }, MV, 28)}`);

const trust = [
  ['Your team', 'sees applicants by role.'],
  ['Designers', 'see digitals and measurements only, through a private link.'],
  ['No applicant', 'is scored, ranked or matched by AI.'],
  ['Talent', 'choose whether they can be discovered.'],
  ['Every applicant', 'agrees to the exact terms of your call.'],
];
add('DataAndAI', 'light', `
  ${question('Who sees our applicants’ data — and is AI judging them?')}
  <div style="position: absolute; left: 980px; right: 120px; top: 130px; display: flex; flex-direction: column;">
    ${trust.map(([a, b]) => `<div style="padding: 26px 0; border-top: 1px solid ${RC}; font-size: 30px; line-height: 1.35;"><span style="font-family: ${SERIF}; font-size: 36px;">${a}</span> <span style="font-family: ${SANS}; color: ${MC};">${b}</span></div>`).join('')}
  </div>`);

const steps6 = ['Agency profile', 'Boards and markets', 'Team and permissions', 'Open call routing', 'Operating defaults', 'Privacy'];
add('Setup', 'dark', `
  ${question('How long does it take to set up?', true)}
  <p style="position: absolute; left: 980px; top: 110px; font-family: ${SERIF}; font-size: 120px; line-height: 1;">Six steps.</p>
  <div style="position: absolute; left: 980px; right: 120px; top: 300px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 48px;">
    ${steps6.map((s, i) => `<div style="display: flex; gap: 20px; align-items: baseline; padding: 22px 0; border-top: 1px solid ${RV};"><span style="font-family: ${MONO}; font-size: 18px; color: ${G};">${i + 1}</span><span style="font-family: ${SANS}; font-size: 28px;">${s}</span></div>`).join('')}
  </div>
  ${body('“Most of it is confirming what we already hold on file.”', { left: 980, top: 640, width: 820 }, MV, 28)}`);

// ================= CLOSE =================
const next = [
  ['Request access', 'Every agency is reviewed by hand.'],
  ['Set up your house', 'Six steps.'],
  ['Publish one call', 'Beside your current form.'],
  ['Review a season', 'Compare what arrived, side by side.'],
];
add('StartWithOneCall', 'warm', `
  ${H(`Start with ${it('one call.', GD)}`, { w: 1000, size: 110, at: { top: 150 } })}
  <div style="position: absolute; left: 120px; right: 120px; top: 520px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0;">
    ${next.map(([t, d], i) => `<div style="display: flex; flex-direction: column; gap: 18px; padding: 30px 34px 0; border-top: 2px solid ${i === 0 ? G : RC}; ${i ? '' : 'padding-left: 0;'}"><span style="font-family: ${MONO}; font-size: 20px; color: ${GD};">${i + 1}</span><span style="font-family: ${SERIF}; font-size: 44px; line-height: 1.05;">${t}</span><span style="font-family: ${SANS}; font-size: 25px; color: ${MC};">${d}</span></div>`).join('')}
  </div>
  ${mono('app.pholio.studio · [CONTACT EMAIL]', { left: 120, top: 880 }, INK, 24)}`);

add('Close', 'dark', `
  <div style="position: absolute; left: 0; right: 0; top: 340px; display: flex; flex-direction: column; align-items: center; gap: 40px;">
    <p style="font-family: ${SERIF}; font-size: 150px; line-height: 0.9; letter-spacing: 0.08em; color: ${C}; -webkit-text-stroke: 1.2px rgba(201,165,90,0.5);">PHOLIO</p>
    <p style="font-family: ${SERIF}; font-style: italic; font-weight: 300; font-size: 54px; color: ${C};">A better front door for talent.</p>
    <p style="font-family: ${MONO}; font-size: 22px; color: ${G};">app.pholio.studio · [CONTACT EMAIL]</p>
  </div>`);

// ---------- write ----------
const total = slides.length;
const artboards = slides.map((s, i) => {
  writeFileSync(new URL(`${s.name}.dc.html`, OUT), page(i + 1, total, s.tone, s.body));
  return { file: `${s.name}.dc.html`, x: (i % 6) * 2040, y: Math.floor(i / 6) * 1240, w: 1920, h: 1080, print: 'fixed' };
});
writeFileSync(new URL('canvas.json', OUT), JSON.stringify({ artboards, launch: { view: 'canvas' } }, null, 2));
const imgs = new Set();
slides.forEach((s) => [...s.body.matchAll(/src="([a-z0-9-]+\.jpg)"/g)].forEach((m) => imgs.add(m[1])));
writeFileSync(new URL('args.txt', OUT), [...slides.map((s) => `--artboard deck/${s.name}.dc.html`), ...[...imgs].map((f) => `--image img/${f}`), '--canvas deck/canvas.json'].join('\n'));
console.log(total, 'slides;', imgs.size, 'images');
