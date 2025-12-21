#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('🚀 Obsidian to note.com Publisher セットアップ\n');

// .envファイルの存在確認
const envPath = path.join(process.cwd(), '.env');
const envExamplePath = path.join(__dirname, '../.env.example');

if (!fs.existsSync(envPath)) {
    console.log('📝 .envファイルを作成します...');
    fs.copyFileSync(envExamplePath, envPath);
    console.log('✅ .envファイルを作成しました');
    console.log('⚠️  .envファイルに認証情報を設定してください:');
    console.log('   NOTE_EMAIL=your-email@example.com');
    console.log('   NOTE_PASSWORD=your-password\n');
} else {
    console.log('✅ .envファイルは既に存在します');
}

// Playwrightブラウザのインストール
console.log('🌐 Playwrightブラウザをインストールします...');
const install = spawn('npx', ['playwright', 'install', 'chromium', '--with-deps'], {
    stdio: 'inherit',
    shell: true
});

install.on('close', (code) => {
    if (code === 0) {
        console.log('\n🎉 セットアップが完了しました！');
        console.log('\n使い方:');
        console.log('  npx obsidian-to-note ./article.md');
        console.log('  npx obsidian-to-note ./article.md --headless');
    } else {
        console.error('\n❌ ブラウザのインストールに失敗しました');
        console.log('手動で実行: npx playwright install chromium --with-deps');
    }
});
