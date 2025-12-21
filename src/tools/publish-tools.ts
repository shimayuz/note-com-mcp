import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { hasAuth } from "../utils/auth.js";
import fs from "fs";
import path from "path";
import os from "os";
import { chromium, Browser, Locator, Page } from "playwright";
import {
    parseMarkdown,
    formatToNoteEditor,
    extractTitle,
    removeTitle,
    removeFrontmatter,
    MarkdownElement
} from "../utils/note-editor-formatter.js";

/**
 * 現在のカーソル位置に画像を挿入
 */
async function insertImageAtCurrentPosition(
    page: Page,
    bodyBox: any,
    imagePath: string
): Promise<void> {
    // 新しいパラグラフを作成
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 本文エリアの位置を再取得
    const bodyBoxHandle = await bodyBox.boundingBox();

    // 「+」ボタンを探す（本文エリアの左側）
    const allBtns = await page.$$('button');
    let plusBtnFound = false;

    for (const btn of allBtns) {
        const box = await btn.boundingBox();
        if (!box) continue;

        // 条件: 本文エリアの左側（x - 100 ~ x）、本文エリア内（y ~ y + 200）、幅60以下
        if (bodyBoxHandle &&
            box.x > bodyBoxHandle.x - 100 &&
            box.x < bodyBoxHandle.x &&
            box.y > bodyBoxHandle.y &&
            box.y < bodyBoxHandle.y + bodyBoxHandle.height &&
            box.width < 60) {

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.waitForTimeout(300);
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            plusBtnFound = true;
            await page.waitForTimeout(1500);
            break;
        }
    }

    // フォールバック: 本文エリアの左側を直接クリック
    if (!plusBtnFound && bodyBoxHandle) {
        const plusX = bodyBoxHandle.x - 30;
        const plusY = bodyBoxHandle.y + 50;
        await page.mouse.click(plusX, plusY);
        await page.waitForTimeout(1500);
        plusBtnFound = true;
    }

    if (!plusBtnFound) {
        throw new Error("「+」ボタンが見つかりません");
    }

    // 「画像」メニュー項目をクリック
    const imageMenuItem = page.locator('[role="menuitem"]:has-text("画像")').first();

    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
        imageMenuItem.click(),
    ]);

    // ファイルを設定
    await chooser.setFiles(imagePath);
    await page.waitForTimeout(3000);

    // トリミングダイアログがあれば保存
    const dialog = page.locator('div[role="dialog"]');
    try {
        await dialog.waitFor({ state: 'visible', timeout: 5000 });
        const saveBtn = dialog.locator('button:has-text("保存")').first();
        await saveBtn.waitFor({ state: 'visible', timeout: 5000 });
        await saveBtn.click();
        await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => { });
        await page.waitForTimeout(3000);
    } catch (e) {
    }
}

async function setEyecatchImage(page: Page, imagePath: string): Promise<void> {
    const selectors = [
        'button[aria-label="画像を追加"]',
        'button:has-text("画像を追加")',
        'button[aria-label*="画像をアップロード"]',
        'button:has-text("画像をアップロード")',
        'button[aria-label*="アイキャッチ"]',
        'button[aria-label*="サムネ"]',
        'button[aria-label*="カバー"]',
        '[role="button"][aria-label*="画像"]',
        '[role="button"][aria-label*="アイキャッチ"]',
        '[role="button"][aria-label*="サムネ"]',
        '[role="button"][aria-label*="カバー"]',
    ];

    const uploadMenuSelector =
        '[role="menuitem"]:has-text("画像をアップロード"), [role="option"]:has-text("画像をアップロード"), button:has-text("画像をアップロード"), div:has-text("画像をアップロード"):not(:has(*:has-text("画像をアップロード")))';
    const fallbackMenuSelector =
        '[role="menuitem"]:has-text("画像"), [role="option"]:has-text("画像"), button:has-text("画像"), div:has-text("画像"):not(:has(*:has-text("画像")))';

    const openMenuAndGetFileChooser = async (): Promise<any | null> => {
        const uploadMenuItem = page.locator(uploadMenuSelector).first();
        const fallbackMenuItem = page.locator(fallbackMenuSelector).first();

        let menuItem = uploadMenuItem;
        try {
            await menuItem.waitFor({ state: 'visible', timeout: 5000 });
        } catch {
            menuItem = fallbackMenuItem;
            try {
                await menuItem.waitFor({ state: 'visible', timeout: 5000 });
            } catch {
                await page.keyboard.press('Escape').catch(() => { });
                return null;
            }
        }

        try {
            const [fc] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 10000 }),
                menuItem.click(),
            ]);
            return fc;
        } catch {
            return null;
        }
    };

    let chooser: any = null;

    for (const selector of selectors) {
        const btn = page.locator(selector).first();
        try {
            await btn.waitFor({ state: 'visible', timeout: 3000 });
        } catch (e) {
            continue;
        }

        await btn.click().catch(() => { });
        await page.waitForTimeout(500);

        chooser = await openMenuAndGetFileChooser();
        if (chooser) {
            break;
        }
    }

    if (!chooser) {
        const bodyBox = page.locator('div[contenteditable="true"][role="textbox"]').first();
        const bodyBoxHandle = await bodyBox.boundingBox();
        if (bodyBoxHandle) {
            const candidates = await page.$$('button, [role="button"]');
            for (const el of candidates) {
                const box = await el.boundingBox();
                if (!box) continue;

                if (box.y >= bodyBoxHandle.y) continue;
                if (box.y < Math.max(bodyBoxHandle.y - 500, 0)) continue;
                if (box.x < bodyBoxHandle.x || box.x > bodyBoxHandle.x + bodyBoxHandle.width) continue;
                if (box.width > 160 || box.height > 160) continue;

                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                await page.waitForTimeout(200);
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                await page.waitForTimeout(500);

                chooser = await openMenuAndGetFileChooser();
                if (chooser) {
                    break;
                }

                await page.keyboard.press('Escape').catch(() => { });
            }

            if (!chooser) {
                const x = bodyBoxHandle.x + bodyBoxHandle.width / 2;
                const y = Math.max(bodyBoxHandle.y - 120, 20);
                await page.mouse.click(x, y).catch(() => { });
                await page.waitForTimeout(500);
                chooser = await openMenuAndGetFileChooser();
            }
        }
    }

    if (!chooser) {
        throw new Error("アイキャッチ画像の追加ボタンが見つかりません");
    }

    await chooser.setFiles(imagePath);
    await page.waitForTimeout(3000);

    const dialog = page.locator('div[role="dialog"]');
    try {
        await dialog.waitFor({ state: 'visible', timeout: 5000 });
        const saveBtn = dialog.locator('button:has-text("保存")').first();
        await saveBtn.waitFor({ state: 'visible', timeout: 5000 });
        await saveBtn.click();
        await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => { });
        await page.waitForTimeout(3000);
    } catch (e) {
        // トリミングダイアログなし
    }
}

async function waitForFirstVisibleLocator(
    page: Page,
    selectors: string[],
    timeoutMs: number
): Promise<Locator> {
    const perSelectorTimeout = Math.max(Math.floor(timeoutMs / selectors.length), 3000);
    let lastError: Error | undefined;

    for (const selector of selectors) {
        const locator = page.locator(selector).first();
        try {
            await locator.waitFor({ state: 'visible', timeout: perSelectorTimeout });
            return locator;
        } catch (error) {
            lastError = error as Error;
        }
    }

    throw new Error(
        `タイトル入力欄が見つかりませんでした: ${selectors.join(', ')}\n${lastError?.message || ''}`
    );
}

async function fillNoteTitle(page: Page, title: string): Promise<void> {
    const titleSelectors = [
        'textarea[placeholder*="タイトル"]',
        'input[placeholder*="タイトル"]',
        'textarea[aria-label*="タイトル"]',
        'input[aria-label*="タイトル"]',
        '[data-testid*="title"] textarea',
        '[data-testid*="title"] input',
        '[contenteditable="true"][data-placeholder*="タイトル"]',
        'h1[contenteditable="true"]',
        'textarea',
        'input[type="text"]',
    ];

    const titleArea = await waitForFirstVisibleLocator(page, titleSelectors, 30000);
    await titleArea.click();
    try {
        await titleArea.fill(title);
    } catch {
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await page.keyboard.press(`${modifier}+A`);
        await page.keyboard.press('Backspace');
        await page.keyboard.type(title);
    }
}

/**
 * Playwrightでnoteエディタに記事を作成
 */
async function createNoteWithPlaywright(
    title: string,
    markdown: string,
    imageBasePath: string,
    options: {
        headless?: boolean;
        saveAsDraft?: boolean;
    } = {}
): Promise<{ success: boolean; noteUrl?: string; error?: string }> {
    const { headless = true, saveAsDraft = true } = options;

    const NOTE_EMAIL = process.env.NOTE_EMAIL;
    const NOTE_PASSWORD = process.env.NOTE_PASSWORD;

    if (!NOTE_EMAIL || !NOTE_PASSWORD) {
        return { success: false, error: "NOTE_EMAILとNOTE_PASSWORDが設定されていません" };
    }

    let browser: Browser | null = null;

    try {
        browser = await chromium.launch({
            headless,
            slowMo: 100
        });

        const context = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            locale: 'ja-JP'
        });

        const page = await context.newPage();
        page.setDefaultTimeout(60000);

        // ログイン
        await page.goto('https://note.com/login', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        const inputs = await page.$$('input:not([type="hidden"])');
        if (inputs.length >= 2) {
            await inputs[0].fill(NOTE_EMAIL);
            await inputs[1].fill(NOTE_PASSWORD);
        }

        await page.click('button:has-text("ログイン")');
        await page.waitForURL((url) => !url.href.includes('/login'), { timeout: 30000 });

        // 新規記事作成
        await page.goto('https://editor.note.com/new', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        // タイトル入力
        await fillNoteTitle(page, title);

        // Markdownを解析
        const elements = parseMarkdown(markdown);

        let bodyElements = elements;
        let eyecatchImagePath: string | null = null;

        const eyecatchIndex = elements.findIndex(
            (element) => element.type === 'image' && Boolean(element.imagePath)
        );
        if (eyecatchIndex !== -1) {
            const eyecatchElement = elements[eyecatchIndex];
            const imagePath = eyecatchElement.imagePath!;
            eyecatchImagePath = imagePath.startsWith('/')
                ? imagePath
                : path.join(imageBasePath, imagePath);

            bodyElements = [
                ...elements.slice(0, eyecatchIndex),
                ...elements.slice(eyecatchIndex + 1),
            ];
        }

        if (eyecatchImagePath) {
            await setEyecatchImage(page, eyecatchImagePath);
        }

        // エディタに書式付きで入力
        await formatToNoteEditor(page, bodyElements, imageBasePath, insertImageAtCurrentPosition);

        // 下書き保存
        if (saveAsDraft) {
            const saveBtn = page.locator('button:has-text("下書き保存")').first();
            await saveBtn.waitFor({ state: 'visible' });
            if (await saveBtn.isEnabled()) {
                await saveBtn.click();
                await page.waitForTimeout(3000);
            }
        }

        const noteUrl = page.url();

        return { success: true, noteUrl };

    } catch (error: any) {
        return { success: false, error: error.message };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * 公開ツールを登録する
 */
export function registerPublishTools(server: McpServer): void {
    /**
     * Obsidian記事をnoteに公開（書式付き + 画像自動挿入）
     */
    server.tool(
        "publish-from-obsidian",
        "Obsidian記事をnoteに公開（エディタUI操作で書式を適用、画像を自動挿入）",
        {
            markdownPath: z.string().describe("Markdownファイルのパス"),
            imageBasePath: z.string().optional().describe("画像ファイルの基準パス（デフォルト: Markdownファイルと同じディレクトリ）"),
            tags: z.array(z.string()).optional().describe("タグ（最大10個）"),
            headless: z.boolean().optional().default(false).describe("ヘッドレスモードで実行（デフォルト: false - ブラウザ表示）"),
            saveAsDraft: z.boolean().optional().default(true).describe("下書きとして保存（デフォルト: true）"),
        },
        async ({ markdownPath, imageBasePath, tags, headless, saveAsDraft }) => {
            // 認証チェック
            if (!hasAuth()) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: "認証が必要です",
                            message: "NOTE_EMAILとNOTE_PASSWORDを.envファイルに設定してください"
                        }, null, 2)
                    }]
                };
            }

            try {
                // ファイル存在確認
                if (!fs.existsSync(markdownPath)) {
                    throw new Error(`ファイルが見つかりません: ${markdownPath}`);
                }

                const markdown = fs.readFileSync(markdownPath, 'utf-8');
                const basePath = imageBasePath || path.dirname(markdownPath);

                // タイトルを抽出
                const title = extractTitle(markdown);

                // 本文を準備（タイトルとFrontmatterを除去）
                let body = removeTitle(markdown);
                body = removeFrontmatter(body).trim();

                // Markdownを解析して画像を確認
                const elements = parseMarkdown(body);
                const imageElements = elements.filter(e => e.type === 'image');

                // 画像の存在確認
                const imageInfo = imageElements.map(img => {
                    const fullPath = img.imagePath?.startsWith('/')
                        ? img.imagePath
                        : path.join(basePath, img.imagePath || '');
                    return {
                        fileName: img.imagePath,
                        localPath: fullPath,
                        exists: fs.existsSync(fullPath)
                    };
                });

                const missingImages = imageInfo.filter(i => !i.exists);
                if (missingImages.length > 0) {
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({
                                error: "画像ファイルが見つかりません",
                                missingImages: missingImages.map(i => i.fileName),
                                hint: "imageBasePathを確認してください"
                            }, null, 2)
                        }]
                    };
                }

                // Playwrightで記事を作成
                const result = await createNoteWithPlaywright(
                    title,
                    body,
                    basePath,
                    { headless, saveAsDraft }
                );

                if (!result.success) {
                    throw new Error(result.error);
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            message: saveAsDraft ? "下書きを作成しました" : "記事を作成しました",
                            title,
                            noteUrl: result.noteUrl,
                            imageCount: imageElements.length,
                            images: imageInfo.map(i => i.fileName),
                            tags: tags || [],
                            note: "エディタのUI操作で書式（見出し、リスト、引用など）を適用しました"
                        }, null, 2)
                    }]
                };

            } catch (error: any) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: "公開に失敗しました",
                            message: error.message
                        }, null, 2)
                    }]
                };
            }
        }
    );

    /**
     * 本文に画像を挿入（既存の下書きに対して）
     */
    server.tool(
        "insert-images-to-note",
        "noteエディタで本文に画像を挿入（Playwright使用）",
        {
            imagePaths: z.array(z.string()).describe("挿入する画像ファイルのパスの配列"),
            noteId: z.string().optional().describe("既存下書きのnoteIdまたはnoteKey（例: 12345 / n4f0c7b884789）"),
            editUrl: z.string().optional().describe("既存下書きの編集URL（例: https://editor.note.com/notes/nxxxx/edit/）"),
            headless: z.boolean().optional().default(false).describe("ヘッドレスモードで実行（デフォルト: false）"),
        },
        async ({ imagePaths, noteId, editUrl, headless }) => {
            // 認証チェック
            if (!hasAuth()) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: "認証が必要です",
                            message: "NOTE_EMAILとNOTE_PASSWORDを.envファイルに設定してください"
                        }, null, 2)
                    }]
                };
            }

            // 画像ファイルの存在確認
            const missingImages = imagePaths.filter(p => !fs.existsSync(p));
            if (missingImages.length > 0) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: "画像ファイルが見つかりません",
                            missingImages
                        }, null, 2)
                    }]
                };
            }

            try {
                const NOTE_EMAIL = process.env.NOTE_EMAIL;
                const NOTE_PASSWORD = process.env.NOTE_PASSWORD;

                const browser = await chromium.launch({
                    headless,
                    slowMo: 100
                });

                const context = await browser.newContext({
                    viewport: { width: 1280, height: 900 },
                    locale: 'ja-JP'
                });

                const page = await context.newPage();
                page.setDefaultTimeout(60000);

                // ログイン
                await page.goto('https://note.com/login', { waitUntil: 'networkidle' });
                await page.waitForTimeout(2000);

                const inputs = await page.$$('input:not([type="hidden"])');
                if (inputs.length >= 2) {
                    await inputs[0].fill(NOTE_EMAIL!);
                    await inputs[1].fill(NOTE_PASSWORD!);
                }

                await page.click('button:has-text("ログイン")');
                await page.waitForURL((url) => !url.href.includes('/login'), { timeout: 30000 });

                const normalizedEditUrl = editUrl?.trim();
                const normalizedNoteId = noteId?.trim();

                let targetUrl = 'https://editor.note.com/new';
                if (normalizedEditUrl) {
                    targetUrl = normalizedEditUrl;
                } else if (normalizedNoteId) {
                    const noteKey = normalizedNoteId.startsWith('n') ? normalizedNoteId : `n${normalizedNoteId}`;
                    targetUrl = `https://editor.note.com/notes/${noteKey}/edit/`;
                }

                await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(3000);

                if (!normalizedEditUrl && !normalizedNoteId) {
                    await fillNoteTitle(page, '画像テスト');
                }

                // 本文エリア
                const bodyBox = page.locator('div[contenteditable="true"][role="textbox"]').first();
                await bodyBox.waitFor({ state: 'visible' });
                await bodyBox.click();

                const keyCombos = process.platform === 'darwin'
                    ? ['Meta+ArrowDown', 'End']
                    : ['Control+End', 'End'];
                for (const combo of keyCombos) {
                    try {
                        await page.keyboard.press(combo);
                        break;
                    } catch {
                    }
                }
                await page.waitForTimeout(300);

                // 各画像を挿入
                const insertedImages: string[] = [];
                for (const imagePath of imagePaths) {
                    try {
                        await insertImageAtCurrentPosition(page, bodyBox, imagePath);
                        insertedImages.push(path.basename(imagePath));
                    } catch (e: any) {
                        console.error(`画像挿入エラー: ${imagePath}`, e.message);
                    }
                }

                // 下書き保存
                const saveBtn = page.locator('button:has-text("下書き保存")').first();
                await saveBtn.waitFor({ state: 'visible' });
                if (await saveBtn.isEnabled()) {
                    await saveBtn.click();
                    await page.waitForTimeout(3000);
                }

                const noteUrl = page.url();
                await browser.close();

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            message: "画像を挿入しました",
                            noteUrl,
                            insertedImages,
                            totalImages: imagePaths.length,
                            successCount: insertedImages.length
                        }, null, 2)
                    }]
                };

            } catch (error: any) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: "画像挿入に失敗しました",
                            message: error.message
                        }, null, 2)
                    }]
                };
            }
        }
    );

    /**
     * Obsidian記事をnoteに公開（リモートモード - 画像をBase64で受信）
     * Obsidianプラグインからの呼び出し用
     */
    server.tool(
        "publish-from-obsidian-remote",
        "Obsidian記事をnoteに公開（画像データをBase64で受信、リモートサーバー用）",
        {
            title: z.string().describe("記事タイトル"),
            markdown: z.string().describe("Markdown本文（タイトルなし）"),
            images: z.array(z.object({
                fileName: z.string().describe("ファイル名（例: image.png）"),
                base64: z.string().describe("Base64エンコードされた画像データ"),
                mimeType: z.string().optional().describe("MIMEタイプ（例: image/png）")
            })).optional().describe("Base64エンコードされた画像の配列"),
            tags: z.array(z.string()).optional().describe("タグ（最大10個）"),
            headless: z.boolean().optional().default(true).describe("ヘッドレスモードで実行（デフォルト: true）"),
            saveAsDraft: z.boolean().optional().default(true).describe("下書きとして保存（デフォルト: true）"),
        },
        async ({ title, markdown, images, tags, headless, saveAsDraft }) => {
            // 認証チェック
            if (!hasAuth()) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: "認証が必要です",
                            message: "NOTE_EMAILとNOTE_PASSWORDを.envファイルに設定してください"
                        }, null, 2)
                    }]
                };
            }

            let tempDir: string | null = null;

            try {
                // 一時ディレクトリを作成
                tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-images-'));

                // Base64画像をデコードして一時ファイルに保存
                const imageMap = new Map<string, string>();
                const decodedImages: { fileName: string; tempPath: string }[] = [];

                if (images && images.length > 0) {
                    for (const img of images) {
                        try {
                            const buffer = Buffer.from(img.base64, 'base64');
                            const tempPath = path.join(tempDir, img.fileName);
                            fs.writeFileSync(tempPath, buffer);
                            imageMap.set(img.fileName, tempPath);
                            decodedImages.push({ fileName: img.fileName, tempPath });
                        } catch (e: any) {
                            console.error(`画像デコードエラー: ${img.fileName}`, e.message);
                        }
                    }
                }

                // Markdownを解析して画像パスを一時ファイルパスに置換
                let processedMarkdown = markdown;

                // Obsidian形式の画像参照を置換: ![[filename.png]]
                processedMarkdown = processedMarkdown.replace(
                    /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g,
                    (match, fileName) => {
                        const cleanFileName = fileName.trim();
                        const baseName = path.basename(cleanFileName);
                        if (imageMap.has(baseName)) {
                            // 一時ファイルパスを使用
                            return `![](${imageMap.get(baseName)})`;
                        }
                        return match;
                    }
                );

                // 標準Markdown形式の画像参照を置換: ![alt](path)
                processedMarkdown = processedMarkdown.replace(
                    /!\[([^\]]*)\]\(([^)]+)\)/g,
                    (match, alt, srcPath) => {
                        if (srcPath.startsWith('http')) return match;
                        const baseName = path.basename(srcPath);
                        if (imageMap.has(baseName)) {
                            return `![${alt}](${imageMap.get(baseName)})`;
                        }
                        return match;
                    }
                );

                // Playwrightで記事を作成
                const result = await createNoteWithPlaywright(
                    title,
                    processedMarkdown,
                    tempDir,  // 一時ディレクトリを画像ベースパスとして使用
                    { headless, saveAsDraft }
                );

                if (!result.success) {
                    throw new Error(result.error);
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            message: saveAsDraft ? "下書きを作成しました" : "記事を作成しました",
                            title,
                            noteUrl: result.noteUrl,
                            imageCount: decodedImages.length,
                            images: decodedImages.map(i => i.fileName),
                            tags: tags || [],
                            note: "エディタのUI操作で書式（見出し、リスト、引用など）を適用しました"
                        }, null, 2)
                    }]
                };

            } catch (error: any) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: "公開に失敗しました",
                            message: error.message
                        }, null, 2)
                    }]
                };
            } finally {
                // 一時ディレクトリをクリーンアップ
                if (tempDir && fs.existsSync(tempDir)) {
                    try {
                        fs.rmSync(tempDir, { recursive: true, force: true });
                    } catch (e) {
                        console.error('一時ディレクトリの削除に失敗:', e);
                    }
                }
            }
        }
    );
}
