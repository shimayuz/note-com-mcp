/**
 * 完全な画像挿入フロー：ローカル画像 → S3アップロード → 本文挿入
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const NOTE_SESSION_V5 = process.env.NOTE_SESSION_V5;
const NOTE_XSRF_TOKEN = process.env.NOTE_XSRF_TOKEN;

/**
 * 画像をnote.comのS3にアップロード
 */
async function uploadImageToNote(imagePath) {
    console.log(`📤 画像をアップロード: ${path.basename(imagePath)}`);

    // ファイル読み込み
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
            'Cookie': `_note_session_v5=${NOTE_SESSION_V5}; XSRF-TOKEN=${NOTE_XSRF_TOKEN}`,
            'X-XSRF-TOKEN': NOTE_XSRF_TOKEN,
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://editor.note.com/'
        },
        body: presignBody
    });

    const presignData = await presignResponse.json();
    
    if (!presignData.data?.post) {
        throw new Error('Presigned URL取得失敗: ' + JSON.stringify(presignData));
    }

    const { url: finalImageUrl, action: s3Url, post: s3Params } = presignData.data;
    console.log(`  ✅ Presigned URL取得成功`);

    // Step 2: S3にアップロード
    const boundary2 = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
    const s3FormParts = [];

    // S3パラメータを追加
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

    // ファイルパート
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

    console.log(`  ✅ S3アップロード成功: ${finalImageUrl}`);
    return finalImageUrl;
}

/**
 * 画像URLを含む本文HTMLを生成
 */
function generateImageHtml(imageUrl, caption = '') {
    const uuid1 = randomUUID();
    const uuid2 = randomUUID();
    return `<figure name="${uuid1}" id="${uuid2}"><img src="${imageUrl}" alt="" width="620" height="auto"><figcaption>${caption}</figcaption></figure>`;
}

/**
 * Markdownを画像付きHTMLに変換
 */
async function convertMarkdownWithImages(markdown, imageBasePath) {
    let html = markdown;
    const uploadedImages = new Map();

    // Obsidian形式の画像を検出: ![[filename.png]] or ![[filename.png|caption]]
    const obsidianRegex = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let match;

    while ((match = obsidianRegex.exec(markdown)) !== null) {
        const fileName = match[1].trim();
        const caption = match[2]?.trim() || '';
        const fullMatch = match[0];

        if (!uploadedImages.has(fileName)) {
            // 画像パスを解決
            let imagePath = path.join(imageBasePath, fileName);
            if (!fs.existsSync(imagePath)) {
                // note_imagesディレクトリも探す
                const altPath = path.join(imageBasePath, 'note_images', fileName);
                if (fs.existsSync(altPath)) {
                    imagePath = altPath;
                } else {
                    console.warn(`⚠️ 画像が見つかりません: ${fileName}`);
                    continue;
                }
            }

            try {
                const imageUrl = await uploadImageToNote(imagePath);
                uploadedImages.set(fileName, imageUrl);
            } catch (e) {
                console.error(`❌ 画像アップロード失敗: ${fileName}`, e.message);
                continue;
            }
        }

        const imageUrl = uploadedImages.get(fileName);
        if (imageUrl) {
            const imageHtml = generateImageHtml(imageUrl, caption);
            html = html.replace(fullMatch, imageHtml);
        }
    }

    // 標準Markdown形式の画像も処理: ![alt](path)
    const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    html = html.replace(mdRegex, (fullMatch, alt, src) => {
        if (src.startsWith('http')) return fullMatch;
        
        const fileName = path.basename(src);
        if (uploadedImages.has(fileName)) {
            return generateImageHtml(uploadedImages.get(fileName), alt);
        }
        return fullMatch;
    });

    // 基本的なMarkdown→HTML変換
    // 見出し
    html = html.replace(/^### (.+)$/gm, (_, text) => `<h3 name="${randomUUID()}" id="${randomUUID()}">${text}</h3>`);
    html = html.replace(/^## (.+)$/gm, (_, text) => `<h2 name="${randomUUID()}" id="${randomUUID()}">${text}</h2>`);
    html = html.replace(/^# (.+)$/gm, (_, text) => `<h1 name="${randomUUID()}" id="${randomUUID()}">${text}</h1>`);

    // 段落
    html = html.split('\n\n').map(para => {
        if (para.startsWith('<')) return para; // 既にHTMLタグ
        if (para.trim() === '') return '';
        return `<p name="${randomUUID()}" id="${randomUUID()}">${para.trim()}</p>`;
    }).join('');

    return { html, uploadedImages };
}

/**
 * 下書きを作成して画像付き本文を保存
 */
async function createDraftWithImages(title, markdown, imageBasePath) {
    console.log('\n📝 画像付き下書きを作成\n');

    // Step 1: Markdownを画像付きHTMLに変換
    console.log('Step 1: Markdownを変換...');
    const { html, uploadedImages } = await convertMarkdownWithImages(markdown, imageBasePath);
    console.log(`  ✅ ${uploadedImages.size}件の画像をアップロード\n`);

    // Step 2: 下書きを作成
    console.log('Step 2: 下書きを作成...');
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
        throw new Error('下書き作成失敗');
    }

    const noteId = createData.data.id;
    const noteKey = createData.data.key;
    console.log(`  ✅ 下書き作成成功: ${noteKey}\n`);

    // Step 3: 画像付き本文を保存
    console.log('Step 3: 画像付き本文を保存...');
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
            body: html,
            body_length: html.length,
            name: title,
            index: false,
            is_lead_form: false
        })
    });

    const updateData = await updateResponse.json();
    console.log(`  ✅ 本文保存成功\n`);

    return {
        noteId,
        noteKey,
        editUrl: `https://editor.note.com/notes/${noteKey}/edit/`,
        uploadedImages: Array.from(uploadedImages.entries())
    };
}

// テスト実行
async function main() {
    const testMarkdown = `
# API画像挿入テスト

これはAPI経由で画像を挿入するテストです。

## テスト画像

以下に画像を挿入します：

![[test-image.png|テスト画像のキャプション]]

画像の後のテキストです。

## まとめ

API経由での画像挿入が成功しました！
`;

    const imageBasePath = path.join(__dirname, '..', 'test-articles', 'images');

    try {
        const result = await createDraftWithImages(
            'API画像挿入テスト',
            testMarkdown,
            imageBasePath
        );

        console.log('='.repeat(60));
        console.log('🎉 完了！');
        console.log('='.repeat(60));
        console.log(`編集URL: ${result.editUrl}`);
        console.log(`アップロードした画像: ${result.uploadedImages.length}件`);
        result.uploadedImages.forEach(([name, url]) => {
            console.log(`  - ${name}: ${url}`);
        });
    } catch (error) {
        console.error('❌ エラー:', error);
    }
}

main();
