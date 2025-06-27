# Use an official Node.js runtime as a base image
FROM node:18

# 版本信息
LABEL version="v1.3.2"
LABEL description="Microsoft Rewards Script with domestic sources"

# Set the working directory in the container
WORKDIR /usr/src/microsoft-rewards-script

# 设置Playwright浏览器下载镜像源（加速下载）
ENV PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/
ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0

# 全面替换apt源为阿里云镜像（处理所有可能的官方源文件）
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true && \
    sed -i 's|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true && \
    sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null || true && \
    sed -i 's|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null || true && \
    find /etc/apt/sources.list.d/ -name "*.list" -exec sed -i \
        -e 's|deb.debian.org|mirrors.aliyun.com|g' \
        -e 's|security.debian.org|mirrors.aliyun.com|g' {} + 2>/dev/null || true

# 安装依赖
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# 复制package.json和package-lock.json
COPY package*.json ./

# 配置npm使用淘宝源
RUN npm config set registry https://registry.npmmirror.com/ && \
    npm install

# 安装Playwright浏览器（使用国内镜像源）
RUN PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/ npx playwright install chromium

# 复制源代码
COPY . .

# 构建项目
RUN npm run build

# 启动命令
CMD ["npm", "start"]