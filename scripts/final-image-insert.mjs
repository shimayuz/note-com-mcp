#!/usr/bin/env node
/**
 * 本文中に画像を挿入する最終版スクリプト
 * 空行をクリック → 「+」ボタンをクリック → 「画像」メニューをクリック
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(projectRoot, '.env') });

const NOTE_EMAIL = process.env.NOTE_EMAIL;
const NOTE_PASSWORD = process.env.NOTE_PASSWORD;
const testImagePath = process.env.NOTE_TEST_IMAGE_PATH
    ? path.resolve(projectRoot, process.env.NOTE_TEST_IMAGE_PATH)
    : path.resolve(projectRoot, 'test-articles/images/test-image.png');

async function ensureEmailLoginForm(page, timeoutMs = 60000) {
    const emailSelectors = [
        "button:has-text('メールアドレスでログイン')",
        "button:has-text('メールアドレスでサインイン')",
        "button:has-text('メールでログイン')",
        "button:has-text('メール')",
        "button[data-testid='login-email-button']",
        "button[data-testid='mail-login-button']",
    ];

    const perSelectorTimeout = Math.max(Math.floor(timeoutMs / emailSelectors.length), 3000);

    for (const selector of emailSelectors) {
        const locator = page.locator(selector);
        try {
            await locator.waitFor({ state: 'visible', timeout: perSelectorTimeout });
            await locator.click();
            await page.waitForTimeout(1000);
            break;
        } catch {
            // ignore
        }
    }
}

async function main() {
    console.log('🚀 本文画像挿入（最終版）\n');

    const browser = await chromium.launch({
        headless: false,
        slowMo: 150
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: 'ja-JP'
    });

    const page = await context.newPage();
    page.setDefaultTimeout(60000);

    try {
        if (!NOTE_EMAIL || !NOTE_PASSWORD) {
            console.error('❌ .env に NOTE_EMAIL / NOTE_PASSWORD を設定してください');
            process.exitCode = 1;
            return;
        }

        if (!fs.existsSync(testImagePath)) {
            console.error(`❌ 画像ファイルが見つかりません: ${testImagePath}`);
            process.exitCode = 1;
            return;
        }

        // ログイン
        console.log('📝 ログイン中...');
        await page.goto('https://note.com/login', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        await ensureEmailLoginForm(page, 60000);

        const inputs = await page.$$('input:not([type="hidden"])');
        if (inputs.length >= 2) {
            await inputs[0].fill(NOTE_EMAIL);
            await inputs[1].fill(NOTE_PASSWORD);
        } else {
            const emailInput = page
                .locator(
                    "input[name='login'], input[name='login_id'], input[type='email'], input:not([type='hidden']):not([type='password'])",
                )
                .first();
            const passwordInput = page
                .locator("input[name='password'], input[type='password']")
                .first();

            await emailInput.waitFor({ state: 'visible', timeout: 10000 });
            await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
            await emailInput.fill(NOTE_EMAIL);
            await passwordInput.fill(NOTE_PASSWORD);
        }

        await page.click('button:has-text("ログイン")');
        await page.waitForURL((url) => !url.href.includes('/login'), { timeout: 30000 });
        console.log('✅ ログイン成功');

        // 新規記事作成
        console.log('\n📝 新規記事作成...');
        await page.goto('https://editor.note.com/new', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        // タイトル入力
        const titleArea = page.locator('textarea[placeholder*="タイトル"]');
        await titleArea.waitFor({ state: 'visible' });
        await titleArea.fill('本文画像挿入テスト');
        console.log('✅ タイトル入力');

        // 本文入力
        const bodyBox = page.locator('div[contenteditable="true"][role="textbox"]').first();
        await bodyBox.waitFor({ state: 'visible' });
        await bodyBox.click();
        await page.keyboard.type('画像の前のテキストです。');

        // Enter2回で新しいパラグラフを作成
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
        console.log('✅ 本文入力（空行作成）');

        await page.screenshot({ path: '/tmp/final-step1.png' });
        console.log('📸 /tmp/final-step1.png');

        // 空行の位置を取得（カーソル位置）
        // 本文エリアのboundingBoxを取得
        const bodyBoxHandle = await bodyBox.boundingBox();
        console.log(`   本文エリア: x=${bodyBoxHandle?.x}, y=${bodyBoxHandle?.y}`);

        // 「+」ボタンをクリック
        // 空行の左側にある「+」ボタンは、本文エリアの左端から約-50pxの位置
        console.log('\n🖼️ 「+」ボタンをクリック...');

        // 方法: 本文エリア内の全ボタンをスキャンし、本文の左側にあるものを探す
        const allBtns = await page.$$('button');
        let plusBtnClicked = false;

        for (const btn of allBtns) {
            const box = await btn.boundingBox();
            if (!box) continue;

            // 「+」ボタンの条件:
            // - x座標が本文エリアの左側（bodyBoxHandle.x - 100 ~ bodyBoxHandle.x）
            // - y座標が本文エリア内（bodyBoxHandle.y ~ bodyBoxHandle.y + 200）
            // - 幅が小さい（< 60px）
            if (bodyBoxHandle &&
                box.x > bodyBoxHandle.x - 100 &&
                box.x < bodyBoxHandle.x &&
                box.y > bodyBoxHandle.y &&
                box.y < bodyBoxHandle.y + 200 &&
                box.width < 60) {

                console.log(`   ✓ 「+」ボタン発見: x=${box.x}, y=${box.y}, w=${box.width}`);

                // ホバーしてからクリック
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                await page.waitForTimeout(300);
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                plusBtnClicked = true;
                console.log('✅ 「+」ボタンをクリック');
                await page.waitForTimeout(1500);
                break;
            }
        }

        if (!plusBtnClicked) {
            console.log('⚠️ 「+」ボタンが見つかりません。座標で直接クリックします...');
            // フォールバック: 本文エリアの左側を直接クリック
            if (bodyBoxHandle) {
                const plusX = bodyBoxHandle.x - 30;
                const plusY = bodyBoxHandle.y + 50;
                console.log(`   座標: x=${plusX}, y=${plusY}`);
                await page.mouse.click(plusX, plusY);
                await page.waitForTimeout(1500);
            }
        }

        await page.screenshot({ path: '/tmp/final-step2.png' });
        console.log('📸 /tmp/final-step2.png');

        // 「画像」メニューをクリック
        console.log('\n🖼️ 「画像」メニューをクリック...');
        let chooser = null;

        // メニュー内の「画像」項目を探す
        // ユーザーの画像から、メニューは「挿入」ヘッダーの下にリスト形式で表示
        // 「画像」はアイコン付きの2番目の項目
        try {
            // 方法1: role="menuitem"またはリスト項目で「画像」を探す
            const imageMenuItem = page.locator('[role="menuitem"]:has-text("画像"), [role="option"]:has-text("画像"), div:has-text("画像"):not(:has(*:has-text("画像")))').first();

            const isVisible = await imageMenuItem.isVisible().catch(() => false);
            if (isVisible) {
                console.log('   「画像」メニュー項目を発見');

                // filechooserイベントとクリックを同時に待機
                [chooser] = await Promise.all([
                    page.waitForEvent('filechooser', { timeout: 10000 }),
                    imageMenuItem.click(),
                ]);
                console.log('✅ 「画像」メニューをクリック');
            } else {
                // 方法2: テキスト「画像」を含む要素を直接クリック
                console.log('   方法2: テキストセレクターで探す');
                const imageText = page.getByText('画像', { exact: true });

                [chooser] = await Promise.all([
                    page.waitForEvent('filechooser', { timeout: 10000 }),
                    imageText.click(),
                ]);
                console.log('✅ 「画像」をクリック（テキスト）');
            }
        } catch (e) {
            console.log('⚠️ filechooserエラー:', e.message);

            await page.screenshot({ path: '/tmp/final-step2b.png' });
            console.log('📸 /tmp/final-step2b.png');
        }

        // ファイルを設定
        if (chooser) {
            console.log('📁 ファイル選択ダイアログが開きました');
            await chooser.setFiles(testImagePath);
            console.log('✅ ファイル設定完了');
            await page.waitForTimeout(3000);
        } else {
            console.log('⚠️ ファイル選択ダイアログが開きませんでした');
        }

        await page.screenshot({ path: '/tmp/final-step3.png' });
        console.log('📸 /tmp/final-step3.png');

        // トリミングダイアログの「保存」ボタン
        const dialog = page.locator('div[role="dialog"]');
        try {
            await dialog.waitFor({ state: 'visible', timeout: 5000 });
            console.log('   トリミングダイアログを検出');

            const saveBtn = dialog.locator('button:has-text("保存")').first();
            await saveBtn.waitFor({ state: 'visible', timeout: 5000 });
            await saveBtn.click();
            console.log('✅ トリミング保存');

            await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => { });
            await page.waitForTimeout(3000);
        } catch (e) {
            console.log('   トリミングダイアログなし');
        }

        await page.screenshot({ path: '/tmp/final-step4.png' });
        console.log('📸 /tmp/final-step4.png');

        // 画像の後にテキスト
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await page.keyboard.type('画像の後のテキストです。');

        // 下書き保存
        console.log('\n💾 下書き保存...');
        const saveBtn = page.locator('button:has-text("下書き保存")').first();
        await saveBtn.waitFor({ state: 'visible' });
        if (await saveBtn.isEnabled()) {
            await saveBtn.click();
            await page.waitForTimeout(3000);
            console.log('✅ 下書き保存完了');
        }

        await page.screenshot({ path: '/tmp/final-result.png' });
        console.log('📸 /tmp/final-result.png');

        console.log('\n🎉 完了！');

    } catch (error) {
        console.error('❌ エラー:', error.message);
        await page.screenshot({ path: '/tmp/final-error.png' });
    } finally {
        await page.waitForTimeout(3000);
        await browser.close();
    }
}

main();
