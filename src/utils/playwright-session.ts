import { chromium, ChromiumBrowser, Locator, Page } from "playwright";
import { env } from "../config/environment.js";
import {
    setActiveSessionCookie,
    setActiveUserKey,
    setActiveXsrfToken,
} from "./auth.js";
import path from "path";
import os from "os";
import fs from "fs";

// ブラウザストレージ状態ファイルのパス
const STORAGE_STATE_PATH = path.join(os.tmpdir(), 'note-playwright-state.json');

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
            // クリック後にフォームが描画されるまで少し待つ
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

const defaultTimeout = Number(process.env.PLAYWRIGHT_NAV_TIMEOUT_MS || 120_000);

const DEFAULT_OPTIONS: Required<PlaywrightSessionOptions> = {
    headless: defaultHeadless,
    navigationTimeoutMs: Number.isNaN(defaultTimeout) ? 120_000 : defaultTimeout,
};

async function waitForFirstVisibleLocator(
    page: Page,
    selectors: string[],
    timeoutMs: number,
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
        `Playwright login formの入力フィールドが見つかりませんでした: ${selectors.join(", ")}\n${lastError?.message || ""}`,
    );
}

export async function refreshSessionWithPlaywright(
    options?: PlaywrightSessionOptions,
): Promise<void> {
    if (!env.NOTE_EMAIL || !env.NOTE_PASSWORD) {
        throw new Error("NOTE_EMAIL と NOTE_PASSWORD が設定されていません");
    }

    const merged = { ...DEFAULT_OPTIONS, ...(options || {}) };

    let browser: ChromiumBrowser | null = null;

    try {
        // ログイン時は headless=false をデフォルトに（2要素認証/CAPTCHA対応のため）
        // 環境変数 PLAYWRIGHT_HEADLESS=true で明示的にheadlessモードを有効化可能
        const isWindows = process.platform === "win32";
        const effectiveHeadless = process.env.PLAYWRIGHT_HEADLESS === "true"
            ? true
            : false; // デフォルトはブラウザを表示

        console.error("🕹️ Playwrightでnote.comセッションを自動取得します...");
        console.error(
            `   headless=${effectiveHeadless} (PLAYWRIGHT_HEADLESS=${process.env.PLAYWRIGHT_HEADLESS ?? "undefined"}, platform=${process.platform})`,
        );

        // Windows用の追加引数
        const browserArgs = [
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--no-sandbox",
        ];
        if (isWindows) {
            browserArgs.push(
                "--disable-gpu",
                "--disable-software-rasterizer",
            );
        }

        console.error("   Launching browser...");
        browser = await chromium.launch({
            headless: effectiveHeadless,
            args: browserArgs,
            timeout: 30000, // 30秒でタイムアウト
        });
        console.error("   ✓ Browser launched");

        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent:
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36",
        });
        console.error("   ✓ Context created");

        const page = await context.newPage();
        console.error("   ✓ Page created, navigating to login...");
        await page.goto("https://note.com/login", { waitUntil: "networkidle", timeout: 60000 });
        console.error("   ✓ Login page loaded");
        await ensureEmailLoginForm(page, merged.navigationTimeoutMs);

        // note.comのログインフォームは2つの入力フィールドがある
        // 最初の visible input がメールアドレス、2番目がパスワード
        const inputs = await page.$$('input:not([type="hidden"])');
        if (inputs.length >= 2) {
            await inputs[0].fill(env.NOTE_EMAIL);
            await inputs[1].fill(env.NOTE_PASSWORD);
        } else {
            // フォールバック: 従来のセレクター
            const emailLocator = await waitForFirstVisibleLocator(
                page,
                [
                    "input[name='login']",
                    "input[name='login_id']",
                    "input[type='email']",
                    "input[data-testid='email-input']",
                    "input:not([type='hidden']):not([type='password'])",
                ],
                merged.navigationTimeoutMs,
            );
            await emailLocator.fill(env.NOTE_EMAIL);

            const passwordLocator = await waitForFirstVisibleLocator(
                page,
                [
                    "input[name='password']",
                    "input[type='password']",
                    "input[data-testid='password-input']",
                ],
                merged.navigationTimeoutMs,
            );
            await passwordLocator.fill(env.NOTE_PASSWORD);
        }

        let submitClicked = false;
        const submitSelectors = [
            "button[type='submit']",
            "button:has-text(\"ログイン\")",
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

        const cookies = await context.cookies();
        const sessionCookie = cookies.find((cookie) => cookie.name === "_note_session_v5");

        if (!sessionCookie) {
            throw new Error("Playwrightで_session_cookieを取得できませんでした");
        }

        const xsrfCookie = cookies.find((cookie) => cookie.name === "XSRF-TOKEN");

        const concatenatedCookies = cookies
            .map((cookie) => `${cookie.name}=${cookie.value}`)
            .join("; ");

        setActiveSessionCookie(`_note_session_v5=${sessionCookie.value}`);
        process.env.NOTE_SESSION_V5 = sessionCookie.value;

        if (xsrfCookie) {
            const decoded = decodeURIComponent(xsrfCookie.value);
            setActiveXsrfToken(decoded);
            process.env.NOTE_XSRF_TOKEN = decoded;
        }

        process.env.NOTE_ALL_COOKIES = concatenatedCookies;

        // 追加でユーザーIDも取得（LOG用途）
        try {
            const response = await page.goto("https://note.com/api/v2/session", {
                waitUntil: "networkidle",
                timeout: merged.navigationTimeoutMs,
            });
            const json = await response?.json();
            const userKey = json?.data?.user?.urlname || json?.data?.user?.id;
            if (userKey) {
                setActiveUserKey(userKey);
                process.env.NOTE_USER_ID = userKey;
            }
        } catch (error) {
            console.error("⚠️ Playwrightでユーザー情報取得に失敗しました", error);
        }

        // ストレージ状態を保存（次回のPlaywright起動時に再利用）
        await context.storageState({ path: STORAGE_STATE_PATH });
        console.error(`✅ ストレージ状態を保存しました: ${STORAGE_STATE_PATH}`);

        console.error("✅ Playwrightでセッションを更新しました");
    } catch (error) {
        console.error("❌ Playwrightセッション更新でエラーが発生しました", error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
