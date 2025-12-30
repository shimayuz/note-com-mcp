# ============================================
# note MCP Server 自動セットアップスクリプト (Windows)
# ============================================
# 使い方: .\scripts\setup.ps1
# ============================================

$ErrorActionPreference = "Stop"

# 色付き出力関数
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] " -ForegroundColor Blue -NoNewline
    Write-Host $Message
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] " -ForegroundColor Green -NoNewline
    Write-Host $Message
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] " -ForegroundColor Red -NoNewline
    Write-Host $Message
}

# ヘッダー表示
Write-Host ""
Write-Host "◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢"
Write-Host "  note MCP Server セットアップ"
Write-Host "◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢"
Write-Host ""

# ============================================
# ステップ 1: 環境確認
# ============================================
Write-Info "ステップ 1/7: 環境確認"

# Node.js 確認
try {
    $nodeVersion = node --version
    Write-Success "Node.js: $nodeVersion"
    
    # バージョンチェック (v18以上)
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($nodeMajor -lt 18) {
        Write-Error "Node.js v18以上が必要です"
        exit 1
    }
} catch {
    Write-Error "Node.js がインストールされていません"
    Write-Host ""
    Write-Host "インストール方法:"
    Write-Host "  https://nodejs.org/ からダウンロードしてインストール"
    exit 1
}

# npm 確認
try {
    $npmVersion = npm --version
    Write-Success "npm: $npmVersion"
} catch {
    Write-Error "npm がインストールされていません"
    exit 1
}

# Git 確認
try {
    $gitVersion = git --version
    Write-Success "Git: $gitVersion"
} catch {
    Write-Warning "Git がインストールされていません（オプション）"
}

Write-Host ""

# ============================================
# ステップ 2: npm install
# ============================================
Write-Info "ステップ 2/7: npm パッケージインストール"

if (Test-Path "node_modules") {
    Write-Info "node_modules が既に存在します。スキップ..."
} else {
    npm install
}

Write-Success "npm パッケージインストール完了"
Write-Host ""

# ============================================
# ステップ 3: Playwright インストール
# ============================================
Write-Info "ステップ 3/7: Playwright ブラウザインストール"

npx playwright install

Write-Success "Playwright インストール完了"
Write-Host ""

# ============================================
# ステップ 4: ビルド
# ============================================
Write-Info "ステップ 4/7: TypeScript ビルド"

npm run build

if (Test-Path "build\note-mcp-server.js") {
    Write-Success "ビルド完了"
} else {
    Write-Error "ビルドに失敗しました"
    exit 1
}

Write-Host ""

# ============================================
# ステップ 5: .env ファイル作成
# ============================================
Write-Info "ステップ 5/7: 環境変数設定"

if (Test-Path ".env") {
    Write-Info ".env ファイルが既に存在します"
} else {
    if (Test-Path ".env.sample") {
        Copy-Item ".env.sample" ".env"
        Write-Success ".env ファイルを作成しました（.env.sample からコピー）"
        Write-Warning "認証情報を .env ファイルに設定するか、サーバー起動時にブラウザログインしてください"
    } else {
        New-Item -Path ".env" -ItemType File -Force | Out-Null
        Write-Success "空の .env ファイルを作成しました"
        Write-Warning "サーバー起動時にブラウザが開き、手動ログインが必要です"
    }
}

Write-Host ""

# ============================================
# ステップ 6: MCP 設定ファイル作成
# ============================================
Write-Info "ステップ 6/7: MCP クライアント設定"

$projectPath = (Get-Location).Path
$mcpConfigDir = "$env:USERPROFILE\.cursor"
$mcpConfigFile = "$mcpConfigDir\mcp.json"

# ディレクトリ作成
if (-not (Test-Path $mcpConfigDir)) {
    New-Item -Path $mcpConfigDir -ItemType Directory -Force | Out-Null
}

# 既存の設定をバックアップ
if (Test-Path $mcpConfigFile) {
    Write-Info "既存の MCP 設定をバックアップ中..."
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    Copy-Item $mcpConfigFile "$mcpConfigFile.backup.$timestamp"
}

# パスをエスケープ（バックスラッシュをダブルに）
$escapedPath = $projectPath -replace '\\', '\\\\'

# MCP 設定ファイル作成
$mcpConfig = @"
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": ["$escapedPath\\\\build\\\\note-mcp-server.js"],
      "env": {}
    }
  }
}
"@

$mcpConfig | Out-File -FilePath $mcpConfigFile -Encoding utf8

Write-Success "MCP 設定ファイルを作成しました: $mcpConfigFile"
Write-Host ""

# ============================================
# ステップ 7: 完了確認
# ============================================
Write-Info "ステップ 7/7: セットアップ完了確認"

Write-Host ""
Write-Host "◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢"
Write-Host ""
Write-Host "✅ セットアップが完了しました！"
Write-Host ""
Write-Host "📦 インストール済み:"
Write-Host "   - npm パッケージ"
Write-Host "   - Playwright ブラウザ"
Write-Host ""
Write-Host "🔨 ビルド済み:"
Write-Host "   - build\note-mcp-server.js"
Write-Host ""
Write-Host "⚙️ MCP設定:"
Write-Host "   - $mcpConfigFile"
Write-Host ""
Write-Host "🚀 次のステップ:"
Write-Host "   1. Cursor を再起動してください"
Write-Host "   2. 「noteで記事を検索して」と試してみてください"
Write-Host ""
Write-Host "💡 認証設定:"
Write-Host "   サーバー起動時にブラウザが開くので、"
Write-Host "   note.com にログインしてください。"
Write-Host ""
Write-Host "📝 手動起動コマンド:"
Write-Host "   npm run start"
Write-Host ""
Write-Host "◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢"
Write-Host ""
