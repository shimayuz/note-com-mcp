import { App, Plugin, PluginSettingTab, Setting, Notice, TFile } from 'obsidian';
import { spawn } from 'child_process';

interface NotePublisherSettings {
    cliPath: string;
    defaultHeadless: boolean;
    envPath: string;
}

const DEFAULT_SETTINGS: NotePublisherSettings = {
    cliPath: 'npx obsidian-to-note',
    defaultHeadless: true,
    envPath: ''
}

export default class NotePublisherPlugin extends Plugin {
    settings: NotePublisherSettings;

    async onload() {
        await this.loadSettings();

        // コマンドを登録
        this.addCommand({
            id: 'publish-to-note',
            name: 'noteに公開',
            editorCallback: (editor, view) => {
                this.publishCurrentFile();
            }
        });

        // リボンにアイコンを追加
        this.addRibbonIcon('send', 'noteに公開', (evt: MouseEvent) => {
            this.publishCurrentFile();
        });

        // 設定タブを追加
        this.addSettingTab(new NotePublisherSettingTab(this.app, this));
    }

    onunload() {
        // クリーンアップ処理
    }

    async publishCurrentFile() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('ファイルが開かれていません');
            return;
        }

        // マークダウンファイルのみを対象
        if (activeFile.extension !== 'md') {
            new Notice('マークダウンファイルのみ公開できます');
            return;
        }

        // ファイルパスを取得（Vaultからの相対パス）
        const filePath = activeFile.path;
        const vaultPath = (this.app.vault.adapter as any).basePath;
        const fullPath = `${vaultPath}/${filePath}`;

        // 実行コマンドを構築
        const args = [fullPath];
        if (this.settings.defaultHeadless) {
            args.push('--headless');
        }
        if (this.settings.envPath) {
            args.push('--env', this.settings.envPath);
        }

        // 進捗表示
        const progressNotice = new Notice('noteに公開中...', 0);

        try {
            // CLIをspawnで実行
            const child = spawn(this.settings.cliPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true,
                cwd: process.cwd()
            });

            let stdout = '';
            let stderr = '';

            // ストリームを監視
            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            // 終了を待機
            await new Promise<void>((resolve, reject) => {
                child.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`CLI exited with code ${code}`));
                    }
                });

                child.on('error', (error) => {
                    reject(error);
                });
            });

            progressNotice.hide();

            if (stderr && stderr.includes('エラー')) {
                new Notice('公開に失敗しました：' + stderr.trim());
                console.error('Note Publisher Error:', stderr);
            } else {
                new Notice('下書きを保存しました！');
                console.log('Note Publisher Output:', stdout);
            }
        } catch (error) {
            progressNotice.hide();
            new Notice('公開に失敗しました：' + error.message);
            console.error('Note Publisher Error:', error);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class NotePublisherSettingTab extends PluginSettingTab {
    plugin: NotePublisherPlugin;

    constructor(app: App, plugin: NotePublisherPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Obsidian to note Publisher 設定' });

        new Setting(containerEl)
            .setName('CLIコマンド')
            .setDesc('実行するCLIコマンド（デフォルト: npx obsidian-to-note）')
            .addText(text => text
                .setPlaceholder('npx obsidian-to-note')
                .setValue(this.plugin.settings.cliPath)
                .onChange(async (value) => {
                    this.plugin.settings.cliPath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('ヘッドレスモード')
            .setDesc('ブラウザを非表示で実行する')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.defaultHeadless)
                .onChange(async (value) => {
                    this.plugin.settings.defaultHeadless = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('.envファイルのパス')
            .setDesc('認証情報が記載された.envファイルのパス（空の場合はカレントディレクトリ）')
            .addText(text => text
                .setPlaceholder('/path/to/.env')
                .setValue(this.plugin.settings.envPath)
                .onChange(async (value) => {
                    this.plugin.settings.envPath = value;
                    await this.plugin.saveSettings();
                }));

        // 説明を追加
        containerEl.createEl('h3', { text: 'セットアップ' });

        const setupDiv = containerEl.createDiv();
        setupDiv.innerHTML = `
			<p>このプラグインを使用するには、あらかじめCLIツールをインストールする必要があります。</p>
			<pre><code># npmでグローバルインストール
npm install -g obsidian-to-note-publisher

# またはローカルインストール
npm install obsidian-to-note-publisher</code></pre>
			<p>詳細は <a href="https://github.com/shimayuz/obsidian-to-note-publisher">GitHubリポジトリ</a> をご確認ください。</p>
		`;
    }
}
