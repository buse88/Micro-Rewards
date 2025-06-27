#!/bin/bash

# Microsoft Rewards Script 全自动一键部署脚本（简化版）
# 适用于 Debian 系统，使用wget下载zip文件
# 版本: v1.3.2 (2025-06-22)

set -e

# 版本信息
VERSION="v1.3.2"
BUILD_DATE="2025-06-22"
SCRIPT_NAME="auto_deploy_simple.sh"

echo ""
echo "=========================================="
echo "🚀 Microsoft Rewards Script 一键部署脚本"
echo "=========================================="
echo "📋 版本: $VERSION"
echo "📅 构建日期: $BUILD_DATE"
echo "📝 脚本名称: $SCRIPT_NAME"
echo "=========================================="
echo ""

REPO_URL="https://github.com/buse88/Microsoft-Rewards-Script/archive/refs/heads/CN.zip"
DEPLOY_DIR="/opt/microsoft-rewards"

echo "[INFO] 开始全自动部署..."

# 1. 检查并安装必要工具
if ! command -v wget &> /dev/null; then
    echo "[INFO] 安装wget..."
    apt-get update && apt-get install -y wget unzip
fi

# 2. 检查并安装Docker
if ! command -v docker &> /dev/null; then
    echo "[INFO] 安装Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
    usermod -aG docker $USER
    rm get-docker.sh
    echo "[INFO] Docker安装完成，请重新登录后再次运行此脚本"
    exit 1
fi

# 3. 检查并安装Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "[INFO] 安装Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# 4. 检查现有镜像
echo "[INFO] 检查现有Docker镜像..."
if docker images | grep -q "microsoft-rewards"; then
    echo "[INFO] 发现现有镜像，将使用现有镜像启动服务"
    USE_EXISTING_IMAGE=true
else
    echo "[INFO] 未发现现有镜像，将下载并构建新镜像"
    USE_EXISTING_IMAGE=false
fi

# 5. 下载并解压项目（仅当需要构建新镜像时）
if [ "$USE_EXISTING_IMAGE" = false ]; then
    echo "[INFO] 下载项目文件..."
    rm -rf $DEPLOY_DIR
    mkdir -p $DEPLOY_DIR
    cd /tmp
    wget -O microsoft-rewards.zip $REPO_URL
    unzip -q microsoft-rewards.zip
    cp -r Microsoft-Rewards-Script-CN/* $DEPLOY_DIR/
    rm -rf Microsoft-Rewards-Script-CN microsoft-rewards.zip
    cd $DEPLOY_DIR
else
    echo "[INFO] 使用现有镜像，跳过下载项目文件"
    mkdir -p $DEPLOY_DIR
    cd $DEPLOY_DIR
fi

# 6. 创建src目录
mkdir -p src
mkdir -p src/browser/sessions

# 修正config.json和accounts.json为文件，防止误为目录
if [ -d "src/config.json" ]; then
    rm -rf src/config.json
fi
if [ ! -f "src/config.json" ]; then
    touch src/config.json
fi
if [ -d "src/accounts.json" ]; then
    rm -rf src/accounts.json
fi
if [ ! -f "src/accounts.json" ]; then
    touch src/accounts.json
fi

# 7. 生成accounts.json
if [ ! -f "src/accounts.json" ]; then
    cat > src/accounts.json << 'EOF'
[
  {
    "email": "your-email@example.com",
    "password": "your-password",
    "proxy": {
      "proxyAxios": true,
      "url": "",
      "port": 0,
      "username": "",
      "password": ""
    }
  }
]
EOF
    echo "[INFO] 已生成 accounts.json，请稍后编辑账户信息。"
else
    echo "[INFO] accounts.json 已存在，跳过生成。"
fi

# 8. 检查config.json，如果不存在则使用仓库中的默认配置
if [ ! -f "src/config.json" ]; then
    echo "[INFO] src/config.json 不存在，将使用仓库中的默认配置。"
else
    echo "[INFO] src/config.json 已存在，配置将保持不变。"
fi

# 9. 生成docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  microsoft-rewards-script:
    image: microsoft-rewards-microsoft-rewards-script:latest
    container_name: microsoft-rewards-script
    restart: "no"
    volumes:
      - ./src/accounts.json:/usr/src/microsoft-rewards-script/dist/accounts.json
      - ./src/config.json:/usr/src/microsoft-rewards-script/dist/config.json
      - ./src/browser/sessions:/usr/src/microsoft-rewards-script/dist/browser/sessions
    environment:
      - NODE_ENV=production
      - TZ=Asia/Shanghai
      - CRON_SCHEDULE=0 13 * * *
      - RUN_ON_START=true
EOF

# 10. 启动服务
echo "[INFO] 启动服务..."
if [ "$USE_EXISTING_IMAGE" = true ]; then
    echo "[INFO] 使用现有镜像启动服务..."
    docker-compose up -d
else
    echo "[INFO] 构建并启动服务..."
    docker-compose build --no-cache
    docker-compose up -d
fi

echo ""
echo "=== 部署完成 ==="
echo ""
echo "1. 如需添加/修改账户，请编辑: $DEPLOY_DIR/src/accounts.json"
echo "2. 查看日志: cd $DEPLOY_DIR && docker-compose logs -f"
echo "3. 管理命令: cd $DEPLOY_DIR && docker-compose [up|down|restart|logs]"
echo ""
echo "如首次运行请务必编辑accounts.json，添加你的Microsoft账户信息！"
echo "" 