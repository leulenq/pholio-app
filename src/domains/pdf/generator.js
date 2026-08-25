const { URL } = require("url");
const knex = require("../../shared/db/knex");
const config = require("../../config");
const { toFeetInches } = require("../talent/services/stats");
const { applyImageVisibility } = require("../../shared/lib/profile-visibility");
// AUDIENCE is defined and exported by audience-dto (profile-visibility only
// consumes it internally and does not re-export it). Importing it from
// profile-visibility yielded `undefined`, so `AUDIENCE.PUBLIC` at the image-
// visibility call threw a TypeError and 500'd every PDF generation.
const { AUDIENCE } = require("../../shared/lib/audience-dto");
const compCardDimensions = require("../../../shared/comp-card-dimensions.json");

const {
  trim: { widthInches: compCardWidthInches },
  render: {
    widthPixels: compCardWidthPixels,
    heightPixels: compCardHeightPixels,
  },
} = compCardDimensions;

// Chromium for serverless environments (Netlify Functions, AWS Lambda).
//
// @sparticuz/chromium v149 is pure ESM. require()ing it from this CommonJS
// module throws ERR_REQUIRE_ESM, which the old top-level require() swallowed
// into a bare "not available" warning — so comp-card PDFs silently had no
// browser in Lambda. It must be loaded with a dynamic import().
//
// The import is routed through `new Function` so esbuild cannot see the
// specifier and rewrite it into a require() while bundling the function for
// CJS, which would reintroduce ERR_REQUIRE_ESM. The package stays listed in
// netlify.toml external_node_modules so it ships from node_modules.
const importESM = new Function("specifier", "return import(specifier);");

let chromiumPromise = null;

/** Resolves the chromium module, or null when it cannot be loaded. Cached. */
function loadChromium() {
  if (!config.isServerless) return Promise.resolve(null);
  if (!chromiumPromise) {
    chromiumPromise = importESM("@sparticuz/chromium")
      .then((mod) => mod.default || mod)
      .catch((error) => {
        // Lambda has no fallback browser, so this means PDFs are broken. Say
        // why: MODULE_NOT_FOUND = did not ship; anything else = shipped but
        // would not load.
        console.warn(
          `[renderCompCard] @sparticuz/chromium not available (${error.code || "no code"}: ${error.message}) — ` +
            `node ${process.version}. Falling back to default Puppeteer, which has no browser binary in Lambda.`,
        );
        return null;
      });
  }
  return chromiumPromise;
}

// puppeteer is large and slow to load (hundreds of ms even locally; more under
// a genuinely cold serverless container). This module used to require() it
// unconditionally at the top, which meant EVERY cold Lambda invocation paid
// that cost before handling a request — including requests with nothing to do
// with PDF generation (e.g. /api/login), since app.js requires this whole
// routes module eagerly at boot. Load it lazily on first actual use instead.
let puppeteerPromise = null;

/**
 * puppeteer v25 is pure ESM, so require() throws ERR_REQUIRE_ESM from this
 * CommonJS bundle — the same failure as @sparticuz/chromium above. Loaded via
 * the same bundler-opaque dynamic import, still lazily so cold invocations
 * that never render a PDF do not pay for it. Returns a promise; callers await.
 */
function getPuppeteer() {
  if (!puppeteerPromise) {
    puppeteerPromise = importESM("puppeteer").then((mod) => mod.default || mod);
  }
  return puppeteerPromise;
}

async function loadProfile(slug) {
  try {
    const profile = await knex("profiles").where({ slug }).first();
    if (!profile) return null;
    const imagesQuery = knex("images")
      .leftJoin("image_rights", "image_rights.image_id", "images.id")
      .where({ "images.profile_id": profile.id });
    // Comp cards and digitals sheets are outward-facing documents: images
    // pending moderation review (or rejected/hidden) must never render on
    // them, and the hero pick below must draw from the same filtered set.
    applyImageVisibility(imagesQuery, AUDIENCE.PUBLIC, { table: "images" });
    const images = await imagesQuery
      .select(
        "images.*",
        "image_rights.rights_status as rights_status",
        "image_rights.license_type as license_type",
        "image_rights.copyright_owner as copyright_owner",
        "image_rights.photographer_name as photographer_name",
        "image_rights.model_release_ref as model_release_ref",
      )
      .orderBy("images.sort")
      .orderBy("images.id");

    // Derive hero_image_path for backward compatibility in PDF views
    const primary = images.find((img) => img.is_primary) || images[0];
    profile.hero_image_path = primary
      ? primary.public_url || primary.path
      : null;

    return { profile, images };
  } catch (error) {
    // Log database errors for debugging
    console.error("[loadProfile] Database error:", {
      message: error.message,
      code: error.code,
      name: error.name,
      slug: slug,
    });
    // Re-throw error with context for route handlers to catch
    throw error;
  }
}

async function renderCompCard(slug, theme = null, opts = null) {
  if (config.nodeEnv === "test") {
    return Buffer.from(`PDF placeholder for ${slug}`);
  }

  let browser = null;

  try {
    // Build URL with theme parameter
    let target;
    try {
      console.log("[renderCompCard] Building PDF view URL:", {
        pdfBaseUrl: config.pdfBaseUrl,
        slug: slug,
        theme: theme,
        nodeEnv: config.nodeEnv,
        isServerless: config.isServerless,
      });

      const url = new URL(`/pdf/view/${slug}`, config.pdfBaseUrl);
      if (theme) {
        url.searchParams.set("theme", theme);
      }
      const genSeed = opts && opts.seed;
      if (genSeed != null && genSeed !== "") {
        url.searchParams.set(
          "seed",
          String(Array.isArray(genSeed) ? genSeed[0] : genSeed),
        );
      }
      const genLayoutFamily = opts && opts.layoutFamily;
      if (genLayoutFamily != null && genLayoutFamily !== "") {
        url.searchParams.set(
          "layoutFamily",
          String(
            Array.isArray(genLayoutFamily)
              ? genLayoutFamily[0]
              : genLayoutFamily,
          ),
        );
      }
      const genStyleVariant = opts && opts.styleVariant;
      if (genStyleVariant != null && genStyleVariant !== "") {
        url.searchParams.set(
          "styleVariant",
          String(
            Array.isArray(genStyleVariant)
              ? genStyleVariant[0]
              : genStyleVariant,
          ),
        );
      }
      const genLockHeroId = opts && opts.lockHeroId;
      if (genLockHeroId != null && genLockHeroId !== "") {
        url.searchParams.set(
          "lockHeroId",
          String(
            Array.isArray(genLockHeroId) ? genLockHeroId[0] : genLockHeroId,
          ),
        );
      }
      const genLockGridIds = opts && opts.lockGridIds;
      if (genLockGridIds != null && genLockGridIds !== "") {
        url.searchParams.set(
          "lockGridIds",
          String(
            Array.isArray(genLockGridIds) ? genLockGridIds[0] : genLockGridIds,
          ),
        );
      }
      const genEngine = opts && opts.engine;
      if (genEngine != null && genEngine !== "") {
        url.searchParams.set(
          "engine",
          String(Array.isArray(genEngine) ? genEngine[0] : genEngine),
        );
      }
      const genUnits = opts && opts.units;
      if (genUnits != null && genUnits !== "") {
        url.searchParams.set(
          "units",
          String(Array.isArray(genUnits) ? genUnits[0] : genUnits),
        );
      }
      // Composed-engine art direction params: pinned structure, board
      // conditioning, and frozen preset id must survive into the internal
      // /pdf/view navigation or downloads would silently lose the design.
      for (const key of ["structure", "treatment", "board", "preset", "backArchitecture"]) {
        const value = opts && opts[key];
        if (value != null && value !== "") {
          url.searchParams.set(key, String(Array.isArray(value) ? value[0] : value));
        }
      }
      const genPrint = opts && opts.print;
      if (genPrint != null && genPrint !== "") {
        url.searchParams.set(
          "print",
          String(Array.isArray(genPrint) ? genPrint[0] : genPrint),
        );
      }
      target = url.toString();

      console.log("[renderCompCard] Target URL:", target);
    } catch (urlError) {
      console.error("[renderCompCard] Error constructing URL:", {
        message: urlError.message,
        pdfBaseUrl: config.pdfBaseUrl,
        slug: slug,
        theme: theme,
      });
      throw new Error(
        `Invalid PDF base URL: ${config.pdfBaseUrl}. Please check your configuration.`,
      );
    }

    // Puppeteer configuration for serverless environments
    // Additional args for better compatibility with AWS Lambda/Netlify Functions
    const puppeteerArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process", // Important for serverless
      "--disable-gpu",
    ];

    // For serverless environments, use @sparticuz/chromium
    let launchOptions = {
      headless: "new",
      args: puppeteerArgs,
    };

    const chromium = await loadChromium();

    if (config.isServerless && chromium) {
      // Use @sparticuz/chromium for Netlify Functions
      console.log(
        "[renderCompCard] Using @sparticuz/chromium for serverless environment",
      );

      // executablePath() may be async in newer versions, handle both cases
      let executablePath;
      try {
        executablePath = chromium.executablePath();
        // If it's a Promise, await it
        if (executablePath && typeof executablePath.then === "function") {
          executablePath = await executablePath;
        }
      } catch (error) {
        console.error(
          "[renderCompCard] Error getting Chromium executable path:",
          error,
        );
        throw new Error(
          "Failed to get Chromium executable path for serverless environment.",
        );
      }

      launchOptions.executablePath = executablePath;
      // Add serverless-specific args (chromium.args is already optimized for serverless)
      launchOptions.args = [
        ...chromium.args,
        ...puppeteerArgs,
        "--hide-scrollbars",
        "--disable-web-security",
      ];
    } else if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      // Allow custom executable path override
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    try {
      console.log("[renderCompCard] Launching Puppeteer:", {
        isServerless: config.isServerless,
        hasChromium: !!chromium,
        executablePath: launchOptions.executablePath ? "set" : "default",
        executablePathType: typeof launchOptions.executablePath,
      });

      browser = await (await getPuppeteer()).launch(launchOptions);
    } catch (launchError) {
      console.error("[renderCompCard] Error launching Puppeteer browser:", {
        message: launchError.message,
        code: launchError.code,
        name: launchError.name,
      });
      throw new Error(
        "Failed to launch PDF browser. Please check your server configuration.",
      );
    }

    try {
      const page = await browser.newPage();
      let viewResponse = null;

      // Set viewport size to match PDF dimensions (important for proper rendering)
      await page.setViewport({
        width: compCardWidthPixels,
        height: compCardHeightPixels,
        deviceScaleFactor: 2, // Higher DPI for better quality
      });

      // ── P4 vision jury (opt-in) ───────────────────────────────────────
      // Render each front candidate to a PNG, let llama-4-scout rank them,
      // then re-render the winning candidate. Opt-in (adds K front renders
      // + one Groq call); silently skipped without a key or on any failure.
      const juryOn =
        opts && opts.jury && process.env.GROQ_API_KEY && config.nodeEnv !== "test";
      if (juryOn) {
        try {
          const { rankFrontCandidates } = require("./composition/front-program/jury");
          const K = 5;
          const candUrl = (i) => {
            const u = new URL(target);
            u.searchParams.set("candidate", String(i));
            return u.toString();
          };
          const renderPng = async (program) => {
            await page.goto(candUrl(program.index), {
              waitUntil: "networkidle0",
              timeout: 30000,
            });
            await page.evaluate(async () => {
              try { await document.fonts.ready; } catch (e) { /* continue */ }
            });
            await new Promise((r) => setTimeout(r, 400));
            const el = await page.$("#front");
            if (!el) return null;
            return Buffer.from(await el.screenshot({ type: "png" }));
          };
          const candidates = Array.from({ length: K }, (_, i) => ({
            program: { index: i },
            score: 0, // flat aesthetics here → vision-led blend (documented)
          }));
          const ranked = await rankFrontCandidates({
            candidates,
            renderPng,
            timeoutMs: 14000,
          });
          if (ranked && Number.isInteger(ranked.winnerIndex)) {
            target = candUrl(ranked.winnerIndex);
            console.log(
              `[renderCompCard] jury winner candidate ${ranked.winnerIndex}: ${ranked.rationale || ""}`,
            );
          }
        } catch (juryErr) {
          console.warn("[renderCompCard] jury skipped:", juryErr.message);
        }
      }

      // Navigate to PDF view URL with timeout
      try {
        console.log("[renderCompCard] Navigating to PDF view URL:", target);
        // Keep the response: the composed view exposes wordmark geometry +
        // portfolio URL via headers, consumed for PDF link post-processing.
        viewResponse = await page.goto(target, {
          waitUntil: "networkidle0",
          timeout: 30000, // 30 second timeout
        });
        console.log("[renderCompCard] Successfully navigated to PDF view URL");

        // Wait for fonts and images to load completely
        // This ensures the page is fully rendered before generating PDF
        try {
          console.log("[renderCompCard] Waiting for page content to load...");

          // Wait for network to be idle (already waited with networkidle0, but add extra buffer)
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Wait for all images to load
          await page.evaluate(() => {
            return Promise.all(
              Array.from(document.images).map((img) => {
                if (img.complete && img.naturalHeight !== 0) {
                  return Promise.resolve();
                }
                return new Promise((resolve) => {
                  const timeout = setTimeout(resolve, 10000); // 10 second timeout per image
                  img.onload = () => {
                    clearTimeout(timeout);
                    resolve();
                  };
                  img.onerror = () => {
                    clearTimeout(timeout);
                    resolve(); // Continue even if image fails
                  };
                });
              }),
            );
          });

          // Wait for fonts to load
          await page.evaluate(async () => {
            try {
              await document.fonts.ready;
            } catch (e) {
              // Fonts might not be available, continue anyway
            }
          });

          // Wait for CSS to apply and layout to stabilize
          await page.evaluate(() => {
            return new Promise((resolve) => {
              // Wait for next animation frame
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  setTimeout(resolve, 500); // Additional 500ms for layout stability
                });
              });
            });
          });

          // Composed template only: wait for the rendered-geometry fit guard
          // (name overflow self-heal) and log its report — the tripwire that
          // keeps "name drowned into the photo" impossible at print time.
          try {
            const isComposed = await page.evaluate(
              () => document.body?.dataset?.compcardEngine === "composed",
            );
            if (isComposed) {
              await page.waitForFunction(
                () => document.body.getAttribute("data-name-fit-done") === "1",
                { timeout: 4000 },
              );
              const fitReport = await page.evaluate(() =>
                document.body.getAttribute("data-name-fit"),
              );
              if (fitReport) {
                console.log("[renderCompCard] name-fit report:", fitReport);
                // Post-render integrity loop: the fit guard self-heals, but a
                // LARGE correction means the composer shipped geometry far
                // from what it verified — that is an engine regression to
                // surface loudly (telemetry tripwire), never to ship silently.
                try {
                  const parsed = JSON.parse(fitReport);
                  if (parsed && parsed.floorHits > 0) {
                    // Booker's law gate: the fit guard had to clamp the name
                    // at the 14pt floor — the composer shipped geometry it
                    // could not honor. Fail the take; the route's engine
                    // fallback produces a verified card instead of this one
                    // shipping with an unreadable or floor-clamped name.
                    throw Object.assign(
                      new Error(
                        `rendered name hit the 14pt floor (${parsed.floorHits} span(s)) — take rejected`,
                      ),
                      { code: "COMPCARD_NAME_FLOOR" },
                    );
                  }
                  if (parsed && (parsed.minScale < 0.8 || parsed.ghostsRemoved > 0)) {
                    console.error(
                      "[renderCompCard] RENDERED-NAME-INTEGRITY: fit guard made a non-trivial repair",
                      parsed,
                    );
                  }
                } catch (gateErr) {
                  if (gateErr && gateErr.code === "COMPCARD_NAME_FLOOR") throw gateErr;
                  /* report parse is best-effort */
                }
              }
            }
          } catch (fitErr) {
            if (fitErr && fitErr.code === "COMPCARD_NAME_FLOOR") throw fitErr;
            console.warn(
              "[renderCompCard] name-fit guard did not report:",
              fitErr.message,
            );
          }

          // Verify page has content and is visible
          const pageInfo = await page.evaluate(() => {
            // Support both the new 2-page template (.comp-card-page) and the legacy template (.comp-card)
            const compCard =
              document.querySelector(".comp-card-page") ||
              document.querySelector(".comp-card");
            const body = document.body;
            const computedStyle = compCard
              ? window.getComputedStyle(compCard)
              : null;

            return {
              hasCompCard: compCard !== null,
              compCardHTML: compCard ? compCard.innerHTML.length : 0,
              compCardText: compCard ? compCard.textContent.trim().length : 0,
              bodyHTML: body.innerHTML.length,
              bodyText: body.textContent.trim().length,
              bgColor: computedStyle ? computedStyle.backgroundColor : null,
              color: computedStyle ? computedStyle.color : null,
              display: computedStyle ? computedStyle.display : null,
              visibility: computedStyle ? computedStyle.visibility : null,
              opacity: computedStyle ? computedStyle.opacity : null,
              width: computedStyle ? computedStyle.width : null,
              height: computedStyle ? computedStyle.height : null,
            };
          });

          console.log("[renderCompCard] Page content check:", pageInfo);

          if (!pageInfo.hasCompCard || pageInfo.compCardHTML === 0) {
            console.error(
              "[renderCompCard] ERROR: Page has no comp-card content!",
            );
            // Log full page HTML for debugging
            const pageHTML = await page.content();
            console.error(
              "[renderCompCard] Full page HTML length:",
              pageHTML.length,
            );
            console.error(
              "[renderCompCard] First 1000 chars of HTML:",
              pageHTML.substring(0, 1000),
            );

            // Check if there are any errors in the console
            const consoleLogs = await page.evaluate(() => {
              return window.consoleErrors || [];
            });
            if (consoleLogs.length > 0) {
              console.error("[renderCompCard] Console errors:", consoleLogs);
            }
          } else if (pageInfo.compCardText === 0) {
            console.warn(
              "[renderCompCard] WARNING: Comp card has no text content (might be CSS issue)",
            );
            console.warn("[renderCompCard] Styles:", {
              bgColor: pageInfo.bgColor,
              color: pageInfo.color,
              display: pageInfo.display,
              visibility: pageInfo.visibility,
              opacity: pageInfo.opacity,
            });
          } else {
            console.log(
              "[renderCompCard] Page content verified, ready for PDF generation",
            );
            console.log("[renderCompCard] Content stats:", {
              compCardHTML: pageInfo.compCardHTML,
              compCardText: pageInfo.compCardText,
              bodyHTML: pageInfo.bodyHTML,
              bodyText: pageInfo.bodyText,
            });
          }

          // Additional safety wait
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (waitError) {
          console.error(
            "[renderCompCard] Error waiting for page load:",
            waitError.message,
          );
          console.error("[renderCompCard] Stack:", waitError.stack);
          // Continue anyway - sometimes pages load even if wait fails
        }

        console.log("[renderCompCard] Page fully loaded and rendered");
      } catch (navigationError) {
        console.error("[renderCompCard] Error navigating to PDF view URL:", {
          message: navigationError.message,
          target: target,
          code: navigationError.code,
          name: navigationError.name,
          stack: navigationError.stack,
        });
        throw new Error(
          `Failed to load PDF view: ${navigationError.message}. Please check that the PDF view URL is accessible.`,
        );
      }

      await page.emulateMediaType("print");

      // Generate PDF with timeout and optimization settings
      let buffer;
      try {
        buffer = await page.pdf({
          width: `${compCardWidthInches}in`,
          // No fixed height — let the CSS @page size and
          // break-after: page handle multi-page pagination naturally.
          margin: { top: "0", bottom: "0", left: "0", right: "0" },
          printBackground: true,
          timeout: 30000, // 30 second timeout
          // Let CSS @page rule control page size
          preferCSSPageSize: true,
          // Disable tagged PDF to reduce size
          tagged: false,
        });

        // Puppeteer may return Uint8Array in newer versions.
        // Normalize to Buffer so Express sends binary PDF bytes instead of JSON.
        if (!Buffer.isBuffer(buffer)) {
          buffer = Buffer.from(buffer);
        }

        // Premium portfolio link: when the composed view exposed wordmark
        // geometry headers, stamp clickable link annotations + metadata onto
        // the finished PDF. Fail-soft — a post-processing problem never
        // blocks the card. Headers appear only once the composed engine v2
        // emits them; until then this block no-ops with a debug log.
        try {
          const headers = viewResponse ? viewResponse.headers() : {};
          const portfolioUrl = headers["x-compcard-portfolio-url"];
          const parseMark = (value, pageIndex) => {
            if (!value) return null;
            const parts = String(value).split(",").map(Number);
            if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
              return null;
            }
            const [xIn, yIn, wIn, hIn] = parts;
            return { pageIndex, xIn, yIn, wIn, hIn };
          };
          const wordmarks = [
            parseMark(headers["x-compcard-wordmark-front"], 0),
            parseMark(headers["x-compcard-wordmark-back"], 1),
          ].filter(Boolean);

          if (portfolioUrl && wordmarks.length) {
            const {
              embedPortfolioLink,
            } = require("./composition/portfolio-link");
            const title =
              headers["x-compcard-title"] || `${slug} — Comp Card`;
            buffer = await embedPortfolioLink(buffer, {
              url: portfolioUrl,
              title,
              subject: portfolioUrl,
              wordmarks,
            });
            console.log(
              "[portfolio-link] wordmark link embedded:",
              portfolioUrl,
              `(${wordmarks.length} page(s))`,
            );
          } else {
            console.log(
              "[portfolio-link] no wordmark headers on view response; skipping link embed",
            );
          }
        } catch (linkError) {
          console.warn(
            "[portfolio-link] post-processing failed, serving unannotated PDF:",
            linkError.message,
          );
        }

        /* The machine-readable payload (strategic analysis §9.6 #6). The card
           already emits the correct 5.5x8.5 trim; this attaches the same facts
           as data so an agency receiving the PDF can read it rather than
           retype it. Fail-soft by construction — a card that rendered must
           never be lost to a metadata step. */
        try {
          const {
            buildCompCardPayload,
            embedMachineReadablePayload,
          } = require("./machine-readable");
          const headers = viewResponse ? viewResponse.headers() : {};
          buffer = await embedMachineReadablePayload(
            buffer,
            buildCompCardPayload({
              profile: opts?.machineReadable?.profile || {},
              portfolioUrl: headers["x-compcard-portfolio-url"] || null,
              minor: Boolean(opts?.machineReadable?.minor),
              images: opts?.machineReadable?.images || [],
            }),
          );
        } catch (payloadError) {
          console.warn(
            "[comp-card] machine-readable payload skipped:",
            payloadError.message,
          );
        }

        console.log(
          "[renderCompCard] PDF generated, size:",
          buffer.length,
          "bytes (",
          (buffer.length / 1024 / 1024).toFixed(2),
          "MB)",
        );

        // Check if PDF is too large (Netlify Functions have ~6MB response limit)
        const maxSize = 5 * 1024 * 1024; // 5MB safety limit
        if (buffer.length > maxSize) {
          console.warn(
            "[renderCompCard] PDF is large (",
            (buffer.length / 1024 / 1024).toFixed(2),
            "MB). Consider optimizing images.",
          );
        }
      } catch (pdfError) {
        console.error("[renderCompCard] Error generating PDF:", {
          message: pdfError.message,
          code: pdfError.code,
          name: pdfError.name,
        });
        throw new Error(`Failed to generate PDF: ${pdfError.message}`);
      }

      return buffer;
    } catch (pageError) {
      // Log page-related errors
      console.error("[renderCompCard] Error with PDF page:", {
        message: pageError.message,
        code: pageError.code,
        name: pageError.name,
        target: target,
      });
      throw pageError;
    } finally {
      // Ensure browser is closed even on error
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error(
            "[renderCompCard] Error closing browser:",
            closeError.message,
          );
        }
      }
    }
  } catch (error) {
    // Log all errors for debugging
    console.error("[renderCompCard] Error generating PDF:", {
      message: error.message,
      code: error.code,
      name: error.name,
      slug: slug,
      theme: theme,
      pdfBaseUrl: config.pdfBaseUrl,
    });
    // Re-throw error with context for route handlers to catch
    throw error;
  }
}

/**
 * Render the talent's DIGITALS SHEET to PDF — the raw, dated set of digital
 * frames + measurements that agencies request ("send me your digitals").
 * Distinct from the comp card: no composition engine, no styling — a clean
 * contact sheet of the unretouched set. Navigates to /pdf/digitals/view/:slug.
 */
async function renderDigitalsSheet(slug) {
  if (config.nodeEnv === "test") {
    return Buffer.from(`Digitals sheet placeholder for ${slug}`);
  }

  let browser = null;
  try {
    const target = new URL(
      `/pdf/digitals/view/${slug}`,
      config.pdfBaseUrl,
    ).toString();

    const puppeteerArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu",
    ];

    let launchOptions = { headless: "new", args: puppeteerArgs };

    const chromium = await loadChromium();

    if (config.isServerless && chromium) {
      let executablePath = chromium.executablePath();
      if (executablePath && typeof executablePath.then === "function") {
        executablePath = await executablePath;
      }
      launchOptions.executablePath = executablePath;
      launchOptions.args = [
        ...chromium.args,
        ...puppeteerArgs,
        "--hide-scrollbars",
        "--disable-web-security",
      ];
    } else if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browser = await (await getPuppeteer()).launch(launchOptions);
    const page = await browser.newPage();
    await page.goto(target, { waitUntil: "networkidle0", timeout: 30000 });
    const buffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
      preferCSSPageSize: true,
      timeout: 30000,
      tagged: false,
    });
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore close errors */
      }
    }
  }
}

module.exports = {
  loadProfile,
  renderCompCard,
  renderDigitalsSheet,
  toFeetInches,
};
