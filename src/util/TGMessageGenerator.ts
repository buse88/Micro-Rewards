import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

// 加载配置文件
function loadConfig() {
    // 查找配置文件路径
    const configPaths = [
        path.join(process.cwd(), 'dist', 'config.json'),
        path.join(process.cwd(), 'src', 'config.json'),
        path.join(process.cwd(), 'config.json')
    ]
    
    const accountsPaths = [
        path.join(process.cwd(), 'dist', 'accounts.json'),
        path.join(process.cwd(), 'src', 'accounts.json'),
        path.join(process.cwd(), 'accounts.json')
    ]
    
    let configPath = null
    let accountsPath = null
    
    // 查找配置文件
    for (const configPathCandidate of configPaths) {
        if (fs.existsSync(configPathCandidate)) {
            configPath = configPathCandidate
            break
        }
    }
    
    // 查找账户文件
    for (const accountsPathCandidate of accountsPaths) {
        if (fs.existsSync(accountsPathCandidate)) {
            accountsPath = accountsPathCandidate
            break
        }
    }
    
    if (!configPath || !accountsPath) {
        return null
    }
    
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        const accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf8'))
        return { config, accounts }
    } catch (error) {
        return null
    }
}

// 加载移动端session cookies
function loadMobileSessionCookies(accountEmail: string) {
    const mobileCookiesPath = path.join(process.cwd(), 'dist', 'browser', 'sessions', accountEmail, 'mobile_cookies.json')
    
    if (!fs.existsSync(mobileCookiesPath)) {
        return null
    }
    
    try {
        const cookiesData = fs.readFileSync(mobileCookiesPath, 'utf8')
        const cookies = JSON.parse(cookiesData)
        return cookies
    } catch (error) {
        return null
    }
}

// 构建移动端请求头
function buildMobileHeaders(cookies: any[]) {
    const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
    
    if (!cookieString) {
        return null
    }
    
    return {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; 2210132C Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.52 Version/4.0 Mobile Safari/537.36 EdgA/125.0.2535.51',
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
    }
}

// 获取移动端访问令牌
async function getMobileAccessToken(cookies: any[], accountEmail: string): Promise<string | null> {
    try {
        const headers = buildMobileHeaders(cookies)
        if (!headers) {
            return null
        }
        
        // OAuth2.0配置
        const clientId = '0000000040170455'
        const authBaseUrl = 'https://login.live.com/oauth20_authorize.srf'
        const redirectUrl = 'https://login.live.com/oauth20_desktop.srf'
        const tokenUrl = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
        const scope = 'service::prod.rewardsplatform.microsoft.com::MBI_SSL'
        
        // 生成随机state参数
        const state = crypto.randomBytes(16).toString('hex')
        
        // 构建授权URL
        const authorizeUrl = new URL(authBaseUrl)
        authorizeUrl.searchParams.append('response_type', 'code')
        authorizeUrl.searchParams.append('client_id', clientId)
        authorizeUrl.searchParams.append('redirect_uri', redirectUrl)
        authorizeUrl.searchParams.append('scope', scope)
        authorizeUrl.searchParams.append('state', state)
        authorizeUrl.searchParams.append('access_type', 'offline_access')
        authorizeUrl.searchParams.append('login_hint', accountEmail)
        
        // 发送授权请求
        const codeResponse = await axios.get(authorizeUrl.href, {
            headers: headers,
            maxRedirects: 0,
            validateStatus: (status) => status < 400
        })
        
        // 从重定向URL中提取授权码
        const finalUrl = codeResponse.request.res.responseUrl || codeResponse.headers.location
        
        if (!finalUrl) {
            return null
        }
        
        const url = new URL(finalUrl)
        const code = url.searchParams.get('code')
        
        if (!code) {
            return null
        }
        
        // 使用授权码获取访问令牌
        const body = new URLSearchParams()
        body.append('grant_type', 'authorization_code')
        body.append('client_id', clientId)
        body.append('code', code)
        body.append('redirect_uri', redirectUrl)
        
        const tokenResponse = await axios.post(tokenUrl, body.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })
        
        if (tokenResponse.data.access_token) {
            return tokenResponse.data.access_token
        } else {
            return null
        }
        
    } catch (error) {
        return null
    }
}

// 简化的获取阅读赚积分进度函数 - 使用本地token获取方式
async function getReadProgressSimple(accessToken: string): Promise<{ progress: number; max: number }> {
    if (!accessToken) {
        console.log('[TG调试] ❌ 未获取到accessToken，无法获取阅读赚积分。')
        return { progress: 0, max: 30 }
    }

    try {
        console.log('[TG调试] === 开始获取阅读赚积分进度 ===')
        console.log('[TG调试] accessToken长度:', accessToken.length)
        console.log('[TG调试] accessToken前10位:', accessToken.substring(0, 10) + '...')
        
        const headers: any = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Authorization': `Bearer ${accessToken}`,
            'X-Rewards-Country': 'us',
            'X-Rewards-Language': 'en'
        }
        
        console.log('[TG调试] === 完整请求信息 ===')
        console.log('[TG调试] 请求URL: https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613')
        console.log('[TG调试] 请求方法: GET')
        console.log('[TG调试] 请求超时: 30000ms')
        console.log('[TG调试] 完整请求头:')
        Object.entries(headers).forEach(([key, value]) => {
            if (key === 'Authorization') {
                console.log(`[TG调试]   ${key}: Bearer ***${accessToken.slice(-10)}`)
            } else {
                console.log(`[TG调试]   ${key}: ${value}`)
            }
        })
        
        console.log('[TG调试] 发送请求...')
        const response = await axios.get(
            "https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613",
            { headers: headers, timeout: 30000 }
        )
        
        console.log('[TG调试] === 完整响应信息 ===')
        console.log('[TG调试] 响应状态码:', response.status)
        console.log('[TG调试] 响应状态文本:', response.statusText)
        console.log('[TG调试] 响应头:')
        Object.entries(response.headers).forEach(([key, value]) => {
            console.log(`[TG调试]   ${key}: ${value}`)
        })
        
        if (response.status === 200 && response.data) {
            console.log('[TG调试] ✅ API调用成功')
            console.log('[TG调试] 响应数据结构:')
            console.log('[TG调试] - response字段存在:', !!response.data.response)
            console.log('[TG调试] - promotions字段存在:', !!response.data.response?.promotions)
            console.log('[TG调试] - promotions数量:', response.data.response?.promotions?.length || 0)
            
            const promotions = response.data.response?.promotions || []
            console.log('[TG调试] 找到promotions数量:', promotions.length)
            
            let readProgress = { max: 30, progress: 0 }
            
            // 调试：打印所有promotions
            console.log('[TG调试] === 所有promotions详情 ===')
            for (const promo of promotions) {
                console.log('[TG调试] promotion:', {
                    offerid: promo.attributes?.offerid,
                    type: promo.attributes?.type,
                    pointmax: promo.attributes?.pointmax,
                    pointprogress: promo.attributes?.pointprogress
                })
            }
            
            for (const promo of promotions) {
                if (promo.attributes?.offerid === "ENUS_readarticle3_30points" && 
                    promo.attributes?.type === "msnreadearn") {
                    readProgress = {
                        max: Number(promo.attributes.pointmax) || 30,
                        progress: Number(promo.attributes.pointprogress) || 0
                    }
                    console.log('[TG调试] ✅ 找到阅读任务:', {
                        offerid: promo.attributes.offerid,
                        type: promo.attributes.type,
                        max: readProgress.max,
                        progress: readProgress.progress
                    })
                    break
                }
            }
            
            console.log(`[TG调试] 📊 最终阅读进度: ${readProgress.progress}/${readProgress.max}`)
            return readProgress
        } else {
            console.log('[TG调试] ❌ API响应异常')
            console.log('[TG调试] 响应数据:', JSON.stringify(response.data, null, 2))
            return { progress: 0, max: 30 }
        }
    } catch (error: any) {
        console.error('[TG调试] ❌ 获取失败:', error.message)
        if (error.response) {
            console.error('[TG调试] === 错误响应详情 ===')
            console.error('[TG调试] 错误响应状态码:', error.response.status)
            console.error('[TG调试] 错误响应状态文本:', error.response.statusText)
            console.error('[TG调试] 错误响应头:')
            Object.entries(error.response.headers).forEach(([key, value]) => {
                console.error(`[TG调试]   ${key}: ${value}`)
            })
            console.error('[TG调试] 错误响应数据:')
            console.error(JSON.stringify(error.response.data, null, 2))
        }
        
        if (error.request) {
            console.error('[TG调试] === 请求错误详情 ===')
            console.error('[TG调试] 请求错误:', error.request)
        }
        
        return { progress: 0, max: 30 }
    }
}

// 获取阅读赚积分进度 - 自动获取本地token
async function getReadProgressFromAPI(accessToken: string | null, geoLocale?: string, accountEmail?: string): Promise<{ progress: number; max: number }> {
    console.log('[TG调试] === 开始获取阅读积分进度 ===')
    console.log('[TG调试] 传入参数:', { accessToken: accessToken ? '已提供' : '未提供', geoLocale, accountEmail })
    
    // 如果没有传入accessToken，尝试从本地获取
    if (!accessToken && accountEmail) {
        console.log('[TG调试] 尝试从本地获取accessToken...')
        
        // 加载配置
        const configData = loadConfig()
        if (!configData) {
            console.log('[TG调试] ❌ 无法加载配置文件')
            return { progress: 0, max: 30 }
        }
        console.log('[TG调试] ✅ 配置文件加载成功')
        
        // 加载移动端cookies
        const cookies = loadMobileSessionCookies(accountEmail)
        if (!cookies) {
            console.log('[TG调试] ❌ 无法加载移动端cookies')
            return { progress: 0, max: 30 }
        }
        console.log('[TG调试] ✅ 移动端cookies加载成功，数量:', cookies.length)
        
        // 获取accessToken
        console.log('[TG调试] 开始获取本地accessToken...')
        const localAccessToken = await getMobileAccessToken(cookies, accountEmail)
        if (!localAccessToken) {
            console.log('[TG调试] ❌ 无法获取本地accessToken')
            return { progress: 0, max: 30 }
        }
        
        console.log('[TG调试] ✅ 成功获取本地accessToken')
        accessToken = localAccessToken
    }
    
    // 使用获取到的token调用API
    console.log('[TG调试] 开始调用阅读积分API...')
    const result = await getReadProgressSimple(accessToken || '')
    console.log('[TG调试] === 阅读积分获取完成 ===')
    console.log('[TG调试] 最终结果:', result)
    return result
}

// 生成进度条
function generateProgressBar(current: number, max: number, width: number = 10): string {
    const percentage = max > 0 ? current / max : 0
    const filled = Math.round(percentage * width)
    const empty = width - filled
    // 使用普通字符避免Markdown解析问题
    return '■'.repeat(filled) + '□'.repeat(empty)
}

// 生成百分比
function generatePercentage(current: number, max: number): string {
    if (max === 0) return '0%'
    const percentage = (current / max) * 100
    return `${percentage.toFixed(1)}%`
}

// 转义Markdown特殊字符
function escapeMarkdown(text?: string): string {
    text = text || '';
    // 只转义真正的Markdown特殊字符，避免过度转义
    return text.replace(/[_*\[\]()~`>#+=|{}.!-]/g, (match) => {
        // 不转义括号、点号、方括号等常见字符
        if (match === '(' || match === ')' || match === '.' || match === '@' || match === '[' || match === ']') {
            return match
        }
        return '\\' + match
    })
}

// 生成TG消息格式
export async function generateTGMessage(
    email: string, 
    dashboard: any, 
    taskSummary: any = null, 
    accessToken: string | null = null,
    config?: any
): Promise<string> {
    const now = new Date()
    const timeStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    
    // 隐藏邮箱中间部分
    const maskedEmail = email.replace(/(.{3}).*(@.*)/, '$1***$2')
    
    // 地区信息获取逻辑
    let accountRegion = '未知', signRegion = '未知', readRegion = '未知'
    try {
        if (config?.enableDebugLog) console.log('[debug] TG消息生成器 - dashboard数据结构:')
        if (config?.enableDebugLog) console.log('[debug] - dashboard.ruid:', dashboard.ruid)
        if (config?.enableDebugLog) console.log('[debug] - dashboard.userProfile?.attributes?.country:', dashboard.userProfile?.attributes?.country)
        if (config?.enableDebugLog) console.log('[debug] - dashboard.userProfile?.attributes?.ruid:', dashboard.userProfile?.attributes?.ruid)
        if (config?.enableDebugLog) console.log('[debug] - dashboard.userProfile?.ruid:', dashboard.userProfile?.ruid)
        if (config?.enableDebugLog) console.log('[debug] - dashboard.userProfile:', JSON.stringify(dashboard.userProfile, null, 2))
        
        // 检查所有可能的ruid字段位置
        const possibleRuidFields = [
            dashboard.ruid,
            dashboard.userProfile?.attributes?.ruid,
            dashboard.userProfile?.ruid,
            dashboard.userProfile?.attributes?.country
        ]
        if (config?.enableDebugLog) console.log('[debug] - 所有可能的地区字段:', possibleRuidFields)
        
        // 1. 账号地区：从ruid获取真实账号归属地
        if (dashboard?.ruid && typeof dashboard.ruid === 'string' && dashboard.ruid.includes('-')) {
            accountRegion = dashboard.ruid.split('-')[0].toLowerCase()
            if (config?.enableDebugLog) console.log('[debug] 从dashboard.ruid获取账号地区:', accountRegion)
        } else if (dashboard?.userProfile?.attributes?.ruid && typeof dashboard.userProfile.attributes.ruid === 'string' && dashboard.userProfile.attributes.ruid.includes('-')) {
            accountRegion = dashboard.userProfile.attributes.ruid.split('-')[0].toLowerCase()
            if (config?.enableDebugLog) console.log('[debug] 从userProfile.attributes.ruid获取账号地区:', accountRegion)
        } else if (dashboard?.userProfile?.ruid && typeof dashboard.userProfile.ruid === 'string' && dashboard.userProfile.ruid.includes('-')) {
            accountRegion = dashboard.userProfile.ruid.split('-')[0].toLowerCase()
            if (config?.enableDebugLog) console.log('[debug] 从userProfile.ruid获取账号地区:', accountRegion)
        } else if (dashboard?.userProfile?.attributes?.country && dashboard.userProfile.attributes.country.length === 2) {
            accountRegion = dashboard.userProfile.attributes.country.toLowerCase()
            if (config?.enableDebugLog) console.log('[debug] 从userProfile.country获取账号地区:', accountRegion)
        }
        
        // 2. 签到地区：从实际执行签到任务的地区获取
        // 优先使用传入的actualRegions信息
        if (dashboard?.actualRegions?.checkInRegion) {
            signRegion = dashboard.actualRegions.checkInRegion.toLowerCase()
            if (config?.enableDebugLog) console.log('[debug] 从actualRegions获取签到地区:', signRegion)
        } else if (dashboard?.config?.searchSettings?.preferredCountry && dashboard.config.searchSettings.preferredCountry.length === 2) {
            signRegion = dashboard.config.searchSettings.preferredCountry.toLowerCase()
            if (config?.enableDebugLog) console.log('[debug] 从配置获取签到地区:', signRegion)
        } else {
            // 如果没有配置preferredCountry，使用账号地区
            signRegion = accountRegion
            if (config?.enableDebugLog) console.log('[debug] 使用账号地区作为签到地区:', signRegion)
        }
        
        // 3. 阅读地区：从实际执行阅读任务的地区获取
        // 优先使用传入的actualRegions信息
        if (dashboard?.actualRegions?.readRegion) {
            readRegion = dashboard.actualRegions.readRegion.toLowerCase()
            if (config?.enableDebugLog) console.log('[debug] 从actualRegions获取阅读地区:', readRegion)
        } else if (dashboard?.config?.searchSettings?.preferredCountry && dashboard.config.searchSettings.preferredCountry.length === 2) {
            readRegion = dashboard.config.searchSettings.preferredCountry.toLowerCase()
            if (config?.enableDebugLog) console.log('[debug] 从配置获取阅读地区:', readRegion)
        } else {
            // 如果没有配置preferredCountry，使用账号地区
            readRegion = accountRegion
            if (config?.enableDebugLog) console.log('[debug] 使用账号地区作为阅读地区:', readRegion)
        }
        
        // 4. fallback
        if (accountRegion === '未知') accountRegion = 'us'
        if (signRegion === '未知') signRegion = accountRegion
        if (readRegion === '未知') readRegion = accountRegion
        
        if (config?.enableDebugLog) console.log('[debug] 最终地区设置 - accountRegion:', accountRegion, 'signRegion:', signRegion, 'readRegion:', readRegion)
    } catch (e) {
        console.error('[debug] 获取地区信息时出错:', e)
    }
    
    let regionInfo = `🌏 **地区信息**\n`
    regionInfo += `• 账号地区: ${accountRegion}\n`
    regionInfo += `• 签到地区: ${signRegion}\n`
    regionInfo += `• 阅读地区: ${readRegion}\n\n`
    
    // 获取用户状态
    const userStatus = dashboard.userStatus || {}
    const availablePoints = userStatus.availablePoints || 0
    const lifetimePoints = userStatus.lifetimePoints || 0
    const redeemedPoints = userStatus.lifetimePointsRedeemed || 0
    let levelName = userStatus.levelInfo?.activeLevelName || '未知'
    const levelKey = userStatus.levelInfo?.activeLevel || '未知'
    // 只保留括号内内容
    const levelBracketMatch = levelName.match(/\(([^)]+)\)/)
    if (levelBracketMatch) {
        levelName = `(${levelBracketMatch[1]})`
    } else if (levelKey && levelKey !== '未知') {
        levelName = `(${levelKey})`
    } else {
        levelName = ''
    }
    
    // 获取搜索积分
    const counters = userStatus.counters || {}
    const pcSearch = counters.pcSearch?.[0] || { pointProgress: 0, pointProgressMax: 0 }
    const mobileSearch = counters.mobileSearch?.[0] || { pointProgress: 0, pointProgressMax: 0 }
    
    // 获取每日任务集 - 改进的去重逻辑
    const today = new Date()
    const todayStr = [
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
        today.getFullYear()
    ].join('/')
    
    const todayTasks = dashboard.dailySetPromotions?.[todayStr] || []
    let dailyTasksCompleted = 0
    let dailyTasksTotal = 0
    let dailyTasksPoints = 0
    
    // 统计每日任务
    todayTasks.forEach((task: any) => {
        if (task.complete) {
            dailyTasksCompleted++
        }
        dailyTasksTotal++
        dailyTasksPoints += task.pointProgressMax || 0
    })
    
    // 获取更多活动 - 改进的去重逻辑
    const morePromotions = dashboard.morePromotions || []
    const morePromotionsWithoutPromotionalItems = dashboard.morePromotionsWithoutPromotionalItems || []
    
    // 合并两个字段的活动，并去重（以offerId为唯一标识）
    const allMoreActivities = new Map()
    
    // 先添加morePromotionsWithoutPromotionalItems（优先级更高）
    morePromotionsWithoutPromotionalItems.forEach((activity: any) => {
        const offerId = activity.offerId || activity.name
        if (offerId) {
            allMoreActivities.set(offerId, activity)
        }
    })
    
    // 再添加morePromotions中不重复的活动
    morePromotions.forEach((activity: any) => {
        const offerId = activity.offerId || activity.name
        if (offerId && !allMoreActivities.has(offerId)) {
            allMoreActivities.set(offerId, activity)
        }
    })
    
    let moreActivitiesCompleted = 0
    let moreActivitiesTotal = 0
    let moreActivitiesPoints = 0
    
    // 统计合并后的更多活动
    allMoreActivities.forEach((activity: any) => {
        if (activity.complete) {
            moreActivitiesCompleted++
        }
        moreActivitiesTotal++
        moreActivitiesPoints += activity.pointProgressMax || 0
    })
    
    // 获取阅读赚积分进度
    let readProgress = null
    if (accessToken) {
        // 直接调用简化版本，不需要传入地区参数
        readProgress = await getReadProgressFromAPI(accessToken, undefined, email)
    } else {
        // 如果没有accessToken，尝试从本地获取
        readProgress = await getReadProgressFromAPI(null, undefined, email)
    }
    
    // 构建消息
    let message = `**Microsoft Rewards 积分报告**\n\n`
    message += `📧 **账户**: ${escapeMarkdown(maskedEmail || '')}\n`
    message += `⏰ **时间**: ${escapeMarkdown(timeStr || '')}\n\n`
    
    message += regionInfo
    
    // 任务执行结果
    if (taskSummary) {
        message += `🎯 **任务执行结果**\n`
        message += `• 开始积分: ${taskSummary.startPoints.toLocaleString()}\n`
        message += `• 结束积分: ${taskSummary.endPoints.toLocaleString()}\n`
        message += `• 本次获得: ${taskSummary.pointsGained} 积分\n`
        if (taskSummary.executionTime) {
            message += `• 执行时间: ${Math.round(taskSummary.executionTime / 1000)}秒\n`
        }
        if (taskSummary.dailyCheckInResult) {
            const checkIn = taskSummary.dailyCheckInResult
            if (checkIn.success) {
                message += `• 每日签到: ✅ 成功 (30积分)\n`
            } else {
                message += `• 每日签到: ❌ ${escapeMarkdown((checkIn.message || ''))}\n`
            }
        }
        message += '\n'
    }
    
    // 积分概览
    message += `💰 **积分概览**\n`
    message += `• 可用积分: ${availablePoints.toLocaleString()}\n`
    message += `• 累计积分: ${lifetimePoints.toLocaleString()}\n`
    message += `• 已兑换积分: ${redeemedPoints.toLocaleString()}\n`
    message += `• 用户等级: ${levelName}\n\n`
    
    // 计算今日总计
    const todayTotalPoints = pcSearch.pointProgress + 
                           mobileSearch.pointProgress + 
                           (dailyTasksCompleted > 0 ? dailyTasksPoints : 0) + 
                           (moreActivitiesCompleted > 0 ? moreActivitiesPoints : 0) + 
                           (readProgress ? readProgress.progress : 0)
    
    const todayMaxPoints = pcSearch.pointProgressMax + 
                          mobileSearch.pointProgressMax + 
                          dailyTasksPoints + 
                          moreActivitiesPoints + 
                          (readProgress ? readProgress.max : 0)
    
    // 今日积分统计
    message += `📈 **今日积分统计**: ${todayTotalPoints}/${todayMaxPoints} 积分\n\n`
    
    // 各项任务进度
    message += `📊 桌面端搜索: ${generateProgressBar(pcSearch.pointProgress, pcSearch.pointProgressMax)} ${generatePercentage(pcSearch.pointProgress, pcSearch.pointProgressMax)}% (${pcSearch.pointProgress}/${pcSearch.pointProgressMax})\n`;
    message += `📊 移动端搜索: ${generateProgressBar(mobileSearch.pointProgress, mobileSearch.pointProgressMax)} ${generatePercentage(mobileSearch.pointProgress, mobileSearch.pointProgressMax)}% (${mobileSearch.pointProgress}/${mobileSearch.pointProgressMax})\n`;
    message += `📊 每日活动: ${generateProgressBar(dailyTasksCompleted > 0 ? dailyTasksPoints : 0, dailyTasksPoints)} ${generatePercentage(dailyTasksCompleted > 0 ? dailyTasksPoints : 0, dailyTasksPoints)}% (${dailyTasksCompleted > 0 ? dailyTasksPoints : 0}/${dailyTasksPoints})\n`;
    message += `📊 更多活动: ${generateProgressBar(moreActivitiesCompleted > 0 ? moreActivitiesPoints : 0, moreActivitiesPoints)} ${generatePercentage(moreActivitiesCompleted > 0 ? moreActivitiesPoints : 0, moreActivitiesPoints)}% (${moreActivitiesCompleted > 0 ? moreActivitiesPoints : 0}/${moreActivitiesPoints})\n`;
    // 阅读赚积分
    if (readProgress) {
        message += `📊 阅读赚积分: ${generateProgressBar(readProgress.progress, readProgress.max)} ${generatePercentage(readProgress.progress, readProgress.max)}% (${readProgress.progress}/${readProgress.max})\n`;
    } else {
        message += `📊 阅读赚积分: x/x 获取失败\n`;
    }
    // 今日总计
    message += `📊 今日总计: ${generateProgressBar(todayTotalPoints, todayMaxPoints)} ${generatePercentage(todayTotalPoints, todayMaxPoints)}% (${todayTotalPoints}/${todayMaxPoints})\n\n`;
    // 已完成和待完成项目
    const completedItems = [];
    const pendingItems = [];
    if (pcSearch.pointProgress >= pcSearch.pointProgressMax && pcSearch.pointProgressMax > 0) completedItems.push('桌面端搜索');
    else if (pcSearch.pointProgressMax > 0) pendingItems.push('桌面端搜索');
    if (mobileSearch.pointProgress >= mobileSearch.pointProgressMax && mobileSearch.pointProgressMax > 0) completedItems.push('移动端搜索');
    else if (mobileSearch.pointProgressMax > 0) pendingItems.push('移动端搜索');
    if (dailyTasksCompleted === dailyTasksTotal && dailyTasksTotal > 0) completedItems.push('每日活动');
    else if (dailyTasksTotal > 0) pendingItems.push('每日活动');
    if (moreActivitiesCompleted === moreActivitiesTotal && moreActivitiesTotal > 0) completedItems.push('更多活动');
    else if (moreActivitiesTotal > 0) pendingItems.push('更多活动');
    if (readProgress && readProgress.progress >= readProgress.max && readProgress.max > 0) completedItems.push('阅读赚积分');
    else if (readProgress && readProgress.max > 0) pendingItems.push('阅读赚积分');
    // 任务完成状态
    if (completedItems.length > 0) {
        message += `✅ **已完成**: ${completedItems.join(', ')}\n`;
    }
    message += '---------------------------------------------------------------\n';
    if (pendingItems.length > 0) {
        message += `❌ **待完成**: ${pendingItems.join(', ')}\n`;
    } else {
        message += `❌ **待完成**: \n`;
    }
    message += '---------------------------------------------------------------\n';
    // 每日活动明细
    message += `📋 **每日活动**:\n`;
    todayTasks.forEach((task: any) => {
        const status = task.complete ? '✅' : '❌';
        const points = task.pointProgressMax || 0;
        const title = (task.title || '未知任务') + '';
        const date = (timeStr.split(' ')[0]) + '';
        const progress = `${task.pointProgress || points}/${points}`;
        message += `${status} ${escapeMarkdown(title || '')} (${points}积分) - ${date} -  📊 进度: ${progress}\n`;
    });
    message += '---------------------------------------------------------------\n';
    // 更多活动明细
    message += `📋 **更多活动**: ${moreActivitiesTotal} 个活动--🎯 总积分: ${moreActivitiesPoints} ✅ 已完成: ${moreActivitiesCompleted}/${moreActivitiesTotal}\n`;
    allMoreActivities.forEach((activity: any) => {
        const status = activity.complete ? '✅' : '❌';
        const points = activity.pointProgressMax || 0;
        const date = (activity.date || timeStr.split(' ')[0]) + '';
        const progress = `${activity.pointProgress || points}/${points}`;
        const title = (activity.title || '未知任务') + '';
        message += `${status} ${escapeMarkdown(title || '')} (${points}积分) - ${date} -📊 进度: ${progress}\n`;
    });
    return message;
}
