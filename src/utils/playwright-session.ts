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
    const hasCredentials = env.NOTE_EMAIL && env.NOTE_PASSWORD;
    const merged = { ...DEFAULT_OPTIONS, ...(options || {}) };

    let browser: ChromiumBrowser | null = null;

    try {
        if (hasCredentials) {
            console.error("🕹️ Playwrightでnote.comセッションを自動取得します...");
        } else {
            console.error("🕹️ Playwrightでnote.comにブラウザを開きます（手動ログインが必要です）...");
        }
        console.error(
            `   headless=${merged.headless} (PLAYWRIGHT_HEADLESS=${process.env.PLAYWRIGHT_HEADLESS ?? "undefined"})`,
        );

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
            // 自動ログイン: メールアドレスとパスワードを自動入力
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
        } else {
            // 手動ログイン: ユーザーがログインするまで待機
            console.error("📝 ブラウザでnote.comにログインしてください...");
            console.error("   1. メールアドレスとパスワードを入力");
            console.error("   2. ログインボタンをクリック");
            console.error("   3. ログイン完了後、自動でセッションを取得します");
            console.error("");

            // ログイン完了を検知（URLが/loginから変わる OR セッションCookieが存在する）
            let loginComplete = false;
            const startTime = Date.now();
            const maxWaitTime = 150000; // 2.5分

            while (!loginComplete && (Date.now() - startTime) < maxWaitTime) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒ごとにチェック

                try {
                    // URLチェック
                    const currentUrl = page.url();
                    // ログインページから離れたかどうか（/login で始まるパスではない）
                    const isLoginPage = new URL(currentUrl).pathname.startsWith('/login');
                    const isNoteComDomain = currentUrl.includes('note.com');

                    // Cookieチェック（note.comドメインのCookieを取得）
                    const cookies = await context.cookies('https://note.com');
                    const sessionCookie = cookies.find(c => c.name === "_note_session_v5");
                    const hasSessionCookie = sessionCookie !== undefined && sessionCookie.value !== "";

                    // 経過時間
                    const elapsed = Math.floor((Date.now() - startTime) / 1000);

                    // デバッグ情報（5秒ごと）
                    if (elapsed % 5 === 0 && elapsed > 0) {
                        console.error(`⏳ ログイン待機中... (${elapsed}秒経過)`);
                        console.error(`   URL: ${currentUrl}`);
                        console.error(`   isLoginPage: ${isLoginPage}, hasSessionCookie: ${hasSessionCookie}`);
                    }

                    // ログイン完了条件: セッションCookieがある、またはログインページから離れた
                    if (hasSessionCookie) {
                        loginComplete = true;
                        console.error("✅ ログインを検知しました！（セッションCookie取得）");
                    } else if (!isLoginPage && isNoteComDomain) {
                        // Cookieがなくてもログインページから離れていれば、少し待ってから再確認
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        const cookiesRetry = await context.cookies('https://note.com');
                        const sessionCookieRetry = cookiesRetry.find(c => c.name === "_note_session_v5");
                        if (sessionCookieRetry && sessionCookieRetry.value !== "") {
                            loginComplete = true;
                            console.error("✅ ログインを検知しました！（リダイレクト後にCookie取得）");
                        } else {
                            // それでもCookieがない場合はURLベースで判定
                            loginComplete = true;
                            console.error("✅ ログインを検知しました！（URLリダイレクト検知）");
                            console.error("⚠️ 注意: セッションCookieが見つかりませんでした。認証に問題がある可能性があります。");
                        }
                    }
                } catch (error) {
                    // ページが閉じられた場合
                    console.error("⚠️ ページ状態の確認中にエラー:", error);
                    break;
                }
            }

            if (!loginComplete) {
                throw new Error("ログインタイムアウト: 指定時間内にログインが完了しませんでした");
            }

            console.error("✅ セッション情報を取得中...");

            // ログイン後のページ安定を短時間待機（最大3秒）
            try {
                await page.waitForLoadState('networkidle', { timeout: 3000 });
            } catch {
                // タイムアウトしても続行
            }
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
            // page.evaluateでfetchを使用（page.gotoだとHTMLが返ってくる場合がある）
            const userKey = await page.evaluate(async () => {
                try {
                    const res = await fetch("https://note.com/api/v2/session", {
                        credentials: "include",
                    });
                    if (!res.ok) return null;
                    const json = await res.json();
                    return json?.data?.user?.urlname || json?.data?.user?.id || null;
                } catch {
                    return null;
                }
            });
            if (userKey) {
                setActiveUserKey(userKey);
                process.env.NOTE_USER_ID = userKey;
                console.error(`✅ ユーザーID取得: ${userKey}`);
            }
        } catch (error) {
            // ユーザー情報取得は必須ではないので警告のみ
            console.error("⚠️ ユーザー情報取得をスキップしました（セッションは正常に取得済み）");
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
