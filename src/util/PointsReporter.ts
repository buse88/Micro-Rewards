import { AxiosRequestConfig } from 'axios'
import { sendNotification } from './Webhook'
import { loadConfig } from './Load'
import AxiosClient from './Axios'
import { ChineseMessages } from './ChineseMessages'
import { Config } from '../interface/Config'

export interface PointsInfo {
    availablePoints: number
    lifetimePoints: number
    lifetimePointsRedeemed: number
    userLevel: string
    userLevelName: string
    dailyPoints: {
        desktop: number
        mobile: number
        total: number
    }
    searchProgress: {
        desktop: {
            current: number
            max: number
            remaining: number
        }
        mobile: {
            current: number
            max: number
            remaining: number
        }
    }
    readToEarn: {
        current: number
        max: number
        remaining: number
    }
    dailyTasks: {
        dailySet: {
            total: number
            completed: number
            remaining: number
            tasks: Array<{
                name: string
                points: number
                status: 'completed' | 'incomplete'
                date: string
            }>
        }
        activities: {
            current: number
            max: number
            remaining: number
            tasks: Array<{
                name: string
                points: number
                status: 'completed' | 'incomplete'
                type: string
            }>
        }
        totalDaily: {
            current: number
            max: number
            remaining: number
        }
    }
}

export class PointsReporter {
    private axios: AxiosClient
    private config: Config

    constructor(axios: AxiosClient, config?: Config) {
        this.axios = axios
        this.config = config || loadConfig()
    }

    /**
     * 获取用户积分信息
     */
    async getPointsInfo(accessToken?: string): Promise<PointsInfo | null> {
        try {
            // 获取用户信息 - 使用CN地区的接口
            const userInfoRequest: AxiosRequestConfig = {
                url: 'https://rewards.bing.com/api/getuserinfo?type=1',
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Accept': 'application/json, text/plain, */*'
                }
            }

            const userResponse = await this.axios.request(userInfoRequest)
            
            // 检查API响应结构
            if (!userResponse.data || !userResponse.data.dashboard) {
                console.error('API响应格式错误:', userResponse.data)
                return null
            }
            
            const userData = userResponse.data.dashboard
            
            // 检查userStatus是否存在
            if (!userData.userStatus) {
                console.error('API响应中缺少userStatus字段:', userData)
                return null
            }

            // 解析积分信息
            const pointsInfo: PointsInfo = {
                availablePoints: userData.userStatus.availablePoints || 0,
                lifetimePoints: userData.userStatus.lifetimePoints || 0,
                lifetimePointsRedeemed: userData.userStatus.lifetimePointsRedeemed || 0,
                userLevel: userData.userStatus.levelInfo?.activeLevel || 'Level1',
                userLevelName: userData.userStatus.levelInfo?.activeLevelName || '1 级',
                dailyPoints: {
                    desktop: 0,
                    mobile: 0,
                    total: 0
                },
                searchProgress: {
                    desktop: {
                        current: 0,
                        max: 0,
                        remaining: 0
                    },
                    mobile: {
                        current: 0,
                        max: 0,
                        remaining: 0
                    }
                },
                readToEarn: {
                    current: 0,
                    max: 0,
                    remaining: 0
                },
                dailyTasks: {
                    dailySet: {
                        total: 0,
                        completed: 0,
                        remaining: 0,
                        tasks: []
                    },
                    activities: {
                        current: 0,
                        max: 0,
                        remaining: 0,
                        tasks: []
                    },
                    totalDaily: {
                        current: 0,
                        max: 0,
                        remaining: 0
                    }
                }
            }

            // 解析搜索积分进度
            if (userData.counters?.pcSearch && userData.counters.pcSearch.length > 0) {
                const pcSearch = userData.counters.pcSearch[0]
                pointsInfo.searchProgress.desktop = {
                    current: pcSearch.pointProgress || 0,
                    max: pcSearch.pointProgressMax || 0,
                    remaining: (pcSearch.pointProgressMax || 0) - (pcSearch.pointProgress || 0)
                }
                pointsInfo.dailyPoints.desktop = pcSearch.pointProgress || 0
            }

            if (userData.counters?.mobileSearch && userData.counters.mobileSearch.length > 0) {
                const mobileSearch = userData.counters.mobileSearch[0]
                pointsInfo.searchProgress.mobile = {
                    current: mobileSearch.pointProgress || 0,
                    max: mobileSearch.pointProgressMax || 0,
                    remaining: (mobileSearch.pointProgressMax || 0) - (mobileSearch.pointProgress || 0)
                }
                pointsInfo.dailyPoints.mobile = mobileSearch.pointProgress || 0
            }

            // 解析今日任务集 - 使用CN地区的dailySetPromotions，并改进去重逻辑
            const today = new Date();
            const todayStr = [
                String(today.getMonth() + 1).padStart(2, '0'),
                String(today.getDate()).padStart(2, '0'),
                today.getFullYear()
            ].join('/');

            const dailySetTasks: Array<{
                name: string
                points: number
                status: 'completed' | 'incomplete'
                date: string
            }> = []
            let totalDailySetPoints = 0
            let completedDailySetPoints = 0

            // 用于每日任务集去重的Set
            const dailySetSeen = new Set<string>()

            // 确保dailySetPromotions存在且是对象
            if (userData.dailySetPromotions && typeof userData.dailySetPromotions === 'object') {
                for (const [date, tasks] of Object.entries(userData.dailySetPromotions)) {
                    // 只统计今天的每日任务
                    if (date !== todayStr) continue;
                    if (!Array.isArray(tasks)) continue;
                    for (const task of tasks) {
                        // 使用offerId或title作为去重键
                        const uniqueKey = task.offerId || task.title || task.name || ''
                        if (dailySetSeen.has(uniqueKey)) {
                            console.log(`[DEBUG] 每日任务集去重: 跳过重复任务 ${uniqueKey}`)
                            continue
                        }
                        dailySetSeen.add(uniqueKey)
                        
                        const taskPoints = task.pointProgressMax || 0
                        const isCompleted = task.complete || false
                        dailySetTasks.push({
                            name: ChineseMessages[task.title] || task.title || '未知任务',
                            points: taskPoints,
                            status: isCompleted ? 'completed' : 'incomplete',
                            date: date
                        })
                        totalDailySetPoints += taskPoints
                        if (isCompleted) {
                            completedDailySetPoints += taskPoints
                        }
                    }
                }
            }

            pointsInfo.dailyTasks.dailySet = {
                total: totalDailySetPoints,
                completed: completedDailySetPoints,
                remaining: totalDailySetPoints - completedDailySetPoints,
                tasks: dailySetTasks
            }

            // 解析更多促销活动（不再混入每日任务集）- 改进去重逻辑
            if (userData.morePromotionsWithoutPromotionalItems && Array.isArray(userData.morePromotionsWithoutPromotionalItems)) {
                const morePromotionsTasks: Array<{
                    name: string
                    points: number
                    status: 'completed' | 'incomplete'
                    type: string
                    offerid?: string
                    id?: string
                }> = []
                let totalMorePromotionsPoints = 0
                let completedMorePromotionsPoints = 0
                
                // 用于去重的Map，按标题分组
                const titleGroups = new Map<string, Array<{
                    promotion: any,
                    points: number,
                    isCompleted: boolean,
                    offerId: string,
                    id: string
                }>>()
                
                // 获取API时间戳来确定正确的星期
                let todayWeekday = 'Unknown'
                
                // 尝试从签到API响应中获取时间戳
                if (userData.lastOrder?.timestamp) {
                    // 使用API返回的时间戳
                    const apiTime = new Date(userData.lastOrder.timestamp)
                    todayWeekday = apiTime.toLocaleDateString('en-US', { weekday: 'long' })
                } else {
                    // 如果没有API时间戳，使用本地时间
                    todayWeekday = new Date().toLocaleDateString('en-US', { weekday: 'long' })
                }
                
                // 更好的方法：使用UTC时间来确定星期，避免时区问题
                const utcNow = new Date()
                const utcWeekday = utcNow.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
                
                // 使用UTC时间作为主要判断依据
                todayWeekday = utcWeekday
                
                // 先按星期筛选，再按标题分组
                for (const promotion of userData.morePromotionsWithoutPromotionalItems) {
                    const nameStr = promotion.name || promotion.offerId || '';
                    const parts = nameStr.split('_');
                    const lastPart = parts[parts.length - 1].toLowerCase();
                    const todayWeekdayLower = todayWeekday.toLowerCase();
                    
                    if (promotion.title === 'Do you know the answer?') {
                    }
                    
                    // 按星期筛选
                    if (lastPart !== todayWeekdayLower) continue;
                    
                    const promotionPoints = promotion.pointProgressMax || 0
                    const isCompleted = promotion.complete || false
                    const promotionName = promotion.title || promotion.name || '未知任务'
                    
                    // 按标题分组
                    if (!titleGroups.has(promotionName)) {
                        titleGroups.set(promotionName, [])
                    }
                    titleGroups.get(promotionName)!.push({
                        promotion,
                        points: promotionPoints,
                        isCompleted,
                        offerId: promotion.offerId,
                        id: promotion.id
                    })
                }
                
                // 处理分组后的活动，同名活动只显示一个
                for (const [title, group] of titleGroups) {
                    // 对于同名活动，选择积分最高的那个，如果积分相同则选择已完成的那个
                    const bestActivity = group.reduce((best, current) => {
                        if (current.points > best.points) return current
                        if (current.points === best.points && current.isCompleted && !best.isCompleted) return current
                        return best
                    })
                    
                    const promotionName = ChineseMessages[title] || title || '未知任务'
                    
                    morePromotionsTasks.push({
                        name: promotionName,
                        points: bestActivity.points,
                        status: (bestActivity.isCompleted ? 'completed' : 'incomplete') as 'completed' | 'incomplete',
                        type: bestActivity.promotion.promotionType || 'morePromotions',
                        offerid: bestActivity.offerId,
                        id: bestActivity.id
                    })
                    
                    totalMorePromotionsPoints += bestActivity.points
                    if (bestActivity.isCompleted) {
                        completedMorePromotionsPoints += bestActivity.points
                    }
                }
                
                pointsInfo.dailyTasks.activities = {
                    current: completedMorePromotionsPoints,
                    max: totalMorePromotionsPoints,
                    remaining: totalMorePromotionsPoints - completedMorePromotionsPoints,
                    tasks: morePromotionsTasks
                }
                pointsInfo.dailyTasks.activities.tasks = morePromotionsTasks
            }

            // 阅读积分通过原作者的方式获取
            if (accessToken) {
                try {
                    const geoLocale = userData.userProfile?.attributes?.country || 'us'
                    const readToEarnRequest: AxiosRequestConfig = {
                        url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613',
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'X-Rewards-Country': geoLocale,
                            'X-Rewards-Language': 'en'
                        }
                    }

                    const readToEarnResponse = await this.axios.request(readToEarnRequest)
                    const readToEarnData = readToEarnResponse.data.response
                    
                    // 查找阅读赚积分活动
                    const readToEarnActivity = readToEarnData.promotions?.find((x: any) => 
                        x.attributes?.offerid === 'ENUS_readarticle3_30points' && 
                        x.attributes?.type === 'msnreadearn'
                    )

                    if (readToEarnActivity) {
                        const maxPoints = parseInt(readToEarnActivity.attributes.pointmax || '0')
                        const currentPoints = parseInt(readToEarnActivity.attributes.pointprogress || '0')
                        const remainingPoints = maxPoints - currentPoints

                        pointsInfo.readToEarn = {
                            current: currentPoints,
                            max: maxPoints,
                            remaining: Math.max(0, remainingPoints)
                        }
                    } else {
                        // 如果没有找到阅读积分活动，设置为默认值
                        pointsInfo.readToEarn = {
                            current: 0,
                            max: 30,
                            remaining: 30
                        }
                    }
                } catch (error) {
                    console.error('获取阅读赚积分信息失败:', error)
                    // 如果获取失败，设置为默认值
                    pointsInfo.readToEarn = {
                        current: 0,
                        max: 30,
                        remaining: 30
                    }
                }
            } else {
                // 如果没有accessToken，设置为默认值
                pointsInfo.readToEarn = {
                    current: 0,
                    max: 30,
                    remaining: 30
                }
            }

            // 计算总积分
            pointsInfo.dailyPoints.total = pointsInfo.dailyPoints.desktop + pointsInfo.dailyPoints.mobile

            // 计算每日总积分
            const totalDailyCurrent = pointsInfo.dailyPoints.total + 
                                    pointsInfo.dailyTasks.activities.current + 
                                    pointsInfo.dailyTasks.dailySet.completed +
                                    pointsInfo.readToEarn.current

            const totalDailyMax = pointsInfo.searchProgress.desktop.max + 
                                 pointsInfo.searchProgress.mobile.max + 
                                 pointsInfo.dailyTasks.activities.max + 
                                 pointsInfo.dailyTasks.dailySet.total +
                                 pointsInfo.readToEarn.max

            pointsInfo.dailyTasks.totalDaily = {
                current: totalDailyCurrent,
                max: totalDailyMax,
                remaining: totalDailyMax - totalDailyCurrent
            }

            return pointsInfo
        } catch (error) {
            console.error('获取积分信息失败:', error)
            return null
        }
    }

    /**
     * 格式化积分信息为消息
     */
    public formatPointsMessage(
        pointsInfo: PointsInfo, 
        accountEmail: string, 
        extraInfo?: { 
            accountCountry?: string, 
            checkInCountry?: string, 
            readCountry?: string,
            searchCountry?: string,
            taskSummary?: {
                startPoints: number
                endPoints: number
                pointsGained: number
                dailyCheckInResult?: { success: boolean, pointsGained: number, message: string }
                executionTime?: number
                isMobile?: boolean
            }
        }
    ): string {
        // 邮箱脱敏
        const maskedEmail = this.maskEmail(accountEmail)
        const currentTime = new Date().toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        })
        let regionInfo = ''
        if (extraInfo) {
            regionInfo = `🌏 **地区信息**\n` +
                `• 账号地区: ${extraInfo.accountCountry || '-'}\n` +
                `• 搜索地区: ${extraInfo.searchCountry || '-'}\n` +
                `• 签到地区: ${extraInfo.checkInCountry || '-'}\n` +
                `• 阅读地区: ${extraInfo.readCountry || '-'}\n\n`
        }

        // 构建基础积分报告
        let message = `🔔 **Microsoft Rewards 积分报告**\n\n` +
            `📧 **账户**: ${maskedEmail}\n` +
            `⏰ **时间**: ${currentTime}\n\n` +
            regionInfo +
            `💰 **积分概览**\n` +
            `• 可用积分: ${pointsInfo.availablePoints.toLocaleString()}\n` +
            `• 累计积分: ${pointsInfo.lifetimePoints.toLocaleString()}\n` +
            `• 已兑换积分: ${pointsInfo.lifetimePointsRedeemed.toLocaleString()}\n` +
            `• 用户等级: ${pointsInfo.userLevelName} (${pointsInfo.userLevel})\n\n` +
            `\n📈 **今日积分统计**: ${pointsInfo.dailyTasks.totalDaily.current}/${pointsInfo.dailyTasks.totalDaily.max} 积分\n\n` +
            `${this.getProgressBar(pointsInfo.searchProgress.desktop.current, pointsInfo.searchProgress.desktop.max, '桌面端搜索')}\n` +
            `${this.getProgressBar(pointsInfo.searchProgress.mobile.current, pointsInfo.searchProgress.mobile.max, '移动端搜索')}\n` +
            `${this.getProgressBar(pointsInfo.dailyTasks.dailySet.completed, pointsInfo.dailyTasks.dailySet.total, '每日任务集')}\n` +
            `${this.getProgressBar(pointsInfo.dailyTasks.activities.current, pointsInfo.dailyTasks.activities.max, '活动和问答')}\n` +
            `${this.getProgressBar(pointsInfo.readToEarn.current, pointsInfo.readToEarn.max, '阅读赚积分')}\n` +
            `${this.getProgressBar(pointsInfo.dailyTasks.totalDaily.current, pointsInfo.dailyTasks.totalDaily.max, '今日总计')}\n\n` +
            `${this.getDetailedTaskStatus(pointsInfo, false)}`

        // 如果有任务完成信息，添加到报告末尾
        if (extraInfo?.taskSummary) {
            const summary = extraInfo.taskSummary
            const platformText = summary.isMobile ? '📱 移动端' : '💻 桌面端'
            
            const executionTimeInfo = summary.executionTime 
                ? `⏱️ **执行时间**: ${Math.round(summary.executionTime / 1000)}秒\n`
                : ''

            const dailyCheckInInfo = summary.dailyCheckInResult 
                ? `📅 **每日签到**: ${summary.dailyCheckInResult.success ? '✅ 成功' : '⏳ 已完成'} (${summary.dailyCheckInResult.pointsGained}积分) - ${summary.dailyCheckInResult.message}\n`
                : '📅 **每日签到**: 未执行\n'

            message += `\n\n🎯 **本次任务执行结果**\n` +
                `${platformText}\n` +
                `💰 **积分变化**: ${summary.startPoints.toLocaleString()} → ${summary.endPoints.toLocaleString()} (+${summary.pointsGained.toLocaleString()})\n` +
                `${executionTimeInfo}${dailyCheckInInfo}` +
                `✅ **任务执行完成！**`
        }

        return message
    }

    /**
     * 生成进度条
     */
    private getProgressBar(current: number, max: number, label: string): string {
        if (max === 0) return `📊 ${label}: 无数据`
        
        const percentage = Math.round((current / max) * 100)
        const filledBlocks = Math.round(percentage / 10)
        const emptyBlocks = 10 - filledBlocks
        
        const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks)
        return `📊 ${label}: ${progressBar} ${percentage}% (${current}/${max})`
    }

    /**
     * 获取详细任务状态
     */
    private getDetailedTaskStatus(pointsInfo: PointsInfo, forConsole = false): string {
        const desktopCompleted = pointsInfo.searchProgress.desktop.remaining === 0
        const mobileCompleted = pointsInfo.searchProgress.mobile.remaining === 0
        const dailySetCompleted = pointsInfo.dailyTasks.dailySet.remaining === 0
        const activitiesCompleted = pointsInfo.dailyTasks.activities.remaining === 0
        const readToEarnCompleted = pointsInfo.readToEarn.remaining === 0
        
        const completedTasks = []
        const incompleteTasks = []
        
        if (desktopCompleted) completedTasks.push('桌面端搜索')
        else incompleteTasks.push('桌面端搜索')
        
        if (mobileCompleted) completedTasks.push('移动端搜索')
        else incompleteTasks.push('移动端搜索')
        
        if (dailySetCompleted) completedTasks.push('每日任务集')
        else incompleteTasks.push('每日任务集')
        
        if (activitiesCompleted) completedTasks.push('活动和问答')
        else incompleteTasks.push('活动和问答')
        
        if (readToEarnCompleted) completedTasks.push('阅读赚积分')
        else incompleteTasks.push('阅读赚积分')
        
        let status = ''
        
        if (completedTasks.length === 5) {
            status = '🎉 **今日所有任务已完成！**'
        } else if (completedTasks.length > 0) {
            status = `✅ **已完成**: ${completedTasks.join(', ')}\n❌ **待完成**: ${incompleteTasks.join(', ')}`
        } else {
            status = '⏳ **所有任务进行中...**'
        }
        
        // 添加每日任务集详情
        if (pointsInfo.dailyTasks.dailySet.tasks.length > 0) {
            status += '\n\n📋 **每日任务集详情**:'
            for (const task of pointsInfo.dailyTasks.dailySet.tasks) {
                const statusIcon = task.status === 'completed' ? '✅' : '⏳'
                status += `\n${statusIcon} ${task.name} (${task.points}积分) - ${task.date}`
            }
        }
        // 仅forConsole时输出更多活动明细(调试)
        if (forConsole && pointsInfo.dailyTasks.activities.tasks && pointsInfo.dailyTasks.activities.tasks.length > 0) {
            status += '\n\n🎮 **更多活动明细(调试)**:'
            for (const task of pointsInfo.dailyTasks.activities.tasks) {
                const statusIcon = task.status === 'completed' ? '✅' : '⏳'
                status += `\n${statusIcon} ${task.name} (${task.points}积分) - ${task.type}`
            }
        }
        return status
    }

    /**
     * 发送积分报告到Telegram
     */
    async sendPointsReport(accountEmail: string, accessToken?: string): Promise<boolean> {
        try {
            const pointsInfo = await this.getPointsInfo(accessToken)
            
            if (!pointsInfo) {
                console.error('无法获取积分信息')
                return false
            }

            const message = this.formatPointsMessage(pointsInfo, accountEmail)
            const config = loadConfig()

            // 发送到Telegram
            await sendNotification(config, message)
            
            console.log('积分报告已发送到Telegram')
            return true

        } catch (error) {
            console.error('发送积分报告失败:', error)
            return false
        }
    }

    /**
     * 获取并发送积分报告（简化版本）
     */
    async reportPoints(accountEmail: string): Promise<void> {
        await this.sendPointsReport(accountEmail)
    }

    /**
     * 从DashboardData获取积分信息（原作者的方式）
     */
    async getPointsInfoFromDashboardData(data: any, accessToken?: string): Promise<PointsInfo | null> {
        try {
            // 解析积分信息
            const pointsInfo: PointsInfo = {
                availablePoints: data.userStatus?.availablePoints || 0,
                lifetimePoints: data.userStatus?.lifetimePoints || 0,
                lifetimePointsRedeemed: data.userStatus?.lifetimePointsRedeemed || 0,
                userLevel: data.userStatus?.levelInfo?.activeLevel || 'Level1',
                userLevelName: data.userStatus?.levelInfo?.activeLevelName || '1 级',
                dailyPoints: {
                    desktop: 0,
                    mobile: 0,
                    total: 0
                },
                searchProgress: {
                    desktop: {
                        current: 0,
                        max: 0,
                        remaining: 0
                    },
                    mobile: {
                        current: 0,
                        max: 0,
                        remaining: 0
                    }
                },
                readToEarn: {
                    current: 0,
                    max: 0,
                    remaining: 0
                },
                dailyTasks: {
                    dailySet: {
                        total: 0,
                        completed: 0,
                        remaining: 0,
                        tasks: []
                    },
                    activities: {
                        current: 0,
                        max: 0,
                        remaining: 0,
                        tasks: []
                    },
                    totalDaily: {
                        current: 0,
                        max: 0,
                        remaining: 0
                    }
                }
            }

            // 解析搜索积分进度
            if (data.userStatus?.counters?.pcSearch && data.userStatus.counters.pcSearch.length > 0) {
                const pcSearch = data.userStatus.counters.pcSearch[0]
                pointsInfo.searchProgress.desktop = {
                    current: pcSearch.pointProgress || 0,
                    max: pcSearch.pointProgressMax || 0,
                    remaining: (pcSearch.pointProgressMax || 0) - (pcSearch.pointProgress || 0)
                }
                pointsInfo.dailyPoints.desktop = pcSearch.pointProgress || 0
            }

            if (data.userStatus?.counters?.mobileSearch && data.userStatus.counters.mobileSearch.length > 0) {
                const mobileSearch = data.userStatus.counters.mobileSearch[0]
                pointsInfo.searchProgress.mobile = {
                    current: mobileSearch.pointProgress || 0,
                    max: mobileSearch.pointProgressMax || 0,
                    remaining: (mobileSearch.pointProgressMax || 0) - (mobileSearch.pointProgress || 0)
                }
                pointsInfo.dailyPoints.mobile = mobileSearch.pointProgress || 0
            }

            // 解析今日任务集
            const today = new Date();
            const todayStr = [
                String(today.getMonth() + 1).padStart(2, '0'),
                String(today.getDate()).padStart(2, '0'),
                today.getFullYear()
            ].join('/');

            const dailySetTasks: Array<{
                name: string
                points: number
                status: 'completed' | 'incomplete'
                date: string
            }> = []
            let totalDailySetPoints = 0
            let completedDailySetPoints = 0

            for (const [date, tasks] of Object.entries(data.dailySetPromotions)) {
                if (date !== todayStr) continue;
                if (!Array.isArray(tasks)) continue;
                for (const task of tasks) {
                    const taskPoints = task.pointProgressMax || 0
                    const isCompleted = task.complete || false
                    dailySetTasks.push({
                        name: ChineseMessages[task.title] || task.title || '未知任务',
                        points: taskPoints,
                        status: isCompleted ? 'completed' : 'incomplete',
                        date: date
                    })
                    totalDailySetPoints += taskPoints
                    if (isCompleted) {
                        completedDailySetPoints += taskPoints
                    }
                }
            }

            pointsInfo.dailyTasks.dailySet = {
                total: totalDailySetPoints,
                completed: completedDailySetPoints,
                remaining: totalDailySetPoints - completedDailySetPoints,
                tasks: dailySetTasks
            }

            // 解析更多促销活动
            if (data.morePromotionsWithoutPromotionalItems && Array.isArray(data.morePromotionsWithoutPromotionalItems)) {
                const morePromotionsTasks: Array<{
                    name: string
                    points: number
                    status: 'completed' | 'incomplete'
                    type: string
                }> = []

                let totalMorePromotionsPoints = 0
                let completedMorePromotionsPoints = 0

                for (const promotion of data.morePromotionsWithoutPromotionalItems) {
                    const promotionPoints = promotion.pointProgressMax || 0
                    const isCompleted = promotion.complete || false
                    const promotionName = promotion.title || promotion.name || '未知任务'

                    morePromotionsTasks.push({
                        name: ChineseMessages[promotionName] || promotionName || '未知任务',
                        points: promotionPoints,
                        status: isCompleted ? 'completed' : 'incomplete',
                        type: promotion.promotionType || 'morePromotions'
                    })

                    totalMorePromotionsPoints += promotionPoints
                    if (isCompleted) {
                        completedMorePromotionsPoints += promotionPoints
                    }
                }

                // 更新活动积分
                pointsInfo.dailyTasks.activities = {
                    current: completedMorePromotionsPoints,
                    max: totalMorePromotionsPoints,
                    remaining: totalMorePromotionsPoints - completedMorePromotionsPoints,
                    tasks: morePromotionsTasks
                }

                // 将更多活动任务添加到每日任务集中，用于显示详情
                pointsInfo.dailyTasks.dailySet.tasks.push(...morePromotionsTasks.map(task => ({
                    name: task.name,
                    points: task.points,
                    status: task.status,
                    date: '今日'
                })))
            }

            // 阅读积分通过原作者的方式获取
            if (accessToken) {
                try {
                    const geoLocale = data.userProfile?.attributes?.country || 'us'
                    const readToEarnRequest: AxiosRequestConfig = {
                        url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613',
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'X-Rewards-Country': geoLocale,
                            'X-Rewards-Language': 'en'
                        }
                    }

                    const readToEarnResponse = await this.axios.request(readToEarnRequest)
                    const readToEarnData = readToEarnResponse.data.response
                    
                    // 查找阅读赚积分活动
                    const readToEarnActivity = readToEarnData.promotions?.find((x: any) => 
                        x.attributes?.offerid === 'ENUS_readarticle3_30points' && 
                        x.attributes?.type === 'msnreadearn'
                    )

                    if (readToEarnActivity) {
                        const maxPoints = parseInt(readToEarnActivity.attributes.pointmax || '0')
                        const currentPoints = parseInt(readToEarnActivity.attributes.pointprogress || '0')
                        const remainingPoints = maxPoints - currentPoints

                        pointsInfo.readToEarn = {
                            current: currentPoints,
                            max: maxPoints,
                            remaining: Math.max(0, remainingPoints)
                        }
                    } else {
                        // 如果没有找到阅读积分活动，设置为默认值
                        pointsInfo.readToEarn = {
                            current: 0,
                            max: 30,
                            remaining: 30
                        }
                    }
                } catch (error) {
                    console.error('获取阅读赚积分信息失败:', error)
                    // 如果获取失败，设置为默认值
                    pointsInfo.readToEarn = {
                        current: 0,
                        max: 30,
                        remaining: 30
                    }
                }
            } else {
                // 如果没有accessToken，设置为默认值
                pointsInfo.readToEarn = {
                    current: 0,
                    max: 30,
                    remaining: 30
                }
            }

            // 计算总积分
            pointsInfo.dailyPoints.total = pointsInfo.dailyPoints.desktop + pointsInfo.dailyPoints.mobile

            // 计算每日总积分
            const totalDailyCurrent = pointsInfo.dailyPoints.total + 
                                    pointsInfo.dailyTasks.activities.current + 
                                    pointsInfo.dailyTasks.dailySet.completed +
                                    pointsInfo.readToEarn.current

            const totalDailyMax = pointsInfo.searchProgress.desktop.max + 
                                 pointsInfo.searchProgress.mobile.max + 
                                 pointsInfo.dailyTasks.activities.max + 
                                 pointsInfo.dailyTasks.dailySet.total +
                                 pointsInfo.readToEarn.max

            pointsInfo.dailyTasks.totalDaily = {
                current: totalDailyCurrent,
                max: totalDailyMax,
                remaining: totalDailyMax - totalDailyCurrent
            }

            // 调试打印更多活动明细
            this.printMorePromotionsDebugInfo(pointsInfo)

            return pointsInfo

        } catch (error) {
            console.error('从DashboardData获取积分信息失败:', error)
            return null
        }
    }

    /**
     * 统一通过API获取所有积分信息（主API+阅读API），并合并为PointsInfo结构
     */
    async getUnifiedPointsInfo(accessToken: string, country: string = 'us'): Promise<PointsInfo | null> {
        // 自动判断country
        let finalCountry = country
        if (this.config && this.config.searchSettings) {
            if (this.config.searchSettings.useGeoLocaleQueries) {
                if (this.config.searchSettings.preferredCountry && this.config.searchSettings.preferredCountry.length === 2) {
                    finalCountry = this.config.searchSettings.preferredCountry.toLowerCase()
                }
            }
        }
        try {
            // 1. 获取主积分信息 - 使用正确的认证和地区信息
            const userInfoRequest: AxiosRequestConfig = {
                url: 'https://rewards.bing.com/api/getuserinfo?type=1',
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Accept': 'application/json, text/plain, */*',
                    'Authorization': `Bearer ${accessToken}`,
                    'X-Rewards-Country': finalCountry,
                    'X-Rewards-Language': 'en'
                }
            }
            const userResponse = await this.axios.request(userInfoRequest)
            if (!userResponse.data || !userResponse.data.dashboard) {
                console.error('API响应格式错误:', userResponse.data)
                return null
            }
            const userData = userResponse.data.dashboard
            if (!userData.userStatus) {
                console.error('API响应中缺少userStatus字段:', userData)
                return null
            }

            // 调试打印关键数据字段
            console.log('[DEBUG] dashboard.userStatus:', !!userData.userStatus)
            console.log('[DEBUG] dashboard.userProfile.attributes:', !!userData.userProfile?.attributes)
            console.log('[DEBUG] dashboard.dailySetPromotions:', !!userData.dailySetPromotions)
            console.log('[DEBUG] dashboard.morePromotionsWithoutPromotionalItems:', !!userData.morePromotionsWithoutPromotionalItems)
            console.log('[DEBUG] dashboard.counters:', !!userData.counters)

            // 2. 获取阅读赚积分 - 使用正确的接口和参数
            let readToEarn = { current: 0, max: 0, remaining: 0 }
            if (accessToken) {
                try {
                    // 使用正确的地区参数
                    const geoLocale = userData.userProfile?.attributes?.country || finalCountry
                    const readToEarnRequest: AxiosRequestConfig = {
                        url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613',
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'X-Rewards-Country': geoLocale,
                            'X-Rewards-Language': 'en',
                            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36'
                        }
                    }
                    const readToEarnResponse = await this.axios.request(readToEarnRequest)
                    const readToEarnData = readToEarnResponse.data.response
                    
                    // 查找阅读赚积分活动 - 支持多种offerid格式
                    const readToEarnActivity = readToEarnData.promotions?.find((x: any) => 
                        (x.attributes?.offerid === 'ENUS_readarticle3_30points' || 
                         x.attributes?.offerid === 'CN_readarticle3_30points' ||
                         x.attributes?.type === 'msnreadearn') &&
                        x.attributes?.type === 'msnreadearn'
                    )

                    if (readToEarnActivity) {
                        const max = parseInt(readToEarnActivity.attributes.pointmax || '0')
                        const current = parseInt(readToEarnActivity.attributes.pointprogress || '0')
                        readToEarn = {
                            current,
                            max,
                            remaining: Math.max(0, max - current)
                        }
                        console.log('[DEBUG] 阅读赚积分获取成功:', readToEarn)
                    } else {
                        console.log('[DEBUG] 未找到阅读赚积分活动')
                    }
                } catch (e) {
                    console.error('获取阅读赚积分失败:', e)
                }
            }

            // 3. 组装PointsInfo结构（保持原有格式）
            const pointsInfo: PointsInfo = {
                availablePoints: userData.userStatus.availablePoints || 0,
                lifetimePoints: userData.userStatus.lifetimePoints || 0,
                lifetimePointsRedeemed: userData.userStatus.lifetimePointsRedeemed || 0,
                userLevel: userData.userStatus.levelInfo?.activeLevel || 'Level1',
                userLevelName: userData.userStatus.levelInfo?.activeLevelName || '1 级',
                dailyPoints: {
                    desktop: 0,
                    mobile: 0,
                    total: 0
                },
                searchProgress: {
                    desktop: { current: 0, max: 0, remaining: 0 },
                    mobile: { current: 0, max: 0, remaining: 0 }
                },
                readToEarn,
                dailyTasks: {
                    dailySet: { total: 0, completed: 0, remaining: 0, tasks: [] },
                    activities: { current: 0, max: 0, remaining: 0, tasks: [] },
                    totalDaily: { current: 0, max: 0, remaining: 0 }
                }
            }

            // 搜索积分 - 使用dashboard.counters
            if (userData.counters?.pcSearch && userData.counters.pcSearch.length > 0) {
                const pcSearch = userData.counters.pcSearch[0]
                pointsInfo.searchProgress.desktop = {
                    current: pcSearch.pointProgress || 0,
                    max: pcSearch.pointProgressMax || 0,
                    remaining: (pcSearch.pointProgressMax || 0) - (pcSearch.pointProgress || 0)
                }
                pointsInfo.dailyPoints.desktop = pcSearch.pointProgress || 0
            }
            if (userData.counters?.mobileSearch && userData.counters.mobileSearch.length > 0) {
                const mobileSearch = userData.counters.mobileSearch[0]
                pointsInfo.searchProgress.mobile = {
                    current: mobileSearch.pointProgress || 0,
                    max: mobileSearch.pointProgressMax || 0,
                    remaining: (mobileSearch.pointProgressMax || 0) - (mobileSearch.pointProgress || 0)
                }
                pointsInfo.dailyPoints.mobile = mobileSearch.pointProgress || 0
            }

            // 解析今日任务集 - 使用CN地区的dailySetPromotions，并改进去重逻辑
            const today = new Date();
            const todayStr = [
                String(today.getMonth() + 1).padStart(2, '0'),
                String(today.getDate()).padStart(2, '0'),
                today.getFullYear()
            ].join('/');

            const dailySetTasks: Array<{
                name: string
                points: number
                status: 'completed' | 'incomplete'
                date: string
            }> = []
            let totalDailySetPoints = 0
            let completedDailySetPoints = 0

            // 用于每日任务集去重的Set
            const dailySetSeen = new Set<string>()

            // 确保dailySetPromotions存在且是对象
            if (userData.dailySetPromotions && typeof userData.dailySetPromotions === 'object') {
                for (const [date, tasks] of Object.entries(userData.dailySetPromotions)) {
                    // 只统计今天的每日任务
                    if (date !== todayStr) continue;
                    if (!Array.isArray(tasks)) continue;
                    for (const task of tasks) {
                        // 使用offerId或title作为去重键
                        const uniqueKey = task.offerId || task.title || task.name || ''
                        if (dailySetSeen.has(uniqueKey)) {
                            console.log(`[DEBUG] 每日任务集去重: 跳过重复任务 ${uniqueKey}`)
                            continue
                        }
                        dailySetSeen.add(uniqueKey)
                        
                        const taskPoints = task.pointProgressMax || 0
                        const isCompleted = task.complete || false
                        dailySetTasks.push({
                            name: ChineseMessages[task.title] || task.title || '未知任务',
                            points: taskPoints,
                            status: isCompleted ? 'completed' : 'incomplete',
                            date: date
                        })
                        totalDailySetPoints += taskPoints
                        if (isCompleted) {
                            completedDailySetPoints += taskPoints
                        }
                    }
                }
            }

            pointsInfo.dailyTasks.dailySet = {
                total: totalDailySetPoints,
                completed: completedDailySetPoints,
                remaining: totalDailySetPoints - completedDailySetPoints,
                tasks: dailySetTasks
            }

            // 解析更多促销活动（不再混入每日任务集）- 改进去重逻辑
            if (userData.morePromotionsWithoutPromotionalItems && Array.isArray(userData.morePromotionsWithoutPromotionalItems)) {
                const morePromotionsTasks: Array<{
                    name: string
                    points: number
                    status: 'completed' | 'incomplete'
                    type: string
                    offerid?: string
                    id?: string
                }> = []
                let totalMorePromotionsPoints = 0
                let completedMorePromotionsPoints = 0
                
                // 用于去重的Map，按标题分组
                const titleGroups = new Map<string, Array<{
                    promotion: any,
                    points: number,
                    isCompleted: boolean,
                    offerId: string,
                    id: string
                }>>()
                
                // 获取API时间戳来确定正确的星期
                let todayWeekday = 'Unknown'
                
                // 尝试从签到API响应中获取时间戳
                if (userData.lastOrder?.timestamp) {
                    // 使用API返回的时间戳
                    const apiTime = new Date(userData.lastOrder.timestamp)
                    todayWeekday = apiTime.toLocaleDateString('en-US', { weekday: 'long' })
                } else {
                    // 如果没有API时间戳，使用本地时间
                    todayWeekday = new Date().toLocaleDateString('en-US', { weekday: 'long' })
                }
                
                // 更好的方法：使用UTC时间来确定星期，避免时区问题
                const utcNow = new Date()
                const utcWeekday = utcNow.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
                
                // 使用UTC时间作为主要判断依据
                todayWeekday = utcWeekday
                
                // 先按星期筛选，再按标题分组
                for (const promotion of userData.morePromotionsWithoutPromotionalItems) {
                    const nameStr = promotion.name || promotion.offerId || '';
                    const parts = nameStr.split('_');
                    const lastPart = parts[parts.length - 1].toLowerCase();
                    const todayWeekdayLower = todayWeekday.toLowerCase();
                    
                    if (promotion.title === 'Do you know the answer?') {
                    }
                    
                    // 按星期筛选
                    if (lastPart !== todayWeekdayLower) continue;
                    
                    const promotionPoints = promotion.pointProgressMax || 0
                    const isCompleted = promotion.complete || false
                    const promotionName = promotion.title || promotion.name || '未知任务'
                    
                    // 按标题分组
                    if (!titleGroups.has(promotionName)) {
                        titleGroups.set(promotionName, [])
                    }
                    titleGroups.get(promotionName)!.push({
                        promotion,
                        points: promotionPoints,
                        isCompleted,
                        offerId: promotion.offerId,
                        id: promotion.id
                    })
                }
                
                // 处理分组后的活动，同名活动只显示一个
                for (const [title, group] of titleGroups) {
                    // 对于同名活动，选择积分最高的那个，如果积分相同则选择已完成的那个
                    const bestActivity = group.reduce((best, current) => {
                        if (current.points > best.points) return current
                        if (current.points === best.points && current.isCompleted && !best.isCompleted) return current
                        return best
                    })
                    
                    const promotionName = ChineseMessages[title] || title || '未知任务'
                    
                    morePromotionsTasks.push({
                        name: promotionName,
                        points: bestActivity.points,
                        status: (bestActivity.isCompleted ? 'completed' : 'incomplete') as 'completed' | 'incomplete',
                        type: bestActivity.promotion.promotionType || 'morePromotions',
                        offerid: bestActivity.offerId,
                        id: bestActivity.id
                    })
                    
                    totalMorePromotionsPoints += bestActivity.points
                    if (bestActivity.isCompleted) {
                        completedMorePromotionsPoints += bestActivity.points
                    }
                }
                
                pointsInfo.dailyTasks.activities = {
                    current: completedMorePromotionsPoints,
                    max: totalMorePromotionsPoints,
                    remaining: totalMorePromotionsPoints - completedMorePromotionsPoints,
                    tasks: morePromotionsTasks
                }
                pointsInfo.dailyTasks.activities.tasks = morePromotionsTasks
            }

            // 阅读积分通过原作者的方式获取
            if (accessToken) {
                try {
                    const geoLocale = userData.userProfile?.attributes?.country || finalCountry
                    const readToEarnRequest: AxiosRequestConfig = {
                        url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613',
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'X-Rewards-Country': geoLocale,
                            'X-Rewards-Language': 'en'
                        }
                    }

                    const readToEarnResponse = await this.axios.request(readToEarnRequest)
                    const readToEarnData = readToEarnResponse.data.response
                    
                    // 查找阅读赚积分活动
                    const readToEarnActivity = readToEarnData.promotions?.find((x: any) => 
                        x.attributes?.offerid === 'ENUS_readarticle3_30points' && 
                        x.attributes?.type === 'msnreadearn'
                    )

                    if (readToEarnActivity) {
                        const maxPoints = parseInt(readToEarnActivity.attributes.pointmax || '0')
                        const currentPoints = parseInt(readToEarnActivity.attributes.pointprogress || '0')
                        const remainingPoints = maxPoints - currentPoints

                        pointsInfo.readToEarn = {
                            current: currentPoints,
                            max: maxPoints,
                            remaining: Math.max(0, remainingPoints)
                        }
                    } else {
                        // 如果没有找到阅读积分活动，设置为默认值
                        pointsInfo.readToEarn = {
                            current: 0,
                            max: 30,
                            remaining: 30
                        }
                    }
                } catch (error) {
                    console.error('获取阅读赚积分信息失败:', error)
                    // 如果获取失败，设置为默认值
                    pointsInfo.readToEarn = {
                        current: 0,
                        max: 30,
                        remaining: 30
                    }
                }
            } else {
                // 如果没有accessToken，设置为默认值
                pointsInfo.readToEarn = {
                    current: 0,
                    max: 30,
                    remaining: 30
                }
            }

            // 计算总积分
            pointsInfo.dailyPoints.total = pointsInfo.dailyPoints.desktop + pointsInfo.dailyPoints.mobile

            // 计算每日总积分
            const totalDailyCurrent = pointsInfo.dailyPoints.total + 
                                    pointsInfo.dailyTasks.activities.current + 
                                    pointsInfo.dailyTasks.dailySet.completed +
                                    pointsInfo.readToEarn.current

            const totalDailyMax = pointsInfo.searchProgress.desktop.max + 
                                 pointsInfo.searchProgress.mobile.max + 
                                 pointsInfo.dailyTasks.activities.max + 
                                 pointsInfo.dailyTasks.dailySet.total +
                                 pointsInfo.readToEarn.max

            pointsInfo.dailyTasks.totalDaily = {
                current: totalDailyCurrent,
                max: totalDailyMax,
                remaining: totalDailyMax - totalDailyCurrent
            }

            // 调试打印更多活动明细
            this.printMorePromotionsDebugInfo(pointsInfo)

            return pointsInfo
        } catch (e) {
            console.error('统一获取积分信息失败:', e)
            return null
        }
    }

    /**
     * 统一API方式获取积分并发送TG通知，格式保持原有不变
     */
    async sendPointsReportUnified(accountEmail: string, accessToken: string, country: string = 'us'): Promise<boolean> {
        const pointsInfo = await this.getUnifiedPointsInfo(accessToken, country)
        if (!pointsInfo) {
            console.error('无法获取积分信息')
            return false
        }
        const config = loadConfig()
        const message = this.formatPointsMessage(pointsInfo, accountEmail)
        await sendNotification(config, message)
        return true
    }

    /**
     * 邮箱脱敏处理
     * 保留前3个字符，@之前用*代替
     */
    private maskEmail(email: string): string {
        if (!email || !email.includes('@')) {
            return email
        }
        const atIndex = email.indexOf('@')
        const localPart = email.substring(0, atIndex)
        // 只保留前3位，其余用*，@后不显示域名
        if (localPart.length <= 3) {
            return `${'*'.repeat(localPart.length)}@outlook`
        } else {
            const maskedLocalPart = localPart.substring(0, 3) + '*'.repeat(localPart.length - 3)
            return `${maskedLocalPart}@outlook`
        }
    }

    /**
     * 控制台打印更多活动详细调试信息
     */
    public printMorePromotionsDebugInfo(pointsInfo: PointsInfo): void {
        // 控制台调试时调用getDetailedTaskStatus(pointsInfo, true)
        const detail = this.getDetailedTaskStatus(pointsInfo, true)
        console.log(detail)
    }
} 