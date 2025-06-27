#!/bin/bash

# Microsoft Rewards Script 管理脚本
# 用于管理Docker容器的启动、停止、重启等操作
# 版本: v1.2.5 (2025-06-22)

# 版本信息
VERSION="v1.2.5"
BUILD_DATE="2025-06-22"
SCRIPT_NAME="manage.sh"

show_version() {
    echo ""
    echo "=========================================="
    echo "🚀 Microsoft Rewards Script 管理脚本"
    echo "=========================================="
    echo "📋 版本: $VERSION"
    echo "📅 构建日期: $BUILD_DATE"
    echo "📝 脚本名称: $SCRIPT_NAME"
    echo "=========================================="
    echo ""
}

# 显示帮助信息
show_help() {
    show_version
    echo "使用方法: $0 [命令]"
    echo ""
    echo "可用命令:"
    echo "  start     启动服务"
    echo "  stop      停止服务"
    echo "  restart   重启服务"
    echo "  status    查看服务状态"
    echo "  logs      查看日志"
    echo "  update    更新代码并重启"
    echo "  version   显示版本信息"
    echo "  help      显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 start"
    echo "  $0 logs"
    echo "  $0 version"
}

# 检查Docker是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo "[ERROR] Docker 未安装，请先安装 Docker"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        echo "[ERROR] Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
}

# 检查项目目录
check_project() {
    if [ ! -f "docker-compose.yml" ]; then
        echo "[ERROR] 未找到 docker-compose.yml 文件，请在项目根目录运行"
        exit 1
    fi
}

# 启动服务
start_service() {
    echo "[INFO] 启动 Microsoft Rewards Script 服务..."
    docker-compose up -d
    echo "[SUCCESS] 服务启动完成"
}

# 停止服务
stop_service() {
    echo "[INFO] 停止 Microsoft Rewards Script 服务..."
    docker-compose down
    echo "[SUCCESS] 服务停止完成"
}

# 重启服务
restart_service() {
    echo "[INFO] 重启 Microsoft Rewards Script 服务..."
    docker-compose restart
    echo "[SUCCESS] 服务重启完成"
}

# 查看服务状态
show_status() {
    echo "[INFO] 查看服务状态..."
    docker-compose ps
}

# 查看日志
show_logs() {
    echo "[INFO] 查看服务日志..."
    docker-compose logs -f
}

# 更新代码并重启
update_service() {
    echo "[INFO] 更新代码并重启服务..."
    git pull
    docker-compose down
    docker-compose build --no-cache
    docker-compose up -d
    echo "[SUCCESS] 更新完成"
}

# 主函数
main() {
    # 检查Docker
    check_docker
    
    # 检查项目
    check_project
    
    # 处理命令
    case "$1" in
        start)
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            restart_service
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        update)
            update_service
            ;;
        version)
            show_version
            ;;
        help|--help|-h)
            show_help
            ;;
        "")
            show_help
            ;;
        *)
            echo "[ERROR] 未知命令: $1"
            echo "使用 '$0 help' 查看可用命令"
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@" 