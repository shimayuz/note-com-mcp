#!/usr/bin/env node
/**
 * Obsidian to note.com Publisher
 * 
 * ワンコマンドでObsidian MarkdownをnoteにPublish
 * - Markdown → HTML変換
 * - ローカル画像を検出
 * - Playwrightでnote.comに下書き作成 + 画像挿入
 * 
 * 使い方:
 *   npx obsidian-to-note /path/to/article.md
 *   npx obsidian-to-note /path/to/article.md --headless
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// .envを読み込み（柔軟なパス指定）
const envPath = process.env.DOTENV_PATH || path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });

// ========================================
// Markdown Parser
// ========================================

function extractTitle(markdown) {
    const match = markdown.match(/^#\s+(.+)$/m);
    if (match) return match[1].trim();

    const fmMatch = markdown.match(/^---\s*\n[\s\S]*?title:\s*(.+)\n[\s\S]*?\n---/);
    if (fmMatch) return fmMatch[1].trim().replace(/^["']|["']$/g, '');

    return '無題';
}

function extractTags(markdown) {
    const fmMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fmMatch) return [];

    const tagsMatch = fmMatch[1].match(/^tags:\s*\[([^\]]+)\]/m);
    if (tagsMatch) {
        return tagsMatch[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, ''));
    }

    const yamlMatch = fmMatch[1].match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m);
    if (yamlMatch) {
        return yamlMatch[1]
            .split('\n')
            .filter(l => l.trim().startsWith('-'))
            .map(l => l.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, ''));
    }

    return [];
}

function extractImages(markdown, basePath) {
    const images = [];

    // Obsidian形式: ![[image.png]] or ![[image.png|alt]]
    const obsidianRegex = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    let match;
    while ((match = obsidianRegex.exec(markdown)) !== null) {
        const fileName = match[1].trim();
        images.push({
            fileName,
            localPath: findImagePath(fileName, basePath),
            original: match[0]
        });
    }

    // 標準Markdown形式: ![alt](path)
    const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    while ((match = mdRegex.exec(markdown)) !== null) {
        const src = match[2].trim();
        if (!src.startsWith('http')) {
            const fileName = path.basename(src);
            images.push({
                fileName,
                localPath: findImagePath(src, basePath),
                original: match[0]
            });
        }
    }

    return images;
}

function findImagePath(fileName, basePath) {
    // 直接パス
    const direct = path.isAbsolute(fileName) ? fileName : path.join(basePath, fileName);
    if (fs.existsSync(direct)) return direct;

    // 相対パス（./images/など）
    const relative = path.join(basePath, fileName);
    if (fs.existsSync(relative)) return relative;

    // 一般的な画像フォルダを探索
    const commonDirs = ['images', 'attachments', 'assets', 'media', '.'];
    for (const dir of commonDirs) {
        const tryPath = path.join(basePath, dir, path.basename(fileName));
        if (fs.existsSync(tryPath)) return tryPath;
    }

    // Vault内を探索（上位ディレクトリ）
    let current = basePath;
    for (let i = 0; i < 5; i++) {
        for (const dir of commonDirs) {
            const tryPath = path.join(current, dir, path.basename(fileName));
            if (fs.existsSync(tryPath)) return tryPath;
        }
        current = path.dirname(current);
    }

    return null;
}

// ========================================
// Markdown Element Parser (for Playwright)
// ========================================

function parseMarkdownElements(markdown) {
    // Frontmatter除去
    let content = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
    // タイトル（H1）除去
    content = content.replace(/^#\s+.+\n?/, '');

    const elements = [];
    const lines = content.split('\n');

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        if (line.trim() === '') {
            i++;
            continue;
        }

        // コードブロック
        if (line.startsWith('```')) {
            const codeLines = [];
            i++;
            while (i < lines.length && !lines[i].startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            elements.push({ type: 'code', content: codeLines.join('\n') });
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
            const items = [];
            while (i < lines.length && lines[i].match(/^[-*] /)) {
                items.push(lines[i].replace(/^[-*] /, '').trim());
                i++;
            }
            elements.push({ type: 'bulletList', items });
            continue;
        }

        // 番号付きリスト
        if (line.match(/^\d+\. /)) {
            const items = [];
            while (i < lines.length && lines[i].match(/^\d+\. /)) {
                items.push(lines[i].replace(/^\d+\. /, '').trim());
                i++;
            }
            elements.push({ type: 'numberedList', items });
            continue;
        }

        // 画像
        const obsidianImg = line.match(/^!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
        const mdImg = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);

        if (obsidianImg) {
            elements.push({ type: 'image', fileName: obsidianImg[1].trim() });
            i++;
            continue;
        }
        if (mdImg && !mdImg[2].startsWith('http')) {
            elements.push({ type: 'image', fileName: path.basename(mdImg[2]) });
            i++;
            continue;
        }

        // 通常のテキスト
        elements.push({ type: 'paragraph', content: line.trim() });
        i++;
    }

    return elements;
}

// ========================================
// Playwright Publisher
// ========================================

async function clickPlusButton(page) {
    const bodyBox = page.locator('div[contenteditable="true"][role="textbox"]').first();
    const bodyBoxHandle = await bodyBox.boundingBox();

    if (!bodyBoxHandle) return false;

    const allBtns = await page.$$('button');

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
            await page.waitForTimeout(1000);
            return true;
        }
    }

    // フォールバック
    const plusX = bodyBoxHandle.x - 30;
    const plusY = bodyBoxHandle.y + 50;
    await page.mouse.click(plusX, plusY);
    await page.waitForTimeout(1000);
    return true;
}

async function selectMenuItem(page, menuText) {
    const menuItem = page.locator(`[role="menuitem"]:has-text("${menuText}")`).first();
    try {
        await menuItem.waitFor({ state: 'visible', timeout: 3000 });
        await menuItem.click();
        await page.waitForTimeout(500);
        return true;
    } catch {
        return false;
    }
}

async function insertImage(page, imagePath) {
    console.log(`   🖼️ 画像挿入: ${path.basename(imagePath)}`);

    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    const clicked = await clickPlusButton(page);
    if (!clicked) {
        console.log('   ⚠️ 「+」ボタンが見つかりません');
        return false;
    }

    // メニューが表示されるまで待機
    await page.waitForTimeout(500);

    let chooser = null;

    try {
        // 方法1: role="menuitem"で「画像」を探す
        const imageMenuItem = page.locator('[role="menuitem"]:has-text("画像"), [role="option"]:has-text("画像"), div:has-text("画像"):not(:has(*:has-text("画像")))').first();

        const isVisible = await imageMenuItem.isVisible().catch(() => false);
        if (isVisible) {
            [chooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 10000 }),
                imageMenuItem.click(),
            ]);
        } else {
            // 方法2: テキスト「画像」を直接クリック
            const imageText = page.getByText('画像', { exact: true });
            [chooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 10000 }),
                imageText.click(),
            ]);
        }

        await chooser.setFiles(imagePath);
        await page.waitForTimeout(3000);

        // トリミングダイアログ
        const dialog = page.locator('div[role="dialog"]');
        try {
            await dialog.waitFor({ state: 'visible', timeout: 5000 });
            const saveBtn = dialog.locator('button:has-text("保存")').first();
            await saveBtn.waitFor({ state: 'visible', timeout: 5000 });
            await saveBtn.click();
            await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => { });
            await page.waitForTimeout(3000);
        } catch {
            // ダイアログなし
        }

        console.log(`   ✅ 画像挿入完了`);
        return true;
    } catch (e) {
        console.log(`   ❌ 画像挿入失敗: ${e.message}`);
        await page.screenshot({ path: '/tmp/image-insert-error.png' });
        return false;
    }
}

async function insertHeading(page, text, level) {
    const clicked = await clickPlusButton(page);
    if (!clicked) {
        await page.keyboard.type(level === 'h2' ? `## ${text}` : `### ${text}`);
        await page.keyboard.press('Enter');
        return;
    }

    const menuText = level === 'h2' ? '大見出し' : '小見出し';
    const selected = await selectMenuItem(page, menuText);

    if (!selected) {
        await page.keyboard.type(level === 'h2' ? `## ${text}` : `### ${text}`);
        await page.keyboard.press('Enter');
        return;
    }

    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
}

async function insertBulletList(page, items) {
    const clicked = await clickPlusButton(page);
    const selected = clicked && await selectMenuItem(page, '箇条書きリスト');

    if (!selected) {
        for (const item of items) {
            await page.keyboard.type(`- ${item}`);
            await page.keyboard.press('Enter');
        }
        return;
    }

    for (let i = 0; i < items.length; i++) {
        await page.keyboard.type(items[i]);
        if (i < items.length - 1) await page.keyboard.press('Enter');
    }
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
}

async function insertQuote(page, text) {
    const clicked = await clickPlusButton(page);
    const selected = clicked && await selectMenuItem(page, '引用');

    if (!selected) {
        await page.keyboard.type(`> ${text}`);
        await page.keyboard.press('Enter');
        return;
    }

    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
}

async function insertCodeBlock(page, code) {
    const clicked = await clickPlusButton(page);
    const selected = clicked && await selectMenuItem(page, 'コード');

    if (!selected) {
        await page.keyboard.type('```');
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

// ========================================
// Main
// ========================================

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
📝 Obsidian to note.com Publisher

使い方:
  npx obsidian-to-note <markdown-file> [options]

オプション:
  --headless    ブラウザを非表示で実行
  --help        ヘルプを表示
  --env <path>  .envファイルのパスを指定

例:
  npx obsidian-to-note ./article.md
  npx obsidian-to-note ./article.md --headless
  npx obsidian-to-note ./article.md --env /path/to/.env
`);
        process.exit(0);
    }

    const mdPath = args.find(a => !a.startsWith('--'));
    const headless = args.includes('--headless');
    const envIndex = args.indexOf('--env');
    const envPath = envIndex !== -1 ? args[envIndex + 1] : null;

    if (!mdPath) {
        console.error('❌ Markdownファイルを指定してください');
        process.exit(1);
    }

    const absolutePath = path.resolve(mdPath);

    if (!fs.existsSync(absolutePath)) {
        console.error(`❌ ファイルが見つかりません: ${absolutePath}`);
        process.exit(1);
    }

    // .envパスを再読み込み
    if (envPath) {
        dotenv.config({ path: path.resolve(envPath) });
    }

    // 環境変数を再度取得
    const NOTE_EMAIL = process.env.NOTE_EMAIL;
    const NOTE_PASSWORD = process.env.NOTE_PASSWORD;

    if (!NOTE_EMAIL || !NOTE_PASSWORD) {
        console.error('❌ NOTE_EMAILとNOTE_PASSWORDを.envに設定してください');
        if (envPath) console.error(`   .envパス: ${envPath}`);
        else console.error(`   .envパス: ${envPath || envPath}`);
        process.exit(1);
    }

    console.log('\n🚀 Obsidian → note.com Publisher\n');
    console.log(`📄 ファイル: ${absolutePath}`);
    if (envPath) console.log(`🔐 .env: ${envPath}`);

    // Markdown読み込み
    const markdown = fs.readFileSync(absolutePath, 'utf-8');
    const basePath = path.dirname(absolutePath);

    // メタデータ抽出
    const title = extractTitle(markdown);
    const tags = extractTags(markdown);
    const images = extractImages(markdown, basePath);

    console.log(`📝 タイトル: ${title}`);
    console.log(`🏷️ タグ: ${tags.length > 0 ? tags.join(', ') : '(なし)'}`);
    console.log(`🖼️ 画像: ${images.length}件`);

    // 画像の存在確認
    const validImages = images.filter(img => img.localPath);
    const missingImages = images.filter(img => !img.localPath);

    if (missingImages.length > 0) {
        console.log(`\n⚠️ 見つからない画像:`);
        missingImages.forEach(img => console.log(`   - ${img.fileName}`));
    }

    validImages.forEach(img => console.log(`   ✅ ${img.fileName}`));

    // 要素に分解
    const elements = parseMarkdownElements(markdown);
    console.log(`\n📊 要素数: ${elements.length}`);

    // Playwright起動
    console.log('\n🌐 ブラウザを起動...');

    const browser = await chromium.launch({ headless, slowMo: 100 });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: 'ja-JP'
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);

    try {
        // ログイン
        console.log('🔐 ログイン中...');
        await page.goto('https://note.com/login', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        const inputs = await page.$$('input:not([type="hidden"])');
        if (inputs.length >= 2) {
            await inputs[0].fill(NOTE_EMAIL);
            await inputs[1].fill(NOTE_PASSWORD);
        }

        await page.click('button:has-text("ログイン")');
        await page.waitForURL(url => !url.href.includes('/login'), { timeout: 30000 });
        console.log('✅ ログイン成功');

        // 新規記事作成
        console.log('\n📝 新規記事作成...');
        await page.goto('https://editor.note.com/new', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        // タイトル入力
        const titleArea = page.locator('textarea[placeholder*="タイトル"]');
        await titleArea.waitFor({ state: 'visible' });
        await titleArea.fill(title);
        console.log('✅ タイトル入力完了');

        // 本文エリア
        const bodyBox = page.locator('div[contenteditable="true"][role="textbox"]').first();
        await bodyBox.waitFor({ state: 'visible' });
        await bodyBox.click();

        // 要素を入力
        console.log('\n📝 本文を入力中...');

        // 画像マップを作成
        const imageMap = new Map();
        validImages.forEach(img => imageMap.set(img.fileName, img.localPath));

        for (const element of elements) {
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
                    await insertBulletList(page, element.items);
                    break;
                case 'numberedList':
                    // 番号付きリストも箇条書きと同様に処理
                    for (const item of element.items) {
                        await page.keyboard.type(`• ${item}`);
                        await page.keyboard.press('Enter');
                    }
                    break;
                case 'quote':
                    await insertQuote(page, element.content);
                    break;
                case 'code':
                    await insertCodeBlock(page, element.content);
                    break;
                case 'image':
                    if (imageMap.has(element.fileName)) {
                        await insertImage(page, imageMap.get(element.fileName));
                    } else {
                        console.log(`   ⚠️ 画像スキップ: ${element.fileName}`);
                    }
                    break;
                case 'hr':
                    await clickPlusButton(page);
                    await selectMenuItem(page, '区切り線');
                    break;
            }
            await page.waitForTimeout(200);
        }

        // 下書き保存
        console.log('\n💾 下書き保存中...');
        const saveBtn = page.locator('button:has-text("下書き保存")').first();
        await saveBtn.waitFor({ state: 'visible' });
        if (await saveBtn.isEnabled()) {
            await saveBtn.click();
            await page.waitForTimeout(3000);
        }

        const noteUrl = page.url();

        console.log('\n' + '='.repeat(50));
        console.log('🎉 完了！');
        console.log(`📍 URL: ${noteUrl}`);
        console.log('='.repeat(50) + '\n');

    } catch (error) {
        console.error('\n❌ エラー:', error.message);
        await page.screenshot({ path: '/tmp/obsidian-to-note-error.png' });
        console.log('📸 スクリーンショット: /tmp/obsidian-to-note-error.png');
    } finally {
        if (!headless) {
            console.log('ブラウザを閉じるには Enter を押してください...');
            await new Promise(resolve => process.stdin.once('data', resolve));
        }
        await browser.close();
    }
}

main();
