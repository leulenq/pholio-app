const { URL } = require("url");
const puppeteer = require("puppeteer");
const knex = require("../../shared/db/knex");
const config = require("../../config");
const { toFeetInches } = require("../talent/services/stats");

// Import Chromium for serverless environments (Netlify Functions, AWS Lambda)
let chromium = null;
if (config.isServerless) {
  try {
    chromium = require("@sparticuz/chromium");
  } catch (error) {
    console.warn(
      "[renderCompCard] @sparticuz/chromium not available, falling back to default Puppeteer",
    );
  }
}

async function loadProfile(slug) {
  try {
    const profile = await knex("profiles").where({ slug }).first();
    if (!profile) return null;
    const images = await knex("images")
      .where({ profile_id: profile.id })
      .orderBy("sort");

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

      browser = await puppeteer.launch(launchOptions);
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

      // Set viewport size to match PDF dimensions (important for proper rendering)
      await page.setViewport({
        width: 528, // 5.5in at 96 DPI
        height: 816, // 8.5in at 96 DPI
        deviceScaleFactor: 2, // Higher DPI for better quality
      });

      // Navigate to PDF view URL with timeout
      try {
        console.log("[renderCompCard] Navigating to PDF view URL:", target);
        await page.goto(target, {
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
          width: "5.5in",
          // No fixed height — let CSS @page { size: 5.5in 8.5in } and
          // break-after: page handle multi-page pagination naturally.
          margin: { top: "0", bottom: "0", left: "0", right: "0" },
          printBackground: true,
          timeout: 30000, // 30 second timeout
          // Let CSS @page rule control page size
          preferCSSPageSize: true,
          // Disable tagged PDF to reduce size
          tagged: false,
        });

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

module.exports = {
  loadProfile,
  renderCompCard,
  toFeetInches,
};
