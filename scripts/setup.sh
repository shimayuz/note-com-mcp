#!/bin/bash
# ============================================
# note MCP Server 自動セットアップスクリプト
# ============================================
# 使い方: ./scripts/setup.sh
# ============================================

set -e

# 色付き出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ログ関数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ヘッダー表示
echo ""
echo "◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢"
echo "  note MCP Server セットアップ"
echo "◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢"
echo ""

# ============================================
# ステップ 1: 環境確認
# ============================================
log_info "ステップ 1/7: 環境確認"

# Node.js 確認
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    log_success "Node.js: $NODE_VERSION"
    
    # バージョンチェック (v18以上)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | tr -d 'v')
    if [ "$NODE_MAJOR" -lt 18 ]; then
        log_error "Node.js v18以上が必要です"
        exit 1
    fi
else
    log_error "Node.js がインストールされていません"
    echo ""
    echo "インストール方法:"
    echo "  Mac: brew install node"
    echo "  Windows: https://nodejs.org/ からダウンロード"
    exit 1
fi

# npm 確認
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    log_success "npm: $NPM_VERSION"
else
    log_error "npm がインストールされていません"
    exit 1
fi

# Git 確認
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version)
    log_success "Git: $GIT_VERSION"
else
    log_warning "Git がインストールされていません（オプション）"
fi

echo ""

# ============================================
# ステップ 2: npm install
# ============================================
log_info "ステップ 2/7: npm パッケージインストール"

if [ -d "node_modules" ]; then
    log_info "node_modules が既に存在します。スキップ..."
else
    npm install
fi

log_success "npm パッケージインストール完了"
echo ""

# ============================================
# ステップ 3: Playwright インストール
# ============================================
log_info "ステップ 3/7: Playwright ブラウザインストール"

npx playwright install

# Linux の場合は依存ライブラリもインストール
if [ "$(uname -s)" = "Linux" ]; then
    log_info "Linux 依存ライブラリをインストール中..."
    npx playwright install-deps || log_warning "依存ライブラリのインストールに失敗（sudo が必要な場合があります）"
fi

log_success "Playwright インストール完了"
echo ""

# ============================================
# ステップ 4: ビルド
# ============================================
log_info "ステップ 4/7: TypeScript ビルド"

npm run build

if [ -f "build/note-mcp-server.js" ]; then
    log_success "ビルド完了"
else
    log_error "ビルドに失敗しました"
    exit 1
fi

echo ""

# ============================================
# ステップ 5: .env ファイル作成
# ============================================
log_info "ステップ 5/7: 環境変数設定"

if [ -f ".env" ]; then
    log_info ".env ファイルが既に存在します"
else
    if [ -f ".env.sample" ]; then
        cp .env.sample .env
        log_success ".env ファイルを作成しました（.env.sample からコピー）"
        log_warning "認証情報を .env ファイルに設定するか、サーバー起動時にブラウザログインしてください"
    else
        touch .env
        log_success "空の .env ファイルを作成しました"
        log_warning "サーバー起動時にブラウザが開き、手動ログインが必要です"
    fi
fi

echo ""

# ============================================
# ステップ 6: MCP 設定ファイル作成
# ============================================
log_info "ステップ 6/7: MCP クライアント設定"

PROJECT_PATH=$(pwd)
OS_TYPE=$(uname -s)

case "$OS_TYPE" in
    Darwin)
        # macOS
        MCP_CONFIG_DIR="$HOME/.cursor"
        MCP_CONFIG_FILE="$MCP_CONFIG_DIR/mcp.json"
        ;;
    Linux)
        # Linux
        MCP_CONFIG_DIR="$HOME/.cursor"
        MCP_CONFIG_FILE="$MCP_CONFIG_DIR/mcp.json"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        # Windows (Git Bash)
        MCP_CONFIG_DIR="$USERPROFILE/.cursor"
        MCP_CONFIG_FILE="$MCP_CONFIG_DIR/mcp.json"
        ;;
    *)
        log_warning "不明なOS: $OS_TYPE"
        MCP_CONFIG_DIR="$HOME/.cursor"
        MCP_CONFIG_FILE="$MCP_CONFIG_DIR/mcp.json"
        ;;
esac

# ディレクトリ作成
mkdir -p "$MCP_CONFIG_DIR"

# 既存の設定をバックアップ
if [ -f "$MCP_CONFIG_FILE" ]; then
    log_info "既存の MCP 設定をバックアップ中..."
    cp "$MCP_CONFIG_FILE" "$MCP_CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
fi

# MCP 設定ファイル作成
cat > "$MCP_CONFIG_FILE" << EOF
{
  "mcpServers": {
    "note-api": {
      "command": "node",
      "args": ["$PROJECT_PATH/build/note-mcp-server.js"],
      "env": {}
    }
  }
}
EOF

log_success "MCP 設定ファイルを作成しました: $MCP_CONFIG_FILE"
echo ""

# ============================================
# ステップ 7: 完了確認
# ============================================
log_info "ステップ 7/7: セットアップ完了確認"

echo ""
echo "◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢"
echo ""
echo "✅ セットアップが完了しました！"
echo ""
echo "📦 インストール済み:"
echo "   - npm パッケージ"
echo "   - Playwright ブラウザ"
echo ""
echo "🔨 ビルド済み:"
echo "   - build/note-mcp-server.js"
echo ""
echo "⚙️ MCP設定:"
echo "   - $MCP_CONFIG_FILE"
echo ""
echo "🚀 次のステップ:"
echo "   1. Cursor を再起動してください"
echo "   2. 「noteで記事を検索して」と試してみてください"
echo ""
echo "💡 認証設定:"
echo "   サーバー起動時にブラウザが開くので、"
echo "   note.com にログインしてください。"
echo ""
echo "📝 手動起動コマンド:"
echo "   npm run start"
echo ""
echo "◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢◤◢"
echo ""
