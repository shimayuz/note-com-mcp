import { chromium, ChromiumBrowser, Page } from "playwright";
import { env } from "../config/environment.js";
import {
    setActiveSessionCookie,
    setActiveUserKey,
    setActiveXsrfToken,
    saveSessionToFile,
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

const DEFAULT_OPTIONS: Required<PlaywrightSessionOptions> = {
    headless: false, // デフォルトはブラウザを表示
    navigationTimeoutMs: 300000, // 5分待機（手動ログイン用）
};

export async function refreshSessionWithPlaywright(
    options?: PlaywrightSessionOptions,
): Promise<void> {
    const merged = { ...DEFAULT_OPTIONS, ...(options || {}) };

    // 環境変数でheadlessを上書き
    const effectiveHeadless = process.env.PLAYWRIGHT_HEADLESS === "true";

    let browser: ChromiumBrowser | null = null;

    try {
        console.error("🕹️ Playwrightでnote.comセッションを取得します...");
        console.error(`   headless=${effectiveHeadless}, platform=${process.platform}`);
        console.error("   ⏳ ブラウザでログインしてください。ログイン完了まで待機します...");

        // Windows用の追加引数
        const browserArgs = [
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--no-sandbox",
        ];
        if (process.platform === "win32") {
            browserArgs.push(
                "--disable-gpu",
                "--disable-software-rasterizer",
            );
        }

        browser = await chromium.launch({
            headless: effectiveHeadless,
            args: browserArgs,
            timeout: 60000,
        });

        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        });

        const page = await context.newPage();

        // ログインページに移動
        await page.goto("https://note.com/login", {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });
        console.error("   ✓ ログインページを開きました");

        // メールアドレス入力フォームを表示（オプション）
        try {
            await tryClickEmailLoginButton(page);
        } catch (e) {
            // 無視（既にメールログインフォームが表示されている場合）
        }

        // 自動入力を試みる（失敗してもOK）
        if (env.NOTE_EMAIL && env.NOTE_PASSWORD) {
            try {
                await tryAutoFillCredentials(page);
                console.error("   ✓ 認証情報を自動入力しました");
            } catch (e) {
                console.error("   ⚠️ 自動入力できませんでした。手動で入力してください。");
            }
        }

        // ログイン完了を待機（URLがログインページから変わるか、セッションCookieが設定されるまで）
        console.error("   ⏳ ログイン完了を待機中... (最大5分)");
        await waitForLoginCompletion(page, context, merged.navigationTimeoutMs);
        console.error("   ✓ ログイン完了を検出しました");

        // セッション情報を取得
        const cookies = await context.cookies();
        const sessionCookie = cookies.find((cookie) => cookie.name === "_note_session_v5");

        if (!sessionCookie) {
            throw new Error("セッションCookieを取得できませんでした。ログインが完了しているか確認してください。");
        }

        const xsrfCookie = cookies.find((cookie) => cookie.name === "XSRF-TOKEN");

        // セッション情報を設定
        setActiveSessionCookie(`_note_session_v5=${sessionCookie.value}`);

        if (xsrfCookie) {
            const decoded = decodeURIComponent(xsrfCookie.value);
            setActiveXsrfToken(decoded);
        }

        // ユーザー情報を取得
        try {
            const response = await page.goto("https://note.com/api/v2/current_user", {
                waitUntil: "networkidle",
                timeout: 30000,
            });
            const json = await response?.json() as { data?: { urlname?: string; id?: string } };
            const userKey = json?.data?.urlname || json?.data?.id;
            if (userKey) {
                setActiveUserKey(userKey);
                console.error(`   ✓ ユーザー情報を取得しました: ${userKey}`);
            }
        } catch (error) {
            console.error("   ⚠️ ユーザー情報の取得に失敗しました（ログインは成功）");
        }

        // セッションをファイルに保存
        saveSessionToFile();

        console.error("✅ セッションの取得が完了しました");
    } catch (error) {
        console.error("❌ Playwrightセッション取得エラー:", error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * メールログインボタンをクリック
 */
async function tryClickEmailLoginButton(page: Page): Promise<void> {
    const emailSelectors = [
        "button:has-text('メールアドレスでログイン')",
        "button:has-text('メールでログイン')",
        "text=メールアドレスでログイン",
    ];

    for (const selector of emailSelectors) {
        try {
            const locator = page.locator(selector).first();
            if (await locator.isVisible({ timeout: 3000 })) {
                await locator.click();
                await page.waitForTimeout(1000);
                return;
            }
        } catch {
            // 次のセレクターを試す
        }
    }
}

/**
 * 認証情報を自動入力
 */
async function tryAutoFillCredentials(page: Page): Promise<void> {
    // 少し待機してフォームが表示されるのを待つ
    await page.waitForTimeout(2000);

    // 入力フィールドを探す
    const emailInput = page.locator('input[type="email"], input[name="login"], input[placeholder*="メール"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    if (await emailInput.isVisible({ timeout: 5000 })) {
        await emailInput.fill(env.NOTE_EMAIL);
    }

    if (await passwordInput.isVisible({ timeout: 5000 })) {
        await passwordInput.fill(env.NOTE_PASSWORD);
    }
}

/**
 * ログイン完了を待機
 */
async function waitForLoginCompletion(
    page: Page,
    context: any,
    timeoutMs: number
): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        // 現在のURLを確認
        const currentUrl = page.url();

        // ログインページから離れたかチェック
        if (!currentUrl.includes('/login') && !currentUrl.includes('note.com/login')) {
            // ホームページやマイページに遷移したらログイン成功
            if (currentUrl.includes('note.com')) {
                return;
            }
        }

        // セッションCookieが設定されているか確認
        const cookies = await context.cookies();
        const sessionCookie = cookies.find((c: any) => c.name === "_note_session_v5");
        if (sessionCookie && sessionCookie.value) {
            // ログインページにいてもセッションがあれば成功
            return;
        }

        // 1秒待機して再チェック
        await page.waitForTimeout(1000);
    }

    throw new Error("ログイン待機がタイムアウトしました");
}
