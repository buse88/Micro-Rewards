# Microsoft Rewards Script - 国内优化版

这是一个基于原项目 [TheNetsky/Microsoft-Rewards-Script](https://github.com/TheNetsky/Microsoft-Rewards-Script) 的优化版本，专门针对国内用户进行了改进。

## 🚀 主要改进

### 1. 国内热点API集成
- ✅ **替换谷歌接口** - 使用国内可用的热点API
- ✅ **多源备份** - 集成多个国内热点数据源
- ✅ **智能缓存** - 避免重复请求，提高效率
- ✅ **容错机制** - 单个API失败时自动切换

### 2. Docker一键部署
- ✅ **简化部署** - 一键脚本，自动配置
- ✅ **国内源优化** - 阿里云apt源、淘宝npm源
- ✅ **会话保存** - 浏览器会话持久化
- ✅ **定时任务** - 支持cron定时执行

### 3. 配置优化
- ✅ **国内时区** - 默认Asia/Shanghai时区
- ✅ **合理间隔** - 搜索间隔40秒-2分钟，避免检测
- ✅ **会话保存** - 浏览器会话持久化
- ✅ **日志管理** - 完善的日志记录

### 4. 通知功能
- ✅ **Discord通知** - 支持Discord Webhook
- ✅ **Telegram通知** - 支持Telegram Bot通知
- ✅ **国内网络优化** - 支持Telegram API代理

## 🆚 与原作者代码的主要区别

本项目基于 [TheNetsky/Microsoft-Rewards-Script](https://github.com/TheNetsky/Microsoft-Rewards-Script) 二次开发，针对国内用户和自动化需求做了大量优化，主要区别如下：

- **国内环境优化**：集成国内可用热点API，支持国内网络环境，默认Asia/Shanghai时区，适配国内部署。
- **积分报告增强**：积分统计方式与原作者一致（dashboard+阅读API），但报告内容更详细，支持进度条、每日任务集明细、邮箱脱敏等。
- **通知系统升级**：支持Telegram/Discord通知，TG推送内容更丰富，支持代理，支持只推送积分报告。
- **只获取积分模式**：可配置`onlyReport`，仅获取积分信息并推送TG，不执行任何任务。
- **配置与类型定义补全**：所有配置项、类型定义、主流程判断更完善，兼容多账户、并发、超时、重试等。
- **日志与调试增强**：日志支持多语言，调试信息更丰富，便于排查问题。
- **兼容性与易用性**：支持Docker一键部署，国内源优化，自动会话保存，支持多账户批量处理。
- **代码结构优化**：主流程、通知、积分统计、任务执行等模块化更清晰，便于维护和二次开发。

> 适合国内用户、自动化批量积分、需要详细TG报告和高可用部署场景。

### 直观表格对比

| 功能/特性         | 原作者脚本                  | 国内优化版                          |
|------------------|----------------------------|-------------------------------------|
| 国内网络支持     | 不友好                     | 全面适配国内网络/代理               |
| 积分统计         | dashboard+API              | dashboard+API（同源）               |
| TG通知           | 不支持                     | 支持（内容丰富/代理）               |
| Discord通知      | 不支持                     | 支持                                |
| 积分报告         | 基础明细                   | 详细进度条/明细/脱敏                |
| 只获取积分模式   | 不支持                     | 支持（onlyReport）                  |
| 多账户/并发      | 基础支持                   | 更完善/高可用                       |
| 日志/调试        | 基础                       | 多语言/详细/易排查                  |
| 易用性           | 一般                       | Docker/批量/自动会话/国内源         |
| 代码结构         | 一般                       | 模块化/易维护                       |

## 📦 快速开始

### 🎯 推荐方案

#### 一键部署（推荐）
```bash
# 一键部署，简单可靠
wget https://raw.githubusercontent.com/buse88/Micro-Rewards/refs/heads/main/auto_deploy_simple.sh
 && chmod +x auto_deploy_simple.sh && ./auto_deploy_simple.sh
```
你可以直接使用如下命令一键全自动部署，无需手动下载脚本：

```bash
bash <(wget -qO- https://raw.githubusercontent.com/buse88/Micro-Rewards/refs/heads/main/auto_deploy_simple.sh)
```

如未安装wget，也可以使用curl方式：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/buse88/Micro-Rewards/refs/heads/main/auto_deploy_simple.sh)
```

上述命令会自动下载安装、配置并启动服务，适合新手和快速部署场景。

> 注意：如果遇到 `bash: /dev/fd/64: No such file or directory`，说明你的系统不支持 bash 进程替换。请先用 wget 或 curl 下载脚本到本地，再手动 bash 运行。

示例：
```bash
wget -O auto_deploy_simple.sh https://raw.githubusercontent.com/buse88/Micro-Rewards/refs/heads/main/auto_deploy_simple.sh
chmod +x auto_deploy_simple.sh
bash auto_deploy_simple.sh
```
或
```bash
curl -fsSL -o auto_deploy_simple.sh https://raw.githubusercontent.com/buse88/Micro-Rewards/refs/heads/main/auto_deploy_simple.sh
chmod +x auto_deploy_simple.sh
bash auto_deploy_simple.sh
```

#### 手动部署
```bash
# 1. 克隆项目
git clone https://github.com/buse88/Micro-Rewards.git
cd Micro-Rewards

# 2. 配置账户信息
cp src/accounts.example.json src/accounts.json
# 编辑 src/accounts.json，添加你的Microsoft账户

# 3. 构建并运行
docker-compose up -d --build
```

## 📋 配置与功能说明（整合版）

### 1. 账户配置（accounts.json）
```json
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
```
- `email`：Microsoft账户邮箱
- `password`：Microsoft账户密码
- `proxy`：代理配置（可选）

### 2. 主配置文件（config.json）
（基础配置、指纹、任务、搜索、API、代理等，保留原有详细说明）

#### 2.1 通知与Webhook配置
```json
{
  "webhook": {
    "enabled": false,
    "url": "",
    "telegram": {
      "enabled": true,
      "botToken": "你的Bot Token",
      "chatId": "你的Chat ID",
      "apiProxy": "https://api.telegram.org"
    }
  }
}
```
- 支持Telegram/Discord通知，推荐Telegram。
- 配置方法详见下方"通知功能说明"。

#### 2.2 onlyReport模式
- `onlyReport`: true 时，仅获取积分信息并推送TG，不执行任何任务。

### 3. 积分报告功能说明
- 获取方式：严格与原作者一致，dashboard+阅读API合并。
- 推送内容：详细积分进度、每日任务集、活动、阅读赚积分、进度条、邮箱脱敏等。
- 支持只获取积分信息模式（onlyReport）。
- 进度条格式、明细、示例详见下方"积分报告说明"。

### 4. 通知功能说明
- 支持任务完成、积分报告、错误、调试等多种通知。
- Telegram配置：
  1. @BotFather创建Bot，获取Token
  2. 获取Chat ID
  3. 填写到config.json
- 支持apiProxy代理TG API。
- 通知内容详见下方"通知内容与示例"。

### 5. 进阶配置与常见问题
- 详见原有各功能说明、FAQ、优化建议。

---

## 📊 积分报告说明（示例+格式）

（合并POINTS_REPORT_GUIDE.md中"积分报告功能、进度条格式、数据来源、示例"等内容，保留示例和格式说明）

---

## 🔔 通知内容与示例

（合并NOTIFICATION_GUIDE.md中"通知内容、TG配置、推送示例、常见问题"等内容，保留关键配置和推送格式示例）

---

## 其它配置与优化建议

（如需详细Docker、部署、性能优化等，见其它md文档）

## 🔧 管理命令

```bash
# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 更新代码
git pull origin master
docker-compose up -d --build
```

## 📝 注意事项

1. **首次运行**：请务必编辑 `src/accounts.json`，添加你的Microsoft账户信息
2. **定时任务**：默认每天13点执行，可在 `compose.yaml` 中修改 `CRON_SCHEDULE`
3. **会话保存**：登录状态会保存在 `src/browser/sessions` 目录
4. **网络要求**：需要稳定的网络连接访问Microsoft Rewards
5. **通知配置**：Telegram Bot Token请妥善保管，不要分享给他人

## 🤝 贡献

欢迎提交Issue和Pull Request来改进项目！

## 📄 许可证

本项目基于ISC许可证开源。 

# Microsoft Rewards 自动化脚本

> 本项目基于 [TheNetsky/Microsoft-Rewards-Script](https://github.com/TheNetsky/Microsoft-Rewards-Script) 二次开发，支持多账号、自动积分任务、Docker 部署、通知推送等功能。

---

## 部署与功能介绍
（此处合并原有README_CN.md、DEPLOYMENT_GUIDE.md、DOCKER_DEPLOY.md等相关内容，略）

---

## 配置文件说明（config.json）

> 以下为原作者配置参数，含英文原文与中文翻译释义

| 参数名 | 英文说明 | 中文说明 | 默认值 |
|--------|----------|----------|--------|
| baseURL | MS Rewards page | 微软积分页面 | https://rewards.bing.com |
| sessionPath | Path to where you want sessions/fingerprints to be stored | 会话/指纹存储路径 | sessions (在 ./browser/sessions) |
| headless | If the browser window should be visible be ran in the background | 是否后台运行浏览器窗口 | false（浏览器可见） |
| parallel | If you want mobile and desktop tasks to run parallel or sequential | 移动端和桌面端任务是否并行 | true |
| runOnZeroPoints | Run the rest of the script if 0 points can be earned | 若无可赚积分时是否继续运行 | false（无积分时不运行） |
| clusters | Amount of instances ran on launch, 1 per account | 启动实例数（每个账号一个） | 1（每次运行1个账号） |
| saveFingerprint.mobile | Re-use the same fingerprint each time | 是否复用移动端指纹 | false（每次生成新指纹） |
| saveFingerprint.desktop | Re-use the same fingerprint each time | 是否复用桌面端指纹 | false（每次生成新指纹） |
| workers.doDailySet | Complete daily set items | 是否完成每日任务集 | true |
| workers.doMorePromotions | Complete promotional items | 是否完成更多促销任务 | true |
| workers.doPunchCards | Complete punchcards | 是否完成打卡卡任务 | true |
| workers.doDesktopSearch | Complete daily desktop searches | 是否完成桌面端搜索 | true |
| workers.doMobileSearch | Complete daily mobile searches | 是否完成移动端搜索 | true |
| workers.doDailyCheckIn | Complete daily check-in activity | 是否完成每日签到 | true |
| workers.doReadToEarn | Complete read to earn activity | 是否完成阅读赚积分 | true |
| searchOnBingLocalQueries | Complete the activity "search on Bing" using the queries.json or fetched from this repo | 是否使用本地 queries.json 进行搜索 | false（默认远程获取） |
| globalTimeout | The length before the action gets timeout | 操作超时时长 | 30s |
| searchSettings.useGeoLocaleQueries | Generate search queries based on your geo-location | 是否根据地理位置生成搜索词 | false |
| searchSettings.scrollRandomResults | Scroll randomly in search results | 搜索结果页是否随机滚动 | true |
| searchSettings.clickRandomResults | Visit random website from search result | 是否随机点击搜索结果 | true |
| searchSettings.searchDelay | Minimum and maximum time in milliseconds between search queries | 搜索间隔时间（毫秒） | min: 3min max: 5min |
| searchSettings.retryMobileSearchAmount | Keep retrying mobile searches for specified amount | 移动端搜索重试次数 | 2 |
| logExcludeFunc | Functions to exclude out of the logs and webhooks | 日志排除的函数 | SEARCH-CLOSE-TABS |
| webhookLogExcludeFunc | Functions to exclude out of the webhooks log | webhook 日志排除函数 | SEARCH-CLOSE-TABS |
| proxy.proxyGoogleTrends | Enable or disable proxying the request via set proxy | 是否代理 Google Trends 请求 | true |
| proxy.proxyBingTerms | Enable or disable proxying the request via set proxy | 是否代理 Bing Terms 请求 | true |
| webhook.enabled | Enable or disable your set webhook | 是否启用 webhook | false |
| webhook.url | Your Discord webhook URL | Discord webhook 地址 | null |

---

### 新增参数说明（本项目扩展）

| 参数名 | 英文说明 | 中文说明 | 默认值 |
|--------|----------|----------|--------|
| onlyReport | Only report mode, do not execute tasks, only fetch points info | 仅报告模式，不执行任务，仅获取积分信息 | false |
| searchSettings.preferredCountry | Specify country code in request header, override auto-detect (e.g. "cn", "us", "jp") | 指定请求头中的国家代码，覆盖自动识别 | us |

#### 参数使用说明
- `onlyReport`：为 true 时，脚本只获取当前积分和任务状态，不会自动执行任何任务，适合只做监控和通知。
- `searchSettings.useGeoLocaleQueries`：为 true 时，搜索词会根据你当前的地理位置自动生成，适合非美国区用户。
- `searchSettings.preferredCountry`：手动指定国家代码，优先级高于自动识别。例如中国大陆用 "cn"，美国用 "us"，日本用 "jp" 等。

**示例配置片段：**
```json
{
  "onlyReport": false,
  "searchSettings": {
    "useGeoLocaleQueries": true,
    "preferredCountry": "cn"
  }
}
```

---

### 定时任务推荐（crontab方式）

> 建议将docker-compose.yml中的restart策略设为restart: "no"，让容器执行完自动退出，避免重复登录和资源浪费。

如需每天13点自动执行一次任务，可在宿主机crontab中添加如下定时任务：

```bash
0 13 * * * cd /opt/microsoft-rewards && docker-compose up --build --remove-orphans --abort-on-container-exit
```

这样每天13点会自动启动一次容器，脚本执行完毕后容器自动退出。

---

注： 已知BUG onlyReport=true的时候 只获取积分信息 不执行任务，请求的是us地区（因为请求头没用带上country导致获取的是us的信息），对更多任务没用去重统计导致获取不准确，其他积分信息是准确的，不是太严重的问题懒得修复！

## 📚 文档导航

- [📋 配置与功能说明](#-配置与功能说明整合版)
- [📊 积分报告说明](#-积分报告说明示例格式)
- [🔔 通知内容与示例](#-通知内容与示例)
- [🔧 故障排除指南](docs/TROUBLESHOOTING.md) - 常见问题解决方案
- [📝 更新日志](docs/CHANGELOG.md) - 版本更新记录
- [⏰ 版本时间线](docs/VERSION_TIMELINE.md) - 版本管理说明

---

### 今日更改内容

2025年6月28日 修复了 更多活动 没有区域请求头导致 获取的us地区的任务信息
            