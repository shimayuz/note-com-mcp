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
// API経由での画像挿入（v1.2.0新機能）
// ========================================

async function uploadImageToNoteS3(imagePath, sessionCookie, xsrfToken) {
    const imageBuffer = fs.readFileSync(imagePath);
    const fileName = path.basename(imagePath);
    const ext = path.extname(imagePath).toLowerCase();

    const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
    };
    const mimeType = mimeTypes[ext] || 'image/png';

    // Step 1: Presigned URLを取得
    const boundary1 = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
    const presignBody =
        `--${boundary1}\r\n` +
        `Content-Disposition: form-data; name="filename"\r\n\r\n` +
        `${fileName}\r\n` +
        `--${boundary1}--\r\n`;

    const presignResponse = await fetch('https://note.com/api/v3/images/upload/presigned_post', {
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary1}`,
            'Cookie': `_note_session_v5=${sessionCookie}; XSRF-TOKEN=${xsrfToken}`,
            'X-XSRF-TOKEN': xsrfToken,
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://editor.note.com/'
        },
        body: presignBody
    });

    const presignData = await presignResponse.json();

    if (!presignData.data?.post) {
        throw new Error('Presigned URL取得失敗');
    }

    const { url: finalImageUrl, action: s3Url, post: s3Params } = presignData.data;

    // Step 2: S3にアップロード
    const boundary2 = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
    const s3FormParts = [];

    const paramOrder = ['key', 'acl', 'Expires', 'policy', 'x-amz-credential', 'x-amz-algorithm', 'x-amz-date', 'x-amz-signature'];
    for (const key of paramOrder) {
        if (s3Params[key]) {
            s3FormParts.push(Buffer.from(
                `--${boundary2}\r\n` +
                `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
                `${s3Params[key]}\r\n`
            ));
        }
    }

    s3FormParts.push(Buffer.from(
        `--${boundary2}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`
    ));
    s3FormParts.push(imageBuffer);
    s3FormParts.push(Buffer.from('\r\n'));
    s3FormParts.push(Buffer.from(`--${boundary2}--\r\n`));

    const s3FormData = Buffer.concat(s3FormParts);

    const s3Response = await fetch(s3Url, {
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary2}`,
            'Content-Length': s3FormData.length.toString()
        },
        body: s3FormData
    });

    if (!s3Response.ok && s3Response.status !== 204) {
        throw new Error(`S3アップロード失敗: ${s3Response.status}`);
    }

    return finalImageUrl;
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function publishWithApi(absolutePath, envPath) {
    console.log('\n🚀 Obsidian → note.com Publisher (API経由モード)\n');
    console.log(`📄 ファイル: ${absolutePath}`);

    // 環境変数を取得
    const NOTE_SESSION_V5 = process.env.NOTE_SESSION_V5;
    const NOTE_XSRF_TOKEN = process.env.NOTE_XSRF_TOKEN;

    if (!NOTE_SESSION_V5 || !NOTE_XSRF_TOKEN) {
        console.error('❌ API経由モードにはNOTE_SESSION_V5とNOTE_XSRF_TOKENが必要です');
        console.error('   .envファイルにセッション情報を追加してください');
        console.error('   取得方法: ブラウザでnote.comにログイン → DevTools → Application → Cookies');
        process.exit(1);
    }

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

    // 画像をアップロード
    const uploadedImages = new Map();
    if (validImages.length > 0) {
        console.log('\n📤 画像をアップロード中...');
        for (const img of validImages) {
            try {
                const imageUrl = await uploadImageToNoteS3(img.localPath, NOTE_SESSION_V5, NOTE_XSRF_TOKEN);
                uploadedImages.set(img.fileName, imageUrl);
                console.log(`   ✅ ${img.fileName}`);
            } catch (e) {
                console.log(`   ❌ ${img.fileName}: ${e.message}`);
            }
        }
    }

    // 本文を準備（Frontmatter除去、タイトル除去）
    let body = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
    body = body.replace(/^#\s+.+\n?/, '');

    // 画像参照をHTMLに置換
    // Obsidian形式: ![[filename.png]] or ![[filename.png|caption]]
    body = body.replace(
        /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
        (match, fileName, caption) => {
            const cleanFileName = fileName.trim();
            const baseName = path.basename(cleanFileName);
            if (uploadedImages.has(baseName)) {
                const imageUrl = uploadedImages.get(baseName);
                const uuid1 = generateUUID();
                const uuid2 = generateUUID();
                return `<figure name="${uuid1}" id="${uuid2}"><img src="${imageUrl}" alt="" width="620" height="auto"><figcaption>${caption || ''}</figcaption></figure>`;
            }
            return match;
        }
    );

    // 標準Markdown形式: ![alt](path)
    body = body.replace(
        /!\[([^\]]*)\]\(([^)]+)\)/g,
        (match, alt, srcPath) => {
            if (srcPath.startsWith('http')) return match;
            const baseName = path.basename(srcPath);
            if (uploadedImages.has(baseName)) {
                const imageUrl = uploadedImages.get(baseName);
                const uuid1 = generateUUID();
                const uuid2 = generateUUID();
                return `<figure name="${uuid1}" id="${uuid2}"><img src="${imageUrl}" alt="" width="620" height="auto"><figcaption>${alt || ''}</figcaption></figure>`;
            }
            return match;
        }
    );

    // 基本的なMarkdown→HTML変換
    // 見出し
    body = body.replace(/^### (.+)$/gm, (_, text) => `<h3 name="${generateUUID()}" id="${generateUUID()}">${text}</h3>`);
    body = body.replace(/^## (.+)$/gm, (_, text) => `<h2 name="${generateUUID()}" id="${generateUUID()}">${text}</h2>`);

    // 段落
    body = body.split('\n\n').map(para => {
        para = para.trim();
        if (para === '') return '';
        if (para.startsWith('<')) return para;
        return `<p name="${generateUUID()}" id="${generateUUID()}">${para}</p>`;
    }).join('');

    // Step 1: 下書きを作成
    console.log('\n📝 下書きを作成中...');

    const createResponse = await fetch('https://note.com/api/v1/text_notes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': `_note_session_v5=${NOTE_SESSION_V5}; XSRF-TOKEN=${NOTE_XSRF_TOKEN}`,
            'X-XSRF-TOKEN': NOTE_XSRF_TOKEN,
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://editor.note.com',
            'Referer': 'https://editor.note.com/'
        },
        body: JSON.stringify({
            body: '<p></p>',
            body_length: 0,
            name: title,
            index: false,
            is_lead_form: false
        })
    });

    const createData = await createResponse.json();

    if (!createData.data?.id) {
        console.error('❌ 下書き作成に失敗しました');
        console.error(createData);
        process.exit(1);
    }

    const noteId = createData.data.id;
    const noteKey = createData.data.key;

    // Step 2: 画像付き本文を保存
    console.log('💾 画像付き本文を保存中...');

    const updateResponse = await fetch(`https://note.com/api/v1/text_notes/draft_save?id=${noteId}&is_temp_saved=true`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': `_note_session_v5=${NOTE_SESSION_V5}; XSRF-TOKEN=${NOTE_XSRF_TOKEN}`,
            'X-XSRF-TOKEN': NOTE_XSRF_TOKEN,
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://editor.note.com',
            'Referer': 'https://editor.note.com/'
        },
        body: JSON.stringify({
            body: body,
            body_length: body.length,
            name: title,
            index: false,
            is_lead_form: false
        })
    });

    const updateData = await updateResponse.json();

    const editUrl = `https://editor.note.com/notes/${noteKey}/edit/`;

    console.log('\n' + '='.repeat(50));
    console.log('🎉 完了！');
    console.log(`📍 編集URL: ${editUrl}`);
    console.log(`🖼️ アップロードした画像: ${uploadedImages.size}件`);
    console.log('='.repeat(50) + '\n');

    return { noteId, noteKey, editUrl, uploadedImages };
}

// ========================================
// Main
// ========================================

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
📝 Obsidian to note.com Publisher v1.2.0

使い方:
  npx obsidian-to-note <markdown-file> [options]

オプション:
  --api         API経由で画像挿入（推奨：安定・高速）
  --headless    ブラウザを非表示で実行（Playwrightモード）
  --help        ヘルプを表示
  --env <path>  .envファイルのパスを指定

例:
  npx obsidian-to-note ./article.md --api          # API経由（推奨）
  npx obsidian-to-note ./article.md --headless     # Playwright経由
  npx obsidian-to-note ./article.md --env /path/to/.env
`);
        process.exit(0);
    }

    const mdPath = args.find(a => !a.startsWith('--'));
    const headless = args.includes('--headless');
    const useApi = args.includes('--api');
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

    // API経由モードの場合
    if (useApi) {
        await publishWithApi(absolutePath, envPath);
        return;
    }

    // Playwrightモード（従来の動作）
    // 環境変数を再度取得
    const NOTE_EMAIL = process.env.NOTE_EMAIL;
    const NOTE_PASSWORD = process.env.NOTE_PASSWORD;

    if (!NOTE_EMAIL || !NOTE_PASSWORD) {
        console.error('❌ NOTE_EMAILとNOTE_PASSWORDを.envに設定してください');
        if (envPath) console.error(`   .envパス: ${envPath}`);
        else console.error(`   .envパス: ${envPath || envPath}`);
        process.exit(1);
    }

    console.log('\n🚀 Obsidian → note.com Publisher (Playwrightモード)\n');
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
