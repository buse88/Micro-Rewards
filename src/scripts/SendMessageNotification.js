const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 统一配置和账户文件路径，适配dist/scripts目录
const configPath = path.join(__dirname, '..', 'config.json');
const accountsPath = path.join(__dirname, '..', 'accounts.json');

// 延时工具函数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 读取配置
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const searchDelay = config.searchDelay || 0;

// 获取真实阅读赚积分进度（使用正确的API调用方式）
async function getReadProgressFromAPI(accessToken, geoLocale) {
    try {
        if (!accessToken) {
            console.log('[提示] 未获取到accessToken，无法获取阅读赚积分。');
            return null;
        }

        // 尝试多个地区配置，因为阅读积分可能在不同地区可用
        const regionsToTry = ['us', 'en-us', geoLocale || 'us'].filter((r, i, arr) => arr.indexOf(r) === i);
        
        for (const region of regionsToTry) {
            try {
                console.log(`[DEBUG] 尝试地区 ${region} 获取阅读积分信息...`);
                
                const readToEarnRequest = {
                    url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613',
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'X-Rewards-Country': region,
                        'X-Rewards-Language': 'en',
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36'
                    }
                };

                const readToEarnResponse = await axios(readToEarnRequest);
                const readToEarnData = readToEarnResponse.data.response;
                
                // 查找阅读赚积分活动 - 使用正确的匹配逻辑
                const readToEarnActivity = readToEarnData.promotions?.find((x) => 
                    x.attributes?.offerid === 'ENUS_readarticle3_30points' && 
                    x.attributes?.type === 'msnreadearn'
                );
                
                if (readToEarnActivity) {
                    const currentPoints = Number(readToEarnActivity.attributes.pointprogress) || 0;
                    const maxPoints = Number(readToEarnActivity.attributes.pointmax) || 30;
                    const remainingPoints = maxPoints - currentPoints;
                    
                    console.log(`[DEBUG] 阅读赚积分获取成功 (地区: ${region}):`, { current: currentPoints, max: maxPoints, remaining: remainingPoints });
                    return { progress: currentPoints, max: maxPoints };
                } else {
                    console.log(`[DEBUG] 地区 ${region} 未找到阅读赚积分活动`);
                }
            } catch (error) {
                console.log(`[DEBUG] 地区 ${region} 获取阅读积分失败:`, error.message);
            }
        }
        
        console.log('[DEBUG] 所有地区都未找到阅读赚积分活动');
        return null;
    } catch (error) {
        console.error('[DEBUG] 获取阅读赚积分信息失败:', error.message);
        return null;
    }
}

// 通过 https://rewards.bing.com/api/getuserinfo?type=1 获取积分信息，适合 CN 地区
// 本脚本为 获取积分信息 + TG 推送
// 生成TG消息格式
async function generateTGMessage(email, dashboard, taskSummary = null, accessToken = null) {
    const now = new Date();
    const timeStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // 隐藏邮箱中间部分
    const maskedEmail = email.replace(/(.{3}).*(@.*)/, '$1***$2');
    
    // 地区信息通过API获取，不能写死
    let accountRegion = '未知', signRegion = '未知', readRegion = '未知';
    try {
        // 1. 优先用API返回的 userProfile.attributes.country
        if (dashboard.userProfile?.attributes?.country && dashboard.userProfile.attributes.country.length === 2) {
            accountRegion = dashboard.userProfile.attributes.country.toLowerCase();
        }
        // 2. 签到和阅读地区同账号地区
        signRegion = accountRegion;
        readRegion = accountRegion;
        // 3. fallback
        if (accountRegion === '未知') accountRegion = 'us';
        if (signRegion === '未知') signRegion = accountRegion;
        if (readRegion === '未知') readRegion = accountRegion;
    } catch (e) {}
    
    let regionInfo = `🌏 **地区信息**\n`;
    regionInfo += `• 账号地区: ${accountRegion}\n`;
    regionInfo += `• 签到地区: ${signRegion}\n`;
    regionInfo += `• 阅读地区: ${readRegion}\n\n`;
    
    // 获取用户状态
    const userStatus = dashboard.userStatus || {};
    const availablePoints = userStatus.availablePoints || 0;
    const lifetimePoints = userStatus.lifetimePoints || 0;
    const redeemedPoints = userStatus.lifetimePointsRedeemed || 0;
    let levelName = userStatus.levelInfo?.activeLevelName || '未知';
    const levelKey = userStatus.levelInfo?.activeLevel || '未知';
    // 只保留括号内内容
    const levelBracketMatch = levelName.match(/\(([^)]+)\)/);
    if (levelBracketMatch) {
        levelName = `(${levelBracketMatch[1]})`;
    } else if (levelKey && levelKey !== '未知') {
        levelName = `(${levelKey})`;
    } else {
        levelName = '';
    }
    
    // 获取搜索积分
    const counters = userStatus.counters || {};
    const pcSearch = counters.pcSearch?.[0] || { pointProgress: 0, pointProgressMax: 0 };
    const mobileSearch = counters.mobileSearch?.[0] || { pointProgress: 0, pointProgressMax: 0 };
    
    // 获取每日任务集 - 改进的去重逻辑
    const today = new Date();
    const todayStr = [
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
        today.getFullYear()
    ].join('/');
    
    const todayTasks = dashboard.dailySetPromotions?.[todayStr] || [];
    let dailyTasksCompleted = 0;
    let dailyTasksTotal = 0;
    let dailyTasksPoints = 0;
    let dailyTasksPointsCompleted = 0;
    
    // 用于每日任务集去重的Set
    const dailySetSeen = new Set();
    
    todayTasks.forEach(task => {
        // 使用offerId或title作为去重键
        const uniqueKey = task.offerId || task.title || task.name || '';
        if (dailySetSeen.has(uniqueKey)) {
            console.log(`[DEBUG] 每日任务集去重: 跳过重复任务 ${uniqueKey}`);
            return;
        }
        dailySetSeen.add(uniqueKey);
        
        if (task.complete) {
            dailyTasksCompleted++;
            dailyTasksPointsCompleted += task.pointProgressMax || 0;
        }
        dailyTasksTotal++;
        dailyTasksPoints += task.pointProgressMax || 0;
    });
    
    // 获取更多活动 - 改进的去重逻辑
    const moreActivities = dashboard.morePromotionsWithoutPromotionalItems || [];
    let moreActivitiesCompleted = 0;
    let moreActivitiesPoints = 0;
    let moreActivitiesPointsCompleted = 0;
    
    // 用于更多活动去重的Map，按标题分组
    const titleGroups = new Map();
    
    moreActivities.forEach(activity => {
        const promotionName = activity.title || activity.name || '未知任务';
        
        if (!titleGroups.has(promotionName)) {
            titleGroups.set(promotionName, []);
        }
        titleGroups.get(promotionName).push({
            activity,
            points: activity.pointProgressMax || 0,
            isCompleted: activity.complete || false
        });
    });
    
    // 处理分组后的活动，同名活动只显示一个
    for (const [title, group] of titleGroups) {
        // 对于同名活动，选择积分最高的那个，如果积分相同则选择已完成的那个
        const bestActivity = group.reduce((best, current) => {
            if (current.points > best.points) return current;
            if (current.points === best.points && current.isCompleted && !best.isCompleted) return current;
            return best;
        });
        
        if (bestActivity.isCompleted) {
            moreActivitiesCompleted++;
            moreActivitiesPointsCompleted += bestActivity.points;
        }
        moreActivitiesPoints += bestActivity.points;
    }
    
    // 今日积分统计优先用API todayPoints，API无则回退手动累加
    let todayPoints = dashboard.userStatus.countersSummary?.todayPoints;
    let todayPointsMax = dashboard.userStatus.countersSummary?.todayPointsMax;
    if (todayPoints === undefined || todayPointsMax === undefined) {
        // 回退手动累加
        todayPoints = (pcSearch.pointProgress || 0) + (mobileSearch.pointProgress || 0) + dailyTasksPointsCompleted + moreActivitiesPointsCompleted;
        todayPointsMax = (pcSearch.pointProgressMax || 0) + (mobileSearch.pointProgressMax || 0) + dailyTasksPoints + moreActivitiesPoints + 30;
    }
    
    // 生成进度条
    function generateProgressBar(current, max, width = 10) {
        const percentage = max > 0 ? current / max : 0;
        const filled = Math.round(percentage * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }
    
    // 生成百分比
    function generatePercentage(current, max) {
        return max > 0 ? Math.round((current / max) * 100) : 0;
    }
    
    // 构建消息
    let message = `🔔 **Microsoft Rewards 积分报告**\n\n`;
    message += `📧 **账户**: ${maskedEmail}\n`;
    message += `⏰ **时间**: ${timeStr}\n\n`;
    message += regionInfo;
    
    // 任务完成信息
    if (taskSummary) {
        message += `🎯 **任务执行结果**\n`;
        message += `• 开始积分: ${taskSummary.startPoints.toLocaleString()}\n`;
        message += `• 结束积分: ${taskSummary.endPoints.toLocaleString()}\n`;
        message += `• 本次获得: ${taskSummary.pointsGained.toLocaleString()} 积分\n`;
        if (taskSummary.executionTime) {
            message += `• 执行时间: ${Math.round(taskSummary.executionTime / 1000)}秒\n`;
        }
        if (taskSummary.dailyCheckInResult) {
            message += `• 每日签到: ${taskSummary.dailyCheckInResult.success ? '✅ 成功' : '⏳ 已完成'} (${taskSummary.dailyCheckInResult.pointsGained}积分)\n`;
        }
        message += `\n`;
    }
    
    message += `💰 **积分概览**\n`;
    message += `• 可用积分: ${availablePoints.toLocaleString()}\n`;
    message += `• 累计积分: ${lifetimePoints.toLocaleString()}\n`;
    message += `• 已兑换积分: ${redeemedPoints.toLocaleString()}\n`;
    if (levelName) message += `• 用户等级: ${levelName}\n\n\n`;
    
    message += `📈 **今日积分统计**: ${todayPoints}/${todayPointsMax} 积分\n\n`;
    
    message += `📊 桌面端搜索: ${generateProgressBar(pcSearch.pointProgress || 0, pcSearch.pointProgressMax || 0)} ${generatePercentage(pcSearch.pointProgress || 0, pcSearch.pointProgressMax || 0)}% (${pcSearch.pointProgress || 0}/${pcSearch.pointProgressMax || 0})\n`;
    message += `📊 移动端搜索: ${generateProgressBar(mobileSearch.pointProgress || 0, mobileSearch.pointProgressMax || 0)} ${generatePercentage(mobileSearch.pointProgress || 0, mobileSearch.pointProgressMax || 0)}% (${mobileSearch.pointProgress || 0}/${mobileSearch.pointProgressMax || 0})\n`;
    message += `📊 每日活动: ${generateProgressBar(dailyTasksPointsCompleted, dailyTasksPoints)} ${generatePercentage(dailyTasksPointsCompleted, dailyTasksPoints)}% (${dailyTasksPointsCompleted}/${dailyTasksPoints})\n`;
    message += `📊 更多活动: ${generateProgressBar(moreActivitiesPointsCompleted, moreActivitiesPoints)} ${generatePercentage(moreActivitiesPointsCompleted, moreActivitiesPoints)}% (${moreActivitiesPointsCompleted}/${moreActivitiesPoints})\n`;
    
    // 使用正确的API调用方式获取阅读积分
    const readProgress = await getReadProgressFromAPI(accessToken, accountRegion);
    if (readProgress == null) {
        message += `📊 阅读赚积分: x/x 获取失败\n`;
    } else {
        message += `📊 阅读赚积分: ${generateProgressBar(readProgress.progress, readProgress.max)} ${generatePercentage(readProgress.progress, readProgress.max)}% (${readProgress.progress}/${readProgress.max})\n`;
    }
    message += `📊 今日总计: ${generateProgressBar(todayPoints, todayPointsMax)} ${generatePercentage(todayPoints, todayPointsMax)}% (${todayPoints}/${todayPointsMax})\n\n`;
    
    // 已完成和待完成项目
    const completedItems = [];
    const pendingItems = [];
    
    if (pcSearch.pointProgress >= pcSearch.pointProgressMax) completedItems.push('桌面端搜索');
    else pendingItems.push('桌面端搜索');
    
    if (mobileSearch.pointProgress >= mobileSearch.pointProgressMax) completedItems.push('移动端搜索');
    else pendingItems.push('移动端搜索');
    
    if (dailyTasksCompleted === dailyTasksTotal && dailyTasksTotal > 0) completedItems.push('每日活动');
    else if (dailyTasksTotal > 0) pendingItems.push('每日活动');
    
    if (moreActivitiesCompleted === titleGroups.size && titleGroups.size > 0) completedItems.push('更多活动');
    else if (titleGroups.size > 0) pendingItems.push('更多活动');
    
    if (readProgress == null) {
        pendingItems.push('阅读赚积分');
    } else if (readProgress.progress >= readProgress.max) {
        completedItems.push('阅读赚积分');
    } else {
        pendingItems.push('阅读赚积分');
    }
    
    message += `✅ **已完成**: ${completedItems.join(', ')}\n`;
    message += '---------------------------------------------------------------\n';
    if (pendingItems.length > 0) {
        message += `❌ **待完成**: ${pendingItems.join(', ')}\n`;
    } else {
        message += `❌ **待完成**: \n`;
    }
    message += '\n---------------------------------------------------------------\n';
    
    // 每日活动明细
    message += '📋 **每日活动**:\n';
    if (todayTasks.length > 0) {
        todayTasks.forEach(task => {
            const uniqueKey = task.offerId || task.title || task.name || '';
            if (dailySetSeen.has(uniqueKey)) {
                const status = task.complete ? '✅' : '❌';
                const title = task.title || '未知任务';
                const points = task.pointProgressMax || 0;
                const date = task.date || timeStr.split(' ')[0];
                const progress = `${task.pointProgress || points}/${points}`;
                message += `${status} ${title} (${points}积分) - ${date} -  📊 进度: ${progress}\n`;
            }
        });
    } else {
        message += '无数据\n';
    }
    message += '---------------------------------------------------------------\n';
    
    // 更多活动明细
    message += `📋 **更多活动**: ${titleGroups.size} 个活动--🎯 总积分: ${moreActivitiesPoints} ✅ 已完成: ${moreActivitiesCompleted}/${titleGroups.size}\n`;
    for (const [title, group] of titleGroups) {
        const bestActivity = group.reduce((best, current) => {
            if (current.points > best.points) return current;
            if (current.points === best.points && current.isCompleted && !best.isCompleted) return current;
            return best;
        });
        
        const status = bestActivity.isCompleted ? '✅' : '❌';
        const points = bestActivity.points;
        const date = bestActivity.activity.date || timeStr.split(' ')[0];
        const progress = `${bestActivity.activity.pointProgress || points}/${points}`;
        message += `${status} ${title} (${points}积分) - ${date} -📊 进度: ${progress}\n`;
    }
    
    // 判断是否需要加备注
    if (readProgress && (todayPoints + (readProgress.max - readProgress.progress)) === todayPointsMax && todayPoints < todayPointsMax) {
        message += '\n注：阅读积分可能不在该区域';
    }
    
    // 验证消息内容
    if (!message || message.trim() === '') {
        console.error('❌ 生成的消息内容为空');
        return '📱 Microsoft Rewards 报告\n\n❌ 无法生成报告内容，请检查数据';
    }
    
    console.log(`📝 生成的消息长度: ${message.length} 字符`);
    return message;
}

// 发送消息到Telegram
async function sendToTelegram(message, telegramConfig) {
    const { botToken, chatId, apiProxy } = telegramConfig;
    
    if (!botToken || !chatId) {
        throw new Error('Telegram配置不完整: 缺少botToken或chatId');
    }
    
    // 检查消息内容
    if (!message || message.trim() === '') {
        throw new Error('消息内容为空，无法发送');
    }
    
    // 构建API URL，支持代理
    const apiBase = apiProxy || 'https://api.telegram.org';
    const apiUrl = `${apiBase}/bot${botToken}/sendMessage`;
    
    const request = {
        method: 'POST',
        url: apiUrl,
        headers: {
            'Content-Type': 'application/json'
        },
        data: {
            chat_id: chatId,
            text: message
        }
    };
    
    console.log(`📡 发送到Telegram API: ${apiUrl}`);
    console.log(`💬 消息长度: ${message.length} 字符`);
    console.log(`📝 消息预览: ${message.substring(0, 100)}...`);
    
    try {
        const response = await axios(request);
        
        if (response.data.ok) {
            console.log(`✅ Telegram消息发送成功，消息ID: ${response.data.result.message_id}`);
            return response.data.result;
        } else {
            console.error('❌ Telegram API错误详情:', JSON.stringify(response.data, null, 2));
            throw new Error(`Telegram API错误: ${response.data.description || '未知错误'}`);
        }
    } catch (error) {
        console.error('❌ Telegram通知发送失败:', error.message);
        throw error;
    }
}

async function testDirectAPI() {
    console.log('=== 直接API调用测试 ===');
    
    // 1. 读取配置文件 - 修复路径，指向项目根目录的dist
    const configPath = path.join(__dirname, '..', '..', 'dist', 'config.json');
    const accountsPath = path.join(__dirname, '..', '..', 'dist', 'accounts.json');
    
    console.log('📁 查找配置文件:', configPath);
    console.log('📁 查找账户文件:', accountsPath);
    
    if (!fs.existsSync(configPath)) {
        console.error('❌ 配置文件不存在:', configPath);
        console.log('💡 请先运行 npm run build 生成dist文件夹');
        return;
    }
    
    if (!fs.existsSync(accountsPath)) {
        console.error('❌ 账户文件不存在:', accountsPath);
        console.log('💡 请先运行 npm run build 生成dist文件夹');
        return;
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
    
    // 从环境变量获取账户邮箱，如果没有则使用第一个账户
    const accountEmail = process.env.ACCOUNT_EMAIL || accounts[0]?.email;
    const account = accounts.find(acc => acc.email === accountEmail) || accounts[0];
    
    if (!account || !account.email || !account.password) {
        console.error('❌ 账户文件中缺少账户信息');
        return;
    }
    
    console.log(`📧 使用账户: ${account.email}`);
    
    // 从环境变量获取任务信息
    let taskSummary = null;
    if (process.env.TASK_SUMMARY) {
        try {
            taskSummary = JSON.parse(process.env.TASK_SUMMARY);
            console.log('📋 任务信息:', taskSummary);
        } catch (error) {
            console.error('❌ 解析任务信息失败:', error);
        }
    }
    
    try {
        // 2. 尝试加载session cookies - 修复路径
        const sessionDir = path.join(__dirname, '..', '..', 'dist', 'browser', config.sessionPath, account.email);
        const desktopCookiesPath = path.join(sessionDir, 'desktop_cookies.json');
        const mobileCookiesPath = path.join(sessionDir, 'mobile_cookies.json');
        const desktopAccessTokenPath = path.join(sessionDir, 'accessToken.txt');
        const mobileAccessTokenPath = path.join(sessionDir, 'mobile_accessToken.txt');
        
        console.log('📂 查找session cookies:', desktopCookiesPath);
        console.log('📂 查找移动端cookies:', mobileCookiesPath);
        console.log('📂 查找桌面端accessToken:', desktopAccessTokenPath);
        console.log('📂 查找移动端accessToken:', mobileAccessTokenPath);
        
        let cookies = [];
        let accessToken = null;
        
        // 优先使用移动端cookies和accessToken（因为阅读积分是移动端功能）
        if (fs.existsSync(mobileCookiesPath)) {
            try {
                const cookiesData = fs.readFileSync(mobileCookiesPath, 'utf8');
                cookies = JSON.parse(cookiesData);
                console.log('✅ 已加载移动端cookies');
            } catch (error) {
                console.log('⚠️  加载移动端cookies失败:', error.message);
            }
        } else if (fs.existsSync(desktopCookiesPath)) {
            try {
                const cookiesData = fs.readFileSync(desktopCookiesPath, 'utf8');
                cookies = JSON.parse(cookiesData);
                console.log('✅ 已加载桌面cookies');
            } catch (error) {
                console.log('⚠️  加载桌面cookies失败:', error.message);
            }
        } else {
            console.log('⚠️  未找到cookies文件');
            console.log('💡 需要先运行主程序生成session文件');
            return;
        }
        
        // 优先使用移动端accessToken
        if (fs.existsSync(mobileAccessTokenPath)) {
            try {
                accessToken = fs.readFileSync(mobileAccessTokenPath, 'utf8').trim();
                console.log('✅ 已加载移动端accessToken');
            } catch (error) {
                console.log('⚠️  加载移动端accessToken失败:', error.message);
            }
        } else if (fs.existsSync(desktopAccessTokenPath)) {
            try {
                accessToken = fs.readFileSync(desktopAccessTokenPath, 'utf8').trim();
                console.log('✅ 已加载桌面accessToken');
            } catch (error) {
                console.log('⚠️  加载桌面accessToken失败:', error.message);
            }
        } else {
            console.log('⚠️  未找到accessToken文件');
            console.log('💡 需要先运行主程序生成session文件');
        }
        
        // 3. 构建cookie字符串
        const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
        
        if (!cookieString) {
            console.error('❌ 没有有效的cookies');
            return;
        }
        
        console.log('🍪 Cookie字符串长度:', cookieString.length);
        
        // 4. 直接调用API
        console.log('📡 开始调用API...');
        
        const apiUrl = 'https://rewards.bing.com/api/getuserinfo?type=1';
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://rewards.bing.com/',
            'Origin': 'https://rewards.bing.com',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Cookie': cookieString
        };
        
        console.log('📋 请求头已设置');
        console.log('🌐 请求URL:', apiUrl);
        
        const response = await axios.get(apiUrl, {
            headers: headers,
            timeout: 30000,
            validateStatus: (status) => status < 500
        });
        
        console.log('📊 响应状态码:', response.status);
        
        if (response.status === 200) {
            console.log('✅ API调用成功！');
            
            if (response.data && response.data.dashboard) {
                const dashboard = response.data.dashboard;
                console.log('📄 Dashboard数据获取成功');
                
                // 生成TG消息格式
                const tgMessage = await generateTGMessage(account.email, dashboard, taskSummary, accessToken);
                console.log('\n📱 TG消息格式:');
                console.log('='.repeat(50));
                console.log(tgMessage);
                console.log('='.repeat(50));
                
                // 发送到TG
                if (config.webhook && config.webhook.telegram && config.webhook.telegram.enabled) {
                    console.log('\n📤 正在发送到Telegram...');
                    console.log('🔧 Telegram配置:', {
                        enabled: config.webhook.telegram.enabled,
                        botToken: config.webhook.telegram.botToken ? '已配置' : '未配置',
                        chatId: config.webhook.telegram.chatId ? '已配置' : '未配置',
                        apiProxy: config.webhook.telegram.apiProxy || '未配置'
                    });
                    
                    try {
                        await sendToTelegram(tgMessage, config.webhook.telegram);
                        console.log('✅ TG消息发送成功！');
                    } catch (error) {
                        console.error('❌ TG发送失败:', error.message);
                    }
                } else {
                    console.log('\n⚠️  Telegram未启用或配置缺失');
                    console.log('💡 请在src/config.json中配置webhook.telegram，然后运行npm run build');
                }
                
                console.log('\n🎉 直接API调用测试成功！');
                console.log('💡 这种方式比浏览器方式更快更高效');
                
            } else {
                console.log('❌ API响应格式错误，缺少dashboard数据');
                console.log('📄 响应内容预览:', JSON.stringify(response.data).substring(0, 500));
            }
            
        } else {
            console.error('❌ API调用失败，状态码:', response.status);
            console.error('📄 错误响应:', response.data);
        }
        
    } catch (error) {
        console.error('❌ 测试过程中发生错误:', error.message);
        
        if (error.response) {
            console.error('📊 错误状态码:', error.response.status);
            console.error('📄 错误响应:', error.response.data);
        } else if (error.request) {
            console.error('🌐 网络请求错误:', error.request);
        } else {
            console.error('🔧 其他错误:', error.message);
        }
    }
}

// 运行测试
testDirectAPI().catch(console.error); 