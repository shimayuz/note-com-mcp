/**
 * API経由で画像を含む本文を送信してサニタイズを検証
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const NOTE_SESSION_V5 = process.env.NOTE_SESSION_V5;
const NOTE_XSRF_TOKEN = process.env.NOTE_XSRF_TOKEN;

// 既存の画像URL（アップロード済み）
const TEST_IMAGE_URL = 'https://assets.st-note.com/img/1763370763-7sCI0OZTNXKPVc19Jl3rtDy5.png';

async function testImageInBody() {
    console.log('\n🧪 API経由での画像挿入テスト\n');

    // Step 1: 新規下書きを作成
    console.log('Step 1: 新規下書きを作成...');
    
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
            name: 'API画像挿入テスト',
            index: false,
            is_lead_form: false
        })
    });

    const createData = await createResponse.json();
    console.log('作成結果:', JSON.stringify(createData, null, 2));

    if (!createData.data?.id) {
        console.error('下書き作成に失敗');
        return;
    }

    const noteId = createData.data.id;
    const noteKey = createData.data.key;
    console.log(`✅ 下書き作成成功: ID=${noteId}, key=${noteKey}\n`);

    // Step 2: 様々な形式で画像を含む本文を送信してテスト
    const testCases = [
        {
            name: 'Test 1: シンプルな<img>タグ',
            body: `<p>テスト前</p><img src="${TEST_IMAGE_URL}" alt="test"><p>テスト後</p>`
        },
        {
            name: 'Test 2: <figure>で囲んだ<img>タグ',
            body: `<p>テスト前</p><figure name="${randomUUID()}" id="${randomUUID()}"><img src="${TEST_IMAGE_URL}" alt="" width="620" height="469"></figure><p>テスト後</p>`
        },
        {
            name: 'Test 3: <figure>+<figcaption>',
            body: `<p>テスト前</p><figure name="${randomUUID()}" id="${randomUUID()}"><img src="${TEST_IMAGE_URL}" alt="" width="620" height="469"><figcaption>キャプション</figcaption></figure><p>テスト後</p>`
        },
        {
            name: 'Test 4: 完全な形式（name/id付き）',
            body: `<p name="${randomUUID()}" id="${randomUUID()}">テスト前</p><figure name="${randomUUID()}" id="${randomUUID()}"><img src="${TEST_IMAGE_URL}" alt="" width="620" height="469"><figcaption></figcaption></figure><p name="${randomUUID()}" id="${randomUUID()}">テスト後</p>`
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📝 ${testCase.name}`);
        console.log('='.repeat(60));
        console.log('送信する本文:');
        console.log(testCase.body);

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
                body: testCase.body,
                body_length: testCase.body.length,
                name: 'API画像挿入テスト',
                index: false,
                is_lead_form: false
            })
        });

        const updateData = await updateResponse.json();
        
        // 保存後の本文を取得して確認
        const getResponse = await fetch(`https://note.com/api/v3/notes/${noteKey}?draft=true&draft_reedit=false&ts=${Date.now()}`, {
            method: 'GET',
            headers: {
                'Cookie': `_note_session_v5=${NOTE_SESSION_V5}; XSRF-TOKEN=${NOTE_XSRF_TOKEN}`,
                'X-XSRF-TOKEN': NOTE_XSRF_TOKEN,
                'Accept': 'application/json'
            }
        });

        const getData = await getResponse.json();
        const savedBody = getData.data?.body || getData.data?.noteDraft?.body || '';

        console.log('\n保存後の本文:');
        console.log(savedBody);

        // 画像が残っているか確認
        const hasImg = savedBody.includes('<img');
        const hasFigure = savedBody.includes('<figure');
        const hasImageUrl = savedBody.includes(TEST_IMAGE_URL);

        console.log('\n📊 結果:');
        console.log(`  <img>タグ: ${hasImg ? '✅ 残っている' : '❌ サニタイズされた'}`);
        console.log(`  <figure>タグ: ${hasFigure ? '✅ 残っている' : '❌ サニタイズされた'}`);
        console.log(`  画像URL: ${hasImageUrl ? '✅ 残っている' : '❌ サニタイズされた'}`);

        // 少し待機
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n\n🔗 編集URL: https://editor.note.com/notes/${noteKey}/edit/`);
}

testImageInBody().catch(console.error);
