/**
 * noteの記事本文の内部形式を分析するスクリプト
 * 画像を含む記事のbody形式を確認する
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const NOTE_SESSION_V5 = process.env.NOTE_SESSION_V5;
const NOTE_XSRF_TOKEN = process.env.NOTE_XSRF_TOKEN;

async function analyzeNoteBody(noteId) {
    console.log(`\n📝 記事 ${noteId} の本文形式を分析...\n`);

    const url = `https://note.com/api/v3/notes/${noteId}?draft=true&draft_reedit=false&ts=${Date.now()}`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Cookie': `_note_session_v5=${NOTE_SESSION_V5}; XSRF-TOKEN=${NOTE_XSRF_TOKEN}`,
            'X-XSRF-TOKEN': NOTE_XSRF_TOKEN,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
    });

    if (!response.ok) {
        console.error(`エラー: ${response.status} ${response.statusText}`);
        return;
    }

    const data = await response.json();
    const note = data.data;

    console.log('='.repeat(60));
    console.log('📋 記事情報');
    console.log('='.repeat(60));
    console.log(`タイトル: ${note.name}`);
    console.log(`ID: ${note.id}`);
    console.log(`Key: ${note.key}`);
    console.log(`Format: ${note.format}`);
    console.log(`Status: ${note.status}`);

    console.log('\n' + '='.repeat(60));
    console.log('📄 本文 (body) の形式');
    console.log('='.repeat(60));
    console.log(note.body);

    // 画像関連の要素を抽出
    console.log('\n' + '='.repeat(60));
    console.log('🖼️ 画像関連の要素');
    console.log('='.repeat(60));

    // <figure> タグを探す
    const figureMatches = note.body?.match(/<figure[^>]*>[\s\S]*?<\/figure>/g) || [];
    console.log(`\n<figure> タグ: ${figureMatches.length}件`);
    figureMatches.forEach((match, i) => {
        console.log(`\n--- Figure ${i + 1} ---`);
        console.log(match);
    });

    // <img> タグを探す
    const imgMatches = note.body?.match(/<img[^>]*>/g) || [];
    console.log(`\n<img> タグ: ${imgMatches.length}件`);
    imgMatches.forEach((match, i) => {
        console.log(`\n--- Image ${i + 1} ---`);
        console.log(match);
    });

    // data-* 属性を探す
    const dataAttrMatches = note.body?.match(/data-[a-z-]+="[^"]*"/g) || [];
    console.log(`\ndata-* 属性: ${dataAttrMatches.length}件`);
    [...new Set(dataAttrMatches)].forEach((match, i) => {
        console.log(`  ${match}`);
    });

    // noteの下書き情報も確認
    if (note.noteDraft) {
        console.log('\n' + '='.repeat(60));
        console.log('📝 下書き (noteDraft) の形式');
        console.log('='.repeat(60));
        console.log(note.noteDraft.body);
    }

    // eyecatch情報
    console.log('\n' + '='.repeat(60));
    console.log('🎨 アイキャッチ情報');
    console.log('='.repeat(60));
    console.log(`eyecatch: ${note.eyecatch || '(なし)'}`);
    console.log(`eyecatchUrl: ${note.eyecatchUrl || '(なし)'}`);

    return note;
}

// 引数から記事IDを取得
const noteId = process.argv[2];

if (!noteId) {
    console.log('使い方: node scripts/analyze-note-body.mjs <noteId>');
    console.log('例: node scripts/analyze-note-body.mjs n4f0c7b884789');
    process.exit(1);
}

analyzeNoteBody(noteId);
