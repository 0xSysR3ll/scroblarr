import puppeteer, { Browser } from "puppeteer";
import { logger } from "@utils/logger";

const BASE_URL = "app.tvtime.com";
const AUTH_URL = `https://${BASE_URL}/welcome?mode=auth`;
const LOGIN_URL =
  "https://beta-app.tvtime.com/sidecar?o=https://auth.tvtime.com/v1/login";

export interface TVTimeTokens {
  accessToken: string;
  refreshToken: string;
}

interface TVTimeAuthResponse {
  data: {
    jwt_token: string;
    jwt_refresh_token: string;
  };
}

// Shared cache across all instances
let cachedInitialJwt: string | null = null;
let cacheExpiry: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class TVTimeAuth {
  async getInitialJwtToken(): Promise<string> {
    // Use cached token if still valid (shared across all instances)
    // This avoids launching Puppeteer unnecessarily
    if (cachedInitialJwt && Date.now() < cacheExpiry) {
      return cachedInitialJwt;
    }

    // Cache expired or doesn't exist - fetch new token using Puppeteer
    logger.tvtime.info(
      "Fetching new initial JWT token from TVTime (cache expired or missing)"
    );
    let browser: Browser | null = null;
    try {
      try {
        browser = await puppeteer.launch({
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
          ],
        });
      } catch (launchError: unknown) {
        if (
          launchError instanceof Error &&
          launchError.message.includes("Could not find Chrome")
        ) {
          throw new Error(
            "Chrome browser not found. Please run: npx puppeteer browsers install chrome"
          );
        }
        throw launchError;
      }

      const page = await browser.newPage();

      try {
        await page.goto(AUTH_URL, {
          waitUntil: "networkidle2",
          timeout: 60000,
        });
      } catch (gotoError) {
        logger.tvtime.error(
          { error: gotoError },
          "Failed to navigate to TVTime auth page"
        );
        throw new Error(`Failed to load TVTime auth page: ${gotoError}`);
      }

      // Wait a bit for the page to fully initialize
      await new Promise((resolve) => setTimeout(resolve, 3000));

      let jwtToken: string | null = null;
      for (let attempt = 1; attempt <= 5; attempt++) {
        await new Promise((resolve) =>
          setTimeout(resolve, 3000 + attempt * 2000)
        );

        try {
          // This runs in browser context where window.localStorage exists
          jwtToken = await page.evaluate(() => {
            // @ts-expect-error - window exists in browser context
            return window.localStorage.getItem("flutter.jwtToken");
          });

          if (jwtToken && jwtToken.trim() !== "" && jwtToken !== "null") {
            logger.tvtime.info({ attempt }, "Successfully fetched JWT token");
            break;
          } else {
          }
        } catch (error) {
          logger.tvtime.warn({ attempt, error }, "Failed to fetch JWT token");
          if (attempt === 5) {
            // Try to get page content for debugging
            try {
              const pageContent = await page.content();
              const pageTitle = await page.title();
              logger.tvtime.error(
                { pageTitle, contentLength: pageContent.length },
                "Failed to fetch JWT after all attempts"
              );
            } catch (debugError) {
              logger.tvtime.error(
                { error: debugError },
                "Could not get page debug info"
              );
            }
            throw new Error(
              "Unable to fetch JWT token from TVTime after 5 attempts"
            );
          }
        }
      }

      if (!jwtToken || jwtToken.trim() === "" || jwtToken === "null") {
        throw new Error(
          "Unable to fetch JWT token from TVTime - token was empty or null"
        );
      }

      const cleanedToken = jwtToken.replace(/^"|"$/g, "");

      // Cache the token (shared across all instances)
      cachedInitialJwt = cleanedToken;
      cacheExpiry = Date.now() + CACHE_TTL;

      return cleanedToken;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async login(email: string, password: string): Promise<TVTimeTokens> {
    const initialJwt = await this.getInitialJwtToken();

    const response = await fetch(LOGIN_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${initialJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: email,
        password: password,
      }),
    });

    if (!response.ok) {
      throw new Error("Invalid username or password");
    }

    const authResponse = (await response.json()) as TVTimeAuthResponse;

    if (
      !authResponse?.data?.jwt_token ||
      !authResponse?.data?.jwt_refresh_token
    ) {
      throw new Error("Invalid response from TVTime login");
    }

    return {
      accessToken: authResponse.data.jwt_token,
      refreshToken: authResponse.data.jwt_refresh_token,
    };
  }

  async refreshToken(refreshToken: string): Promise<TVTimeTokens> {
    const initialJwt = await this.getInitialJwtToken();

    const refreshUrl =
      "https://beta-app.tvtime.com/sidecar?o=https://auth.tvtime.com/v1/refresh";

    const response = await fetch(refreshUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${initialJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `TVTime token refresh failed: ${response.status} - ${errorText}`
      );
    }

    const refreshResponse = (await response.json()) as TVTimeAuthResponse;

    if (
      !refreshResponse?.data?.jwt_token ||
      !refreshResponse?.data?.jwt_refresh_token
    ) {
      throw new Error("Invalid response from TVTime token refresh");
    }

    return {
      accessToken: refreshResponse.data.jwt_token,
      refreshToken: refreshResponse.data.jwt_refresh_token,
    };
  }
}
