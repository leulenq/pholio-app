const {
  describeDevice,
  deviceFingerprint,
  stampSessionDevice,
} = require("../../src/shared/lib/session-device");

// Real User-Agent strings. The bug this replaces reported every session as a
// desktop "Browser session", so an iPhone showed a desktop icon — the phone
// cases below are the regression that matters most.
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  androidTablet:
    "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  ipad:
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.2535.51",
  windowsFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
};

describe("describeDevice", () => {
  test("an iPhone is a phone, not a desktop", () => {
    const device = describeDevice(UA.iphoneSafari);
    expect(device.type).toBe("phone");
    expect(device.os).toBe("iOS");
    expect(device.browser).toBe("Safari");
    expect(device.label).toBe("Safari on iOS");
  });

  test("Chrome on iOS reports Chrome, not Safari, despite the WebKit UA", () => {
    const device = describeDevice(UA.iphoneChrome);
    expect(device.type).toBe("phone");
    expect(device.browser).toBe("Chrome");
    expect(device.label).toBe("Chrome on iOS");
  });

  test("Android phone vs Android tablet split on the Mobile token", () => {
    expect(describeDevice(UA.androidChrome).type).toBe("phone");
    expect(describeDevice(UA.androidTablet).type).toBe("tablet");
  });

  test("an iPad is a tablet", () => {
    expect(describeDevice(UA.ipad).type).toBe("tablet");
  });

  test("desktops are desktops", () => {
    expect(describeDevice(UA.macSafari)).toMatchObject({
      type: "desktop",
      os: "macOS",
      browser: "Safari",
    });
    expect(describeDevice(UA.windowsFirefox)).toMatchObject({
      type: "desktop",
      os: "Windows",
      browser: "Firefox",
    });
  });

  test("Edge is Edge, not Chrome — it claims both", () => {
    expect(describeDevice(UA.windowsEdge).browser).toBe("Edge");
  });

  test("a missing or empty UA is reported as unrecognised, never guessed", () => {
    for (const value of [null, undefined, "", "   "]) {
      const device = describeDevice(value);
      expect(device.type).toBe("unknown");
      expect(device.label).toBe("Unrecognised device");
    }
  });
});

describe("deviceFingerprint", () => {
  test("the same device is stable across browser patch versions", () => {
    // The whole point: hashing the raw UA would make a laptop look like a brand
    // new device after every Chrome update, recreating row-per-visit growth.
    const may = UA.macChrome;
    const june = UA.macChrome.replace("125.0.0.0", "126.0.6478.127");
    expect(deviceFingerprint(june)).toBe(deviceFingerprint(may));
  });

  test("different devices get different fingerprints", () => {
    const prints = new Set(
      [UA.iphoneSafari, UA.macChrome, UA.windowsEdge, UA.androidChrome].map(
        deviceFingerprint,
      ),
    );
    expect(prints.size).toBe(4);
  });

  test("two browsers on the same machine are separate devices", () => {
    expect(deviceFingerprint(UA.macSafari)).not.toBe(
      deviceFingerprint(UA.macChrome),
    );
  });
});

describe("stampSessionDevice", () => {
  test("records the description, fingerprint and IP onto the session", () => {
    const req = {
      session: {},
      headers: { "user-agent": UA.iphoneSafari },
      ip: "203.0.113.7",
    };

    const stamp = stampSessionDevice(req);

    expect(stamp).toMatchObject({
      type: "phone",
      label: "Safari on iOS",
      os: "iOS",
      ip: "203.0.113.7",
    });
    expect(stamp.fingerprint).toEqual(expect.any(String));
    expect(req.session.device).toEqual(stamp);
    expect(Date.parse(stamp.signedInAt)).not.toBeNaN();
  });

  test("no session means no throw", () => {
    expect(stampSessionDevice({})).toBeNull();
    expect(stampSessionDevice(null)).toBeNull();
  });
});
