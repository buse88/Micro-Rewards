import axios from 'axios'

// 获取真实阅读赚积分进度（使用正确的API调用方式）
async function getReadProgressFromAPI(accessToken: string, geoLocale?: string, config?: any): Promise<{ progress: number, max: number } | null> {
    try {
        if (!accessToken) {
            console.log('[提示] 未获取到accessToken，无法获取阅读赚积分。')
            return null
        }

        if (config?.enableDebugLog) console.log('[debug] 开始获取阅读赚积分进度...')
        if (config?.enableDebugLog) console.log('[debug] accessToken长度:', accessToken.length)
        if (config?.enableDebugLog) console.log('[debug] geoLocale:', geoLocale)

        // 尝试多个地区配置，因为阅读积分可能在不同地区可用
        const regionsToTry = ['cn', 'us', 'en-us', geoLocale || 'cn'].filter((r, i, arr) => arr.indexOf(r) === i)
        
        for (const region of regionsToTry) {
            try {
                if (config?.enableDebugLog) console.log(`[debug] 尝试地区 ${region} 获取阅读积分信息...`)
                
                const readToEarnRequest = {
                    url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613',
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'X-Rewards-Country': region,
                        'X-Rewards-Language': 'en',
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36'
                    }
                }

                if (config?.enableDebugLog) console.log('[debug] 发送阅读积分API请求:', readToEarnRequest.url)
                const readToEarnResponse = await axios(readToEarnRequest)
                const readToEarnData = readToEarnResponse.data.response
                if (config?.enableDebugLog) console.log('[debug] 阅读积分API响应:', JSON.stringify(readToEarnData, null, 2))
                
                // 查找阅读赚积分活动 - 支持多种offerid格式
                const readToEarnActivity = readToEarnData.promotions?.find((x: any) => 
                    (x.attributes?.offerid === 'ENUS_readarticle3_30points' || 
                     x.attributes?.offerid === 'CN_readarticle3_30points' ||
                     x.attributes?.offerid === 'ZH_readarticle3_30points' ||
                     x.attributes?.offerid === 'readarticle3_30points') && 
                    x.attributes?.type === 'msnreadearn'
                )
                
                if (readToEarnActivity) {
                    const currentPoints = Number(readToEarnActivity.attributes.pointprogress) || 0
                    const maxPoints = Number(readToEarnActivity.attributes.pointmax) || 30
                    const remainingPoints = maxPoints - currentPoints
                    
                    if (config?.enableDebugLog) console.log(`[debug] 阅读赚积分获取成功 (地区: ${region}):`, { current: currentPoints, max: maxPoints, remaining: remainingPoints })
                    if (config?.enableDebugLog) console.log('[debug] 找到的活动详情:', {
                        offerid: readToEarnActivity.attributes.offerid,
                        type: readToEarnActivity.attributes.type,
                        pointprogress: readToEarnActivity.attributes.pointprogress,
                        pointmax: readToEarnActivity.attributes.pointmax
                    })
                    if (config?.enableDebugLog) console.log(`[debug] 匹配到的offerid: ${readToEarnActivity.attributes.offerid}`)
                    return { progress: currentPoints, max: maxPoints }
                } else {
                    if (config?.enableDebugLog) console.log(`[debug] 地区 ${region} 未找到阅读赚积分活动`)
                    if (config?.enableDebugLog) console.log('[debug] 可用的promotions:', readToEarnData.promotions?.map((p: any) => ({ 
                        offerid: p.attributes?.offerid, 
                        type: p.attributes?.type,
                        pointprogress: p.attributes?.pointprogress,
                        pointmax: p.attributes?.pointmax
                    })))
                }
            } catch (error: any) {
                if (config?.enableDebugLog) console.log(`[debug] 地区 ${region} 获取阅读积分失败:`, error.message)
            }
        }
        
        if (config?.enableDebugLog) console.log('[debug] 所有地区都未找到阅读赚积分活动')
        return null
    } catch (error: any) {
        console.error('[debug] 获取阅读赚积分信息失败:', error.message)
        return null
    }
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
function escapeMarkdown(text: string): string {
    // 只转义真正的Markdown特殊字符，避免过度转义
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, (match) => {
        // 不转义括号、点号等常见字符
        if (match === '(' || match === ')' || match === '.' || match === '@') {
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
        readProgress = await getReadProgressFromAPI(accessToken, accountRegion, config)
    }
    
    // 构建消息
    let message = `🤖 **微软积分机器人任务报告**\n\n`
    message += `📅 **执行时间**: ${escapeMarkdown(timeStr)}\n`
    message += `📧 **账户**: ${escapeMarkdown(maskedEmail)}\n\n`
    
    message += regionInfo
    
    // 积分信息
    message += `💰 **积分信息**\n`
    message += `• 可用积分: **${availablePoints.toLocaleString()}**\n`
    message += `• 总积分: **${lifetimePoints.toLocaleString()}**\n`
    if (redeemedPoints > 0) {
        message += `• 已兑换: **${redeemedPoints.toLocaleString()}**\n`
    }
    if (levelName) {
        message += `• 等级: **${escapeMarkdown(levelName)}**\n`
    }
    message += `\n`
    
    // 今日积分统计（新增详细统计）
    message += `📈 **今日积分统计**\n`
    message += `• PC搜索: **${pcSearch.pointProgress}**/${pcSearch.pointProgressMax} 积分\n`
    message += `• 移动搜索: **${mobileSearch.pointProgress}**/${mobileSearch.pointProgressMax} 积分\n`
    message += `• 每日任务: **${dailyTasksCompleted > 0 ? dailyTasksPoints : 0}**/${dailyTasksPoints} 积分\n`
    message += `• 更多活动: **${moreActivitiesCompleted > 0 ? moreActivitiesPoints : 0}**/${moreActivitiesPoints} 积分\n`
    message += `• 阅读赚积分: **${readProgress ? readProgress.progress : 0}**/${readProgress ? readProgress.max : 0} 积分\n`
    
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
    
    message += `• **今日总计**: **${todayTotalPoints}**/${todayMaxPoints} 积分\n`
    message += `• 完成进度: ${generateProgressBar(todayTotalPoints, todayMaxPoints)} ${generatePercentage(todayTotalPoints, todayMaxPoints)}\n\n`
    
    // 搜索积分
    message += `🔍 **搜索积分**\n`
    message += `• PC搜索: ${pcSearch.pointProgress}/${pcSearch.pointProgressMax} ${generateProgressBar(pcSearch.pointProgress, pcSearch.pointProgressMax)} ${generatePercentage(pcSearch.pointProgress, pcSearch.pointProgressMax)}\n`
    message += `• 移动搜索: ${mobileSearch.pointProgress}/${mobileSearch.pointProgressMax} ${generateProgressBar(mobileSearch.pointProgress, mobileSearch.pointProgressMax)} ${generatePercentage(mobileSearch.pointProgress, mobileSearch.pointProgressMax)}\n\n`
    
    // 每日任务
    message += `📋 **每日任务** (${dailyTasksCompleted}/${dailyTasksTotal})\n`
    message += `• 完成进度: ${generateProgressBar(dailyTasksCompleted, dailyTasksTotal)} ${generatePercentage(dailyTasksCompleted, dailyTasksTotal)}\n`
    message += `• 积分奖励: **${dailyTasksPoints}**\n\n`
    
    // 更多活动
    message += `🎯 **更多活动** (${moreActivitiesCompleted}/${moreActivitiesTotal})\n`
    message += `• 完成进度: ${generateProgressBar(moreActivitiesCompleted, moreActivitiesTotal)} ${generatePercentage(moreActivitiesCompleted, moreActivitiesTotal)}\n`
    message += `• 积分奖励: **${moreActivitiesPoints}**\n\n`
    
    // 阅读赚积分
    if (readProgress) {
        message += `📖 **阅读赚积分**\n`
        message += `• 进度: ${readProgress.progress}/${readProgress.max} ${generateProgressBar(readProgress.progress, readProgress.max)} ${generatePercentage(readProgress.progress, readProgress.max)}\n`
        message += `• 剩余: **${readProgress.max - readProgress.progress}** 积分\n\n`
    }
    
    // 任务执行结果
    if (taskSummary) {
        message += `📊 **本次执行结果**\n`
        message += `• 开始积分: **${taskSummary.startPoints}**\n`
        message += `• 结束积分: **${taskSummary.endPoints}**\n`
        message += `• 获得积分: **${taskSummary.pointsGained}**\n`
        message += `• 执行时间: **${Math.round(taskSummary.executionTime / 1000)}秒**\n`
        
        if (taskSummary.dailyCheckInResult) {
            if (taskSummary.dailyCheckInResult.success) {
                message += `• 每日签到: ✅ **${taskSummary.dailyCheckInResult.pointsGained}** 积分\n`
            } else {
                message += `• 每日签到: ❌ ${escapeMarkdown(taskSummary.dailyCheckInResult.message)}\n`
            }
        }
        message += `\n`
    }
    
    message += `🎉 **任务完成！** 继续保持每日签到，积少成多！`
    
    return message
} 