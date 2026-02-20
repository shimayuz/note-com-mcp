import { chromium, ChromiumBrowser, BrowserContext, Locator, Page } from "playwright";
import { env } from "../config/environment.js";
import { setActiveSessionCookie, setActiveUserKey, setActiveXsrfToken } from "./auth.js";
import path from "path";
import os from "os";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ブラウザストレージ状態ファイルのパス
const STORAGE_STATE_PATH = path.join(os.tmpdir(), "note-playwright-state.json");

/**
 * 保存済みのストレージ状態ファイルのパスを取得
 */
export function getStorageStatePath(): string {
  return STORAGE_STATE_PATH;
}

/**
 * ストレージ状態ファイルが存在するか確認
 */
export function hasStorageState(): boolean {
  return fs.existsSync(STORAGE_STATE_PATH);
}

export interface PlaywrightSessionOptions {
  headless?: boolean;
  navigationTimeoutMs?: number;
}

/**
 * Cookie取得結果
 */
export interface SessionCookieResult {
  sessionCookie: string;
  xsrfToken: string | null;
  gqlAuthToken: string | null;
  allCookies: string;
  userKey: string | null;
}

async function ensureEmailLoginForm(page: Page, timeoutMs: number) {
  const emailSelectors = [
    "button:has-text('メールアドレスでログイン')",
    "button:has-text('メールアドレスでサインイン')",
    "button:has-text('メールでログイン')",
    "button:has-text('メール')",
    "button[data-testid='login-email-button']",
    "button[data-testid='mail-login-button']",
  ];

  const perSelectorTimeout = Math.max(Math.floor(timeoutMs / emailSelectors.length), 3_000);

  for (const selector of emailSelectors) {
    const locator = page.locator(selector);
    try {
      await locator.waitFor({ state: "visible", timeout: perSelectorTimeout });
      await locator.click();
      await page.waitForTimeout(1_000);
      break;
    } catch {
      // 無視して次の候補
    }
  }
}

const defaultHeadless =
  process.env.PLAYWRIGHT_HEADLESS === undefined
    ? true
    : process.env.PLAYWRIGHT_HEADLESS !== "false";

const defaultTimeout = Number(process.env.PLAYWRIGHT_NAV_TIMEOUT_MS || 60_000);

const DEFAULT_OPTIONS: Required<PlaywrightSessionOptions> = {
  headless: defaultHeadless,
  navigationTimeoutMs: Number.isNaN(defaultTimeout) ? 60_000 : defaultTimeout,
};

async function waitForFirstVisibleLocator(
  page: Page,
  selectors: string[],
  timeoutMs: number
): Promise<Locator> {
  const perSelectorTimeout = Math.max(Math.floor(timeoutMs / selectors.length), 3_000);
  let lastError: Error | undefined;

  for (const selector of selectors) {
    try {
      const locator = page.locator(selector);
      await locator.waitFor({ state: "visible", timeout: perSelectorTimeout });
      return locator;
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw new Error(
    `Playwright login formの入力フィールドが見つかりませんでした: ${selectors.join(", ")}\n${lastError?.message || ""}`
  );
}

/**
 * ブラウザのCookieからセッション情報を抽出し、process.env・auth.ts・.envファイルに保存する
 */
async function extractAndSaveCookies(
  context: BrowserContext,
  page: Page
): Promise<SessionCookieResult> {
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((c) => c.name === "_note_session_v5");

  if (!sessionCookie) {
    throw new Error("Playwrightで_note_session_v5を取得できませんでした");
  }

  const xsrfCookie = cookies.find((c) => c.name === "XSRF-TOKEN");
  const gqlAuthCookie = cookies.find((c) => c.name === "note_gql_auth_token");
  const concatenatedCookies = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  // auth.tsのグローバル状態に設定
  const sessionValue = `_note_session_v5=${sessionCookie.value}`;
  setActiveSessionCookie(sessionValue);
  process.env.NOTE_SESSION_V5 = sessionCookie.value;

  let xsrfDecoded: string | null = null;
  if (xsrfCookie) {
    xsrfDecoded = decodeURIComponent(xsrfCookie.value);
    setActiveXsrfToken(xsrfDecoded);
    process.env.NOTE_XSRF_TOKEN = xsrfDecoded;
  }

  const gqlAuthToken = gqlAuthCookie?.value || null;

  process.env.NOTE_ALL_COOKIES = concatenatedCookies;

  // ユーザーID取得（失敗しても続行）
  let userKey: string | null = null;
  try {
    userKey = await page.evaluate(async () => {
      try {
        const res = await fetch("https://note.com/api/v2/current_user", {
          credentials: "include",
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json?.data?.urlname || json?.data?.id || null;
      } catch {
        return null;
      }
    });
    if (userKey) {
      setActiveUserKey(userKey);
      process.env.NOTE_USER_ID = userKey;
    }
  } catch {
    // ユーザー情報取得は必須ではない
  }

  // .envファイルに書き戻し
  persistCookiesToEnvFile(sessionCookie.value, xsrfDecoded, concatenatedCookies);

  // ストレージ状態を保存
  await context.storageState({ path: STORAGE_STATE_PATH });

  return {
    sessionCookie: sessionValue,
    xsrfToken: xsrfDecoded,
    gqlAuthToken,
    allCookies: concatenatedCookies,
    userKey,
  };
}

/**
 * 取得したCookieを.envファイルに書き戻す
 */
function persistCookiesToEnvFile(
  sessionV5: string,
  xsrfToken: string | null,
  allCookies: string
): void {
  // .envファイルのパスを解決（build/utils/ or src/utils/ から2階層上がプロジェクトルート）
  const envPaths = [
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../.env"),
  ];

  const envPath = envPaths.find((p) => fs.existsSync(p));
  if (!envPath) {
    console.error("⚠️ .envファイルが見つかりません。Cookie情報はメモリ上にのみ保持されます。");
    return;
  }

  try {
    let content = fs.readFileSync(envPath, "utf-8");

    // NOTE_SESSION_V5を更新 or 追加
    if (content.match(/^NOTE_SESSION_V5=.*/m)) {
      content = content.replace(/^NOTE_SESSION_V5=.*/m, `NOTE_SESSION_V5=${sessionV5}`);
    } else {
      content += `\nNOTE_SESSION_V5=${sessionV5}`;
    }

    // NOTE_XSRF_TOKENを更新 or 追加
    if (xsrfToken) {
      if (content.match(/^NOTE_XSRF_TOKEN=.*/m)) {
        content = content.replace(/^NOTE_XSRF_TOKEN=.*/m, `NOTE_XSRF_TOKEN=${xsrfToken}`);
      } else {
        content += `\nNOTE_XSRF_TOKEN=${xsrfToken}`;
      }
    }

    // NOTE_ALL_COOKIESを更新 or 追加
    if (content.match(/^NOTE_ALL_COOKIES=.*/m)) {
      content = content.replace(/^NOTE_ALL_COOKIES=.*/m, `NOTE_ALL_COOKIES=${allCookies}`);
    } else {
      content += `\nNOTE_ALL_COOKIES=${allCookies}`;
    }

    fs.writeFileSync(envPath, content, "utf-8");
    console.error(`✅ .envファイルにCookie情報を保存しました: ${envPath}`);
  } catch (error) {
    console.error("⚠️ .envファイルの更新に失敗しました:", error);
  }
}

/**
 * Playwrightで自動ログインし、Cookie取得後すぐにブラウザを閉じて返す
 * Cookie取得完了を待つポーリング最適化済み
 */
export async function refreshSessionWithPlaywright(
  options?: PlaywrightSessionOptions
): Promise<SessionCookieResult> {
  const hasCredentials = env.NOTE_EMAIL && env.NOTE_PASSWORD;
  const merged = { ...DEFAULT_OPTIONS, ...(options || {}) };

  let browser: ChromiumBrowser | null = null;

  try {
    if (hasCredentials) {
      console.error("🕹️ Playwrightでnote.comセッションを自動取得します...");
    } else {
      console.error("🕹️ Playwrightでnote.comにブラウザを開きます（手動ログインが必要です）...");
    }

    browser = await chromium.launch({
      headless: merged.headless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36",
    });

    const page = await context.newPage();
    await page.goto("https://note.com/login", { waitUntil: "networkidle" });
    await ensureEmailLoginForm(page, merged.navigationTimeoutMs);

    if (hasCredentials) {
      // --- 自動ログイン ---
      const inputs = await page.$$('input:not([type="hidden"])');
      if (inputs.length >= 2) {
        await inputs[0].fill(env.NOTE_EMAIL);
        await inputs[1].fill(env.NOTE_PASSWORD);
      } else {
        const emailLocator = await waitForFirstVisibleLocator(
          page,
          [
            "input[name='login']",
            "input[name='login_id']",
            "input[type='email']",
            "input[data-testid='email-input']",
            "input:not([type='hidden']):not([type='password'])",
          ],
          merged.navigationTimeoutMs
        );
        await emailLocator.fill(env.NOTE_EMAIL);

        const passwordLocator = await waitForFirstVisibleLocator(
          page,
          [
            "input[name='password']",
            "input[type='password']",
            "input[data-testid='password-input']",
          ],
          merged.navigationTimeoutMs
        );
        await passwordLocator.fill(env.NOTE_PASSWORD);
      }

      // ログインボタンクリック
      let submitClicked = false;
      const submitSelectors = [
        "button[type='submit']",
        'button:has-text("ログイン")',
        "button[data-testid='login-button']",
      ];

      for (const selector of submitSelectors) {
        const locator = page.locator(selector);
        if (await locator.count()) {
          try {
            await Promise.all([
              page.waitForNavigation({
                waitUntil: "networkidle",
                timeout: merged.navigationTimeoutMs,
              }),
              locator.first().click(),
            ]);
            submitClicked = true;
            break;
          } catch (error) {
            console.error(`⚠️ ログインボタン(${selector})クリック時にエラー:`, error);
          }
        }
      }

      if (!submitClicked) {
        await page.keyboard.press("Enter");
        await page.waitForNavigation({
          waitUntil: "networkidle",
          timeout: merged.navigationTimeoutMs,
        });
      }

      // --- セッションCookie取得完了をポーリングで即検知 ---
      const cookieWaitStart = Date.now();
      const cookieWaitMax = 10_000; // 最大10秒
      let gotSession = false;

      while (Date.now() - cookieWaitStart < cookieWaitMax) {
        const cookies = await context.cookies("https://note.com");
        gotSession = cookies.some((c) => c.name === "_note_session_v5" && c.value !== "");
        if (gotSession) break;
        await page.waitForTimeout(200); // 200msごとにポーリング
      }

      if (!gotSession) {
        throw new Error("ログイン後にセッションCookieが取得できませんでした");
      }

      // ダッシュボードに遷移してnote_gql_auth_token (JWT) を取得
      try {
        await page.goto("https://note.com/dashboard", {
          waitUntil: "networkidle",
          timeout: 15_000,
        });
      } catch {
        // ダッシュボード遷移失敗は致命的ではない
      }
    } else {
      // --- 手動ログイン ---
      console.error("📝 ブラウザでnote.comにログインしてください...");

      let loginComplete = false;
      const startTime = Date.now();
      const maxWaitTime = merged.navigationTimeoutMs;

      while (!loginComplete && Date.now() - startTime < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, 500));

        try {
          const cookies = await context.cookies("https://note.com");
          const hasSession = cookies.some(
            (c) => c.name === "_note_session_v5" && c.value !== ""
          );

          if (hasSession) {
            loginComplete = true;
            console.error("✅ ログインを検知しました！");
            break;
          }

          const currentUrl = page.url();
          const isLoginPage = new URL(currentUrl).pathname.startsWith("/login");
          if (!isLoginPage && currentUrl.includes("note.com")) {
            // ログインページから離れたら少し待ってから再確認
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const retryCheck = await context.cookies("https://note.com");
            if (retryCheck.some((c) => c.name === "_note_session_v5" && c.value !== "")) {
              loginComplete = true;
              console.error("✅ ログインを検知しました！");
            }
          }

          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          if (elapsed % 10 === 0 && elapsed > 0) {
            console.error(`⏳ ログイン待機中... (${elapsed}秒経過)`);
          }
        } catch {
          break;
        }
      }

      if (!loginComplete) {
        throw new Error("ログインタイムアウト: 指定時間内にログインが完了しませんでした");
      }
    }

    // Cookie抽出・保存・ブラウザ終了
    const result = await extractAndSaveCookies(context, page);

    console.error("✅ Playwrightでセッションを更新しました");
    if (result.userKey) {
      console.error(`✅ ユーザーID: ${result.userKey}`);
    }

    return result;
  } catch (error) {
    console.error("❌ Playwrightセッション更新でエラーが発生しました", error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
