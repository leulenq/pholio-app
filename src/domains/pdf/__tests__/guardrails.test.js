const { evaluateCompCardGuardrails } = require("../guardrails");

function image(id, overrides = {}) {
  return {
    id,
    path: `/uploads/${id}.jpg`,
    width: 2000,
    height: 3000,
    metadata: JSON.stringify({ usage_rights: "licensed" }),
    ...overrides,
  };
}

describe("evaluateCompCardGuardrails", () => {
  test("passes with complete selection and metadata", () => {
    const images = [
      image("img-1"),
      image("img-2"),
      image("img-3"),
      image("img-4"),
      image("img-5"),
    ];
    const report = evaluateCompCardGuardrails({
      profile: { first_name: "Mia", last_name: "Voss", height_cm: 178 },
      images,
      heroImage: images[0],
      gridImages: images.slice(1, 5),
      mode: "master",
    });

    expect(report.mode).toBe("master");
    expect(report.status).toBe("pass");
    expect(report.blockingIssueCount).toBe(0);
  });

  test("fails when required slots are missing", () => {
    const images = [
      image("img-1"),
      image("img-2"),
      image("img-3"),
      image("img-4"),
    ];
    const report = evaluateCompCardGuardrails({
      profile: { first_name: "Mia", last_name: "Voss", height_cm: 178 },
      images,
      heroImage: images[0],
      gridImages: [images[1], images[2], null, null],
      mode: "master",
    });

    expect(report.status).toBe("fail");
    expect(report.blockingIssueCount).toBeGreaterThan(0);
    expect(
      report.blockingIssues.some((issue) => issue.id === "grid-slots-required"),
    ).toBe(true);
  });

  test("fails when rights metadata is missing and warns on low print size", () => {
    const images = [
      image("img-1", { metadata: null, width: 900, height: 1300 }),
      image("img-2"),
      image("img-3"),
      image("img-4"),
      image("img-5"),
    ];
    const report = evaluateCompCardGuardrails({
      profile: { first_name: "Mia", last_name: "Voss", height_cm: null },
      images,
      heroImage: images[0],
      gridImages: images.slice(1, 5),
      mode: "draft",
    });

    expect(report.status).toBe("fail");
    expect(report.blockingIssueCount).toBeGreaterThan(0);
    expect(
      report.checks.some((check) => check.id === "print-min-resolution"),
    ).toBe(true);
    expect(
      report.checks.some(
        (check) =>
          check.id === "rights-metadata-present" && check.level === "error",
      ),
    ).toBe(true);
  });
});
