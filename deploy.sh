#!/bin/bash

# Microsoft Rewards Script 部署脚本
# 适用于已有项目文件的部署
# 版本: v1.2.5 (2025-06-22)

set -e

# 版本信息
VERSION="v1.2.5"
BUILD_DATE="2025-06-22"
SCRIPT_NAME="deploy.sh"

echo ""
echo "=========================================="
echo "🚀 Microsoft Rewards Script 部署脚本"
echo "=========================================="
echo "📋 版本: $VERSION"
echo "📅 构建日期: $BUILD_DATE"
echo "📝 脚本名称: $SCRIPT_NAME"
echo "=========================================="
echo ""

# 检查是否在项目根目录
if [ ! -f "package.json" ]; then
    echo "[ERROR] 请在项目根目录运行此脚本"
    exit 1
fi 