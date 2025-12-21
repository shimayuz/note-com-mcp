import { Page } from "playwright";

/**
 * Markdownの要素タイプ
 */
export type MarkdownElementType =
    | 'heading2'      // ## 見出し
    | 'heading3'      // ### 小見出し
    | 'paragraph'     // 通常のテキスト
    | 'bulletList'    // - 箇条書き
    | 'numberedList'  // 1. 番号付きリスト
    | 'quote'         // > 引用
    | 'code'          // ```コードブロック```
    | 'image'         // ![alt](path) 画像
    | 'hr';           // --- 区切り線

/**
 * パースされたMarkdown要素
 */
export interface MarkdownElement {
    type: MarkdownElementType;
    content: string;
    language?: string;  // コードブロックの言語
    imagePath?: string; // 画像のパス
}

/**
 * MarkdownをnoteエディタのUI操作用に解析
 */
export function parseMarkdown(markdown: string): MarkdownElement[] {
    const elements: MarkdownElement[] = [];
    const lines = markdown.split('\n');

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        // 空行はスキップ
        if (line.trim() === '') {
            i++;
            continue;
        }

        // コードブロック
        if (line.startsWith('```')) {
            const language = line.slice(3).trim();
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            elements.push({
                type: 'code',
                content: codeLines.join('\n'),
                language
            });
            i++;
            continue;
        }

        // 見出し
        if (line.startsWith('## ')) {
            elements.push({ type: 'heading2', content: line.slice(3).trim() });
            i++;
            continue;
        }
        if (line.startsWith('### ')) {
            elements.push({ type: 'heading3', content: line.slice(4).trim() });
            i++;
            continue;
        }

        // 区切り線
        if (line.match(/^---+$/)) {
            elements.push({ type: 'hr', content: '' });
            i++;
            continue;
        }

        // 引用
        if (line.startsWith('> ')) {
            elements.push({ type: 'quote', content: line.slice(2).trim() });
            i++;
            continue;
        }

        // 箇条書き
        if (line.match(/^[-*] /)) {
            const listItems: string[] = [];
            while (i < lines.length && lines[i].match(/^[-*] /)) {
                listItems.push(lines[i].replace(/^[-*] /, '').trim());
                i++;
            }
            elements.push({ type: 'bulletList', content: listItems.join('\n') });
            continue;
        }

        // 番号付きリスト
        if (line.match(/^\d+\. /)) {
            const listItems: string[] = [];
            while (i < lines.length && lines[i].match(/^\d+\. /)) {
                listItems.push(lines[i].replace(/^\d+\. /, '').trim());
                i++;
            }
            elements.push({ type: 'numberedList', content: listItems.join('\n') });
            continue;
        }

        // 画像 ![[filename]] または ![alt](path)
        const obsidianImageMatch = line.match(/^!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
        const mdImageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);

        if (obsidianImageMatch) {
            elements.push({
                type: 'image',
                content: obsidianImageMatch[1],
                imagePath: obsidianImageMatch[1]
            });
            i++;
            continue;
        }

        if (mdImageMatch) {
            elements.push({
                type: 'image',
                content: mdImageMatch[1],
                imagePath: mdImageMatch[2]
            });
            i++;
            continue;
        }

        // 通常のテキスト（段落）
        elements.push({ type: 'paragraph', content: line.trim() });
        i++;
    }

    return elements;
}

/**
 * noteエディタにMarkdown要素を入力
 */
export async function formatToNoteEditor(
    page: Page,
    elements: MarkdownElement[],
    imageBasePath: string,
    insertImageFn: (page: Page, bodyBox: any, imagePath: string) => Promise<void>
): Promise<void> {
    const bodyBox = page.locator('div[contenteditable="true"][role="textbox"]').first();
    await bodyBox.waitFor({ state: 'visible' });
    await bodyBox.click();

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];

        switch (element.type) {
            case 'heading2':
                await insertHeading(page, element.content, 'h2');
                break;

            case 'heading3':
                await insertHeading(page, element.content, 'h3');
                break;

            case 'paragraph':
                await page.keyboard.type(element.content);
                await page.keyboard.press('Enter');
                break;

            case 'bulletList':
                await insertBulletList(page, element.content.split('\n'));
                break;

            case 'numberedList':
                await insertNumberedList(page, element.content.split('\n'));
                break;

            case 'quote':
                await insertQuote(page, element.content);
                break;

            case 'code':
                await insertCodeBlock(page, element.content, element.language);
                break;

            case 'image':
                if (element.imagePath) {
                    const fullPath = element.imagePath.startsWith('/')
                        ? element.imagePath
                        : `${imageBasePath}/${element.imagePath}`;
                    await insertImageFn(page, bodyBox, fullPath);
                }
                break;

            case 'hr':
                await insertHorizontalRule(page);
                break;
        }

        // 要素間に少し待機
        await page.waitForTimeout(200);
    }
}

/**
 * 見出しを挿入（「+」メニューから）
 */
async function insertHeading(page: Page, text: string, level: 'h2' | 'h3'): Promise<void> {
    // 「+」ボタンをクリック
    await clickPlusButton(page);

    // メニューから見出しを選択
    const menuText = level === 'h2' ? '大見出し' : '小見出し';
    const menuItem = page.locator(`[role="menuitem"]:has-text("${menuText}")`).first();

    try {
        await menuItem.waitFor({ state: 'visible', timeout: 3000 });
        await menuItem.click();
        await page.waitForTimeout(500);
    } catch (e) {
        // メニューが開かない場合はテキストとして入力
        await page.keyboard.type(level === 'h2' ? `## ${text}` : `### ${text}`);
        await page.keyboard.press('Enter');
        return;
    }

    // テキストを入力
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
}

/**
 * 箇条書きリストを挿入
 */
async function insertBulletList(page: Page, items: string[]): Promise<void> {
    // 「+」ボタンをクリック
    await clickPlusButton(page);

    // メニューから箇条書きを選択
    const menuItem = page.locator('[role="menuitem"]:has-text("箇条書きリスト")').first();

    try {
        await menuItem.waitFor({ state: 'visible', timeout: 3000 });
        await menuItem.click();
        await page.waitForTimeout(500);
    } catch (e) {
        // フォールバック: テキストとして入力
        for (const item of items) {
            await page.keyboard.type(`- ${item}`);
            await page.keyboard.press('Enter');
        }
        return;
    }

    // 各項目を入力
    for (let i = 0; i < items.length; i++) {
        await page.keyboard.type(items[i]);
        if (i < items.length - 1) {
            await page.keyboard.press('Enter');
        }
    }

    // リストを終了
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
}

/**
 * 番号付きリストを挿入
 */
async function insertNumberedList(page: Page, items: string[]): Promise<void> {
    // 「+」ボタンをクリック
    await clickPlusButton(page);

    // メニューから番号付きリストを選択
    const menuItem = page.locator('[role="menuitem"]:has-text("番号付きリスト")').first();

    try {
        await menuItem.waitFor({ state: 'visible', timeout: 3000 });
        await menuItem.click();
        await page.waitForTimeout(500);
    } catch (e) {
        // フォールバック
        for (let i = 0; i < items.length; i++) {
            await page.keyboard.type(`${i + 1}. ${items[i]}`);
            await page.keyboard.press('Enter');
        }
        return;
    }

    // 各項目を入力
    for (let i = 0; i < items.length; i++) {
        await page.keyboard.type(items[i]);
        if (i < items.length - 1) {
            await page.keyboard.press('Enter');
        }
    }

    // リストを終了
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
}

/**
 * 引用を挿入
 */
async function insertQuote(page: Page, text: string): Promise<void> {
    // 「+」ボタンをクリック
    await clickPlusButton(page);

    // メニューから引用を選択
    const menuItem = page.locator('[role="menuitem"]:has-text("引用")').first();

    try {
        await menuItem.waitFor({ state: 'visible', timeout: 3000 });
        await menuItem.click();
        await page.waitForTimeout(500);
    } catch (e) {
        // フォールバック
        await page.keyboard.type(`> ${text}`);
        await page.keyboard.press('Enter');
        return;
    }

    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
}

/**
 * コードブロックを挿入
 */
async function insertCodeBlock(page: Page, code: string, language?: string): Promise<void> {
    // 「+」ボタンをクリック
    await clickPlusButton(page);

    // メニューからコードを選択
    const menuItem = page.locator('[role="menuitem"]:has-text("コード")').first();

    try {
        await menuItem.waitFor({ state: 'visible', timeout: 3000 });
        await menuItem.click();
        await page.waitForTimeout(500);
    } catch (e) {
        // フォールバック
        await page.keyboard.type('```' + (language || ''));
        await page.keyboard.press('Enter');
        await page.keyboard.type(code);
        await page.keyboard.press('Enter');
        await page.keyboard.type('```');
        await page.keyboard.press('Enter');
        return;
    }

    await page.keyboard.type(code);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
}

/**
 * 区切り線を挿入
 */
async function insertHorizontalRule(page: Page): Promise<void> {
    // 「+」ボタンをクリック
    await clickPlusButton(page);

    // メニューから区切り線を選択
    const menuItem = page.locator('[role="menuitem"]:has-text("区切り線")').first();

    try {
        await menuItem.waitFor({ state: 'visible', timeout: 3000 });
        await menuItem.click();
        await page.waitForTimeout(500);
    } catch (e) {
        // フォールバック
        await page.keyboard.type('---');
        await page.keyboard.press('Enter');
    }
}

/**
 * 「+」ボタンをクリック
 */
async function clickPlusButton(page: Page): Promise<void> {
    const bodyBox = page.locator('div[contenteditable="true"][role="textbox"]').first();
    const bodyBoxHandle = await bodyBox.boundingBox();

    if (!bodyBoxHandle) {
        throw new Error("本文エリアが見つかりません");
    }

    // 「+」ボタンを探す
    const allBtns = await page.$$('button');
    let clicked = false;

    for (const btn of allBtns) {
        const box = await btn.boundingBox();
        if (!box) continue;

        if (box.x > bodyBoxHandle.x - 100 &&
            box.x < bodyBoxHandle.x &&
            box.y > bodyBoxHandle.y &&
            box.y < bodyBoxHandle.y + 300 &&
            box.width < 60) {

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.waitForTimeout(200);
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            clicked = true;
            await page.waitForTimeout(1000);
            break;
        }
    }

    // フォールバック
    if (!clicked) {
        const plusX = bodyBoxHandle.x - 30;
        const plusY = bodyBoxHandle.y + 50;
        await page.mouse.click(plusX, plusY);
        await page.waitForTimeout(1000);
    }
}

/**
 * Markdownからタイトルを抽出
 */
export function extractTitle(markdown: string): string {
    const match = markdown.match(/^# (.+)$/m);
    return match ? match[1].trim() : '無題';
}

/**
 * Markdownからタイトル行を除去
 */
export function removeTitle(markdown: string): string {
    return markdown.replace(/^# .+\n?/, '');
}

/**
 * Frontmatterを除去
 */
export function removeFrontmatter(markdown: string): string {
    return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '');
}
