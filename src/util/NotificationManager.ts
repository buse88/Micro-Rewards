import { sendNotification } from './Webhook'
import { loadConfig } from './Load'
import { PointsReporter } from './PointsReporter'
import AxiosClient from './Axios'

export interface NotificationData {
    accountEmail: string
    accountIndex?: number
    totalAccounts?: number
    error?: string
    taskResults?: {
        desktopSearch: boolean
        mobileSearch: boolean
        dailySet: boolean
        activities: boolean
        readToEarn: boolean
    }
    executionTime?: number
    pointsGained?: number
    startPoints?: number
    endPoints?: number
    readToEarnResult?: {
        articlesRead: number
        totalPointsGained: number
    }
    dailyCheckInResult?: {
        success: boolean
        pointsGained: number
        message: string
    }
}

export class NotificationManager {
    private config = loadConfig()

    /**
     * 发送登录成功通知
     */
    async sendLoginSuccessNotification(data: NotificationData): Promise<void> {
        const currentTime = new Date().toLocaleString('zh-CN', { 
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        })

        const accountInfo = data.totalAccounts && data.totalAccounts > 1 
            ? `(${data.accountIndex}/${data.totalAccounts})` 
            : ''

        const maskedEmail = this.maskEmail(data.accountEmail)

        const message = `✅ **Microsoft Rewards 登录成功**

📧 **账户**: ${maskedEmail} ${accountInfo}
⏰ **时间**: ${currentTime}
🔄 **状态**: 登录成功，开始执行任务

🎯 **即将执行的任务**:
• 桌面端搜索
• 移动端搜索  
• 每日任务集
• 活动和问答
• 阅读赚积分`

        await this.sendNotification(message)
    }

    /**
     * 发送错误通知
     */
    async sendErrorNotification(data: NotificationData): Promise<void> {
        const currentTime = new Date().toLocaleString('zh-CN', { 
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        })

        const accountInfo = data.totalAccounts && data.totalAccounts > 1 
            ? `(${data.accountIndex}/${data.totalAccounts})` 
            : ''

        const maskedEmail = this.maskEmail(data.accountEmail)

        const message = `❌ **Microsoft Rewards 执行错误**

📧 **账户**: ${maskedEmail} ${accountInfo}
⏰ **时间**: ${currentTime}
🔄 **状态**: 执行过程中发生错误

💥 **错误信息**:
${data.error || '未知错误'}

⚠️ **建议操作**:
• 检查账户密码是否正确
• 确认网络连接稳定
• 查看详细日志获取更多信息`

        await this.sendNotification(message)
    }

    /**
     * 发送任务完成通知
     */
    async sendTaskCompletionNotification(data: NotificationData): Promise<void> {
        const currentTime = new Date().toLocaleString('zh-CN', { 
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        })

        const accountInfo = data.totalAccounts && data.totalAccounts > 1 
            ? `(${data.accountIndex}/${data.totalAccounts})` 
            : ''

        const executionTime = data.executionTime 
            ? `⏱️ **执行时间**: ${Math.round(data.executionTime / 1000)}秒`
            : ''

        const taskResults = data.taskResults ? this.formatTaskResults(data.taskResults) : ''

        // 积分信息
        const pointsInfo = data.pointsGained !== undefined && data.startPoints !== undefined && data.endPoints !== undefined
            ? `💰 **积分变化**:
• 开始积分: ${data.startPoints.toLocaleString()}
• 结束积分: ${data.endPoints.toLocaleString()}
• 本次获得: ${data.pointsGained.toLocaleString()} 积分`
            : ''

        // 阅读积分信息
        const readToEarnInfo = data.readToEarnResult 
            ? `📖 **阅读赚积分**
• 当前: ${data.readToEarnResult.totalPointsGained} 积分
• 最大: 30 积分
• 剩余: ${30 - data.readToEarnResult.totalPointsGained} 积分

📊 阅读赚积分: ${this.getProgressBar(data.readToEarnResult.totalPointsGained, 30, '阅读赚积分')}`
            : `📖 **阅读赚积分**
• 当前: 0 积分
• 最大: 30 积分
• 剩余: 30 积分

📊 阅读赚积分: ${this.getProgressBar(0, 30, '阅读赚积分')}`

        // 每日签到信息
        const dailyCheckInInfo = data.dailyCheckInResult 
            ? `📅 **每日签到**
• 状态: ${data.dailyCheckInResult.success ? '✅ 成功' : '⏳ 已完成'}
• 获得积分: ${data.dailyCheckInResult.pointsGained} 积分
• 消息: ${data.dailyCheckInResult.message}`
            : ''

        // 任务执行状态
        const taskStatusInfo = data.taskResults ? this.getDetailedTaskStatus(data.taskResults) : ''

        const message = `🎉 **Microsoft Rewards 任务完成**

📧 **账户**: ${data.accountEmail} ${accountInfo}
⏰ **时间**: ${currentTime}
🔄 **状态**: 所有任务执行完成

${executionTime}

${pointsInfo}

📊 **任务执行结果**:
${this.getTaskStatusEmoji(data.taskResults?.desktopSearch)} 桌面端搜索
${this.getTaskStatusEmoji(data.taskResults?.mobileSearch)} 移动端搜索
${this.getTaskStatusEmoji(data.taskResults?.dailySet)} 每日任务集
${this.getTaskStatusEmoji(data.taskResults?.activities)} 活动和问答
${this.getTaskStatusEmoji(data.taskResults?.readToEarn)} 阅读赚积分

${dailyCheckInInfo}

${readToEarnInfo}

${taskStatusInfo}

${taskResults}`

        await this.sendNotification(message)
    }

    /**
     * 发送积分统计通知
     */
    async sendPointsReportNotification(accountEmail: string, accessToken?: string): Promise<void> {
        try {
            const axiosClient = new AxiosClient({
                proxyAxios: false,
                url: '',
                port: 0,
                username: '',
                password: ''
            }, this.config.enableDebugLog)
            const pointsReporter = new PointsReporter(axiosClient, this.config)
            
            const success = await pointsReporter.sendPointsReport(accountEmail, accessToken)
            
            if (!success) {
                await this.sendNotification(`⚠️ **积分统计获取失败**

📧 **账户**: ${accountEmail}
❌ **状态**: 无法获取积分信息，请检查网络连接或账户状态`)
            }
        } catch (error) {
            await this.sendNotification(`❌ **积分统计错误**

📧 **账户**: ${accountEmail}
💥 **错误**: ${error instanceof Error ? error.message : '未知错误'}`)
        }
    }

    /**
     * 发送批量任务完成通知
     */
    async sendBatchCompletionNotification(totalAccounts: number, successfulAccounts: number, failedAccounts: number, totalExecutionTime: number): Promise<void> {
        const currentTime = new Date().toLocaleString('zh-CN', { 
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        })

        const successRate = totalAccounts > 0 ? Math.round((successfulAccounts / totalAccounts) * 100) : 0

        const message = `🏁 **Microsoft Rewards 批量任务完成**

⏰ **时间**: ${currentTime}
📊 **执行统计**:
• 总账户数: ${totalAccounts}
• 成功账户: ${successfulAccounts}
• 失败账户: ${failedAccounts}
• 成功率: ${successRate}%
• 总耗时: ${Math.round(totalExecutionTime / 1000)}秒

${successfulAccounts > 0 ? '✅ 成功账户的积分统计已发送' : ''}
${failedAccounts > 0 ? '❌ 失败账户请检查错误日志' : ''}

🎉 **任务执行完成！**`

        await this.sendNotification(message)
    }

    /**
     * 生成进度条
     */
    private getProgressBar(current: number, max: number, label: string): string {
        if (max === 0) return `${label}: 无数据`
        
        const percentage = Math.round((current / max) * 100)
        const filledBlocks = Math.round(percentage / 10)
        const emptyBlocks = 10 - filledBlocks
        
        const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks)
        return `${progressBar} ${percentage}% (${current}/${max})`
    }

    /**
     * 格式化任务结果
     */
    private formatTaskResults(results: NotificationData['taskResults']): string {
        if (!results) return ''

        const completedTasks = []
        const failedTasks = []

        if (results.desktopSearch) completedTasks.push('桌面端搜索')
        else failedTasks.push('桌面端搜索')

        if (results.mobileSearch) completedTasks.push('移动端搜索')
        else failedTasks.push('移动端搜索')

        if (results.dailySet) completedTasks.push('每日任务集')
        else failedTasks.push('每日任务集')

        if (results.activities) completedTasks.push('活动和问答')
        else failedTasks.push('活动和问答')

        if (results.readToEarn) completedTasks.push('阅读赚积分')
        else failedTasks.push('阅读赚积分')

        let result = ''
        
        if (completedTasks.length > 0) {
            result += `✅ **成功完成**: ${completedTasks.join(', ')}\n`
        }
        
        if (failedTasks.length > 0) {
            result += `❌ **执行失败**: ${failedTasks.join(', ')}\n`
        }

        return result
    }

    /**
     * 获取任务状态emoji
     */
    private getTaskStatusEmoji(success?: boolean): string {
        return success ? '✅' : '❌'
    }

    /**
     * 获取任务执行状态
     */
    private getDetailedTaskStatus(results: NotificationData['taskResults']): string {
        if (!results) return ''

        const taskStatus = []

        if (results.desktopSearch) taskStatus.push('桌面端搜索')
        if (results.mobileSearch) taskStatus.push('移动端搜索')
        if (results.dailySet) taskStatus.push('每日任务集')
        if (results.activities) taskStatus.push('活动和问答')
        if (results.readToEarn) taskStatus.push('阅读赚积分')

        return `📊 **任务执行状态**:
• 已完成: ${taskStatus.join(', ')}`
    }

    /**
     * 发送通知的统一方法
     */
    private async sendNotification(message: string): Promise<void> {
        try {
            await sendNotification(this.config, message)
        } catch (error) {
            console.error('发送通知失败:', error)
        }
    }

    /**
     * 发送详细积分报告通知
     */
    async sendDetailedPointsReportNotification(accountEmail: string, accessToken?: string): Promise<void> {
        try {
            const axiosClient = new AxiosClient({
                proxyAxios: false,
                url: '',
                port: 0,
                username: '',
                password: ''
            }, this.config.enableDebugLog)
            const pointsReporter = new PointsReporter(axiosClient, this.config)
            
            const pointsInfo = await pointsReporter.getPointsInfo(accessToken)
            
            if (pointsInfo) {
                const currentTime = new Date().toLocaleString('zh-CN', { 
                    timeZone: 'Asia/Shanghai',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })

                const maskedEmail = this.maskEmail(accountEmail)

                const message = `📊 **Microsoft Rewards 详细积分报告**

📧 **账户**: ${maskedEmail}
⏰ **时间**: ${currentTime}

💰 **积分概览**
• 可用积分: ${pointsInfo.availablePoints.toLocaleString()}
• 累计积分: ${pointsInfo.lifetimePoints.toLocaleString()}
• 已兑换积分: ${pointsInfo.lifetimePointsRedeemed.toLocaleString()}
• 用户等级: ${pointsInfo.userLevelName} (${pointsInfo.userLevel})

🎯 **每日活动**
• 已完成: ${pointsInfo.dailyTasks.dailySet.completed} 积分
• 总计: ${pointsInfo.dailyTasks.dailySet.total} 积分
• 剩余: ${pointsInfo.dailyTasks.dailySet.remaining} 积分

🎮 **更多活动**
• 当前: ${pointsInfo.dailyTasks.activities.current} 积分
• 最大: ${pointsInfo.dailyTasks.activities.max} 积分
• 剩余: ${pointsInfo.dailyTasks.activities.remaining} 积分

📖 **阅读赚积分**
• 当前: ${pointsInfo.readToEarn.current} 积分
• 最大: ${pointsInfo.readToEarn.max} 积分
• 剩余: ${pointsInfo.readToEarn.remaining} 积分

📈 **今日搜索总计**: ${pointsInfo.dailyTasks.totalDaily.current}/${pointsInfo.dailyTasks.totalDaily.max} 积分

${this.getProgressBar(pointsInfo.searchProgress.desktop.current, pointsInfo.searchProgress.desktop.max, '桌面端搜索')}
${this.getProgressBar(pointsInfo.searchProgress.mobile.current, pointsInfo.searchProgress.mobile.max, '移动端搜索')}
${this.getProgressBar(pointsInfo.dailyTasks.dailySet.completed, pointsInfo.dailyTasks.dailySet.total, '每日任务集')}
${this.getProgressBar(pointsInfo.dailyTasks.activities.current, pointsInfo.dailyTasks.activities.max, '活动和问答')}
${this.getProgressBar(pointsInfo.readToEarn.current, pointsInfo.readToEarn.max, '阅读赚积分')}
${this.getProgressBar(pointsInfo.dailyTasks.totalDaily.current, pointsInfo.dailyTasks.totalDaily.max, '今日总计')}

${this.getDetailedTaskStatusFromPoints(pointsInfo)}`

                await this.sendNotification(message)
            } else {
                const maskedEmail = this.maskEmail(accountEmail)
                await this.sendNotification(`⚠️ **积分统计获取失败**

📧 **账户**: ${maskedEmail}
❌ **状态**: 无法获取积分信息，请检查网络连接或账户状态`)
            }
        } catch (error) {
            const maskedEmail = this.maskEmail(accountEmail)
            await this.sendNotification(`❌ **积分统计错误**

📧 **账户**: ${maskedEmail}
💥 **错误**: ${error instanceof Error ? error.message : '未知错误'}`)
        }
    }

    /**
     * 从积分信息获取详细任务状态
     */
    private getDetailedTaskStatusFromPoints(pointsInfo: any): string {
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
            status = `✅ **已完成**: ${completedTasks.join(', ')}\n⏳ **待完成**: ${incompleteTasks.join(', ')}`
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
        
        return status
    }

    /**
     * 任务完成时推送详细积分报告（原作者方式+阅读API，内容格式不变）
     */
    async sendCompleteTaskNotification(
        accountEmail: string,
        accessToken: string,
        executionTime?: number,
        dailyCheckInResult?: { success: boolean, pointsGained: number, message: string },
        country: string = 'us',
        dashboardData?: any,
        taskSummary?: {
            startPoints: number
            endPoints: number
            pointsGained: number
            isMobile?: boolean
        },
        actualRegions?: {
            searchRegion?: string
            checkInRegion?: string
            readRegion?: string
        }
    ): Promise<void> {
        try {
            // 1. 获取dashboardData（如未传入则抛错）
            if (!dashboardData) {
                throw new Error('未传入dashboardData，无法获取积分信息')
            }
            
            // 2. 构建完整的任务完成信息
            const completeTaskSummary = {
                startPoints: taskSummary?.startPoints || 0,
                endPoints: taskSummary?.endPoints || 0,
                pointsGained: taskSummary?.pointsGained || 0,
                dailyCheckInResult,
                executionTime,
                isMobile: taskSummary?.isMobile || false
            }
            
            // 3. 调用sendPointsNotification，将任务完成信息整合到积分报告中
            await this.sendPointsNotification(accountEmail, dashboardData, accessToken, completeTaskSummary, actualRegions)
            
        } catch (error) {
            console.error('发送详细积分报告失败:', error)
        }
    }

    /**
     * 发送积分统计通知（使用原作者的方式）
     */
    async sendPointsNotification(
        accountEmail: string, 
        dashboardData: any, 
        accessToken?: string,
        taskSummary?: {
            startPoints: number
            endPoints: number
            pointsGained: number
            dailyCheckInResult?: { success: boolean, pointsGained: number, message: string }
            executionTime?: number
            isMobile?: boolean
        },
        actualRegions?: {
            searchRegion?: string
            checkInRegion?: string
            readRegion?: string
        }
    ): Promise<void> {
        try {
            if (this.config.enableDebugLog) {
                console.log('[debug] sendPointsNotification 被调用', accountEmail)
            }

            // 检查是否有任何通知渠道启用
            const hasWebhookEnabled = this.config.webhook?.enabled && this.config.webhook?.url?.length >= 10
            const hasTelegramEnabled = this.config.webhook?.telegram?.enabled && 
                                     this.config.webhook?.telegram?.botToken && 
                                     this.config.webhook?.telegram?.chatId
            
            if (!hasWebhookEnabled && !hasTelegramEnabled) {
                if (this.config.enableDebugLog) {
                    console.log('所有通知渠道都已禁用')
                }
                return
            }

            const axiosClient = new AxiosClient({
                proxyAxios: false,
                url: '',
                port: 0,
                username: '',
                password: ''
            }, this.config?.enableDebugLog)
            const pointsReporter = new PointsReporter(axiosClient, this.config)
            
            // 使用统一的积分获取方法，确保与正常项目使用相同的接口
            let pointsInfo = null
            
            // 从ruid中提取真实的账号归属地
            let accountCountry = '-'
            if (dashboardData?.userProfile?.ruid) {
                const ruid = dashboardData.userProfile.ruid
                // ruid格式通常是: "hk-B618847E1229189027F34BC8F6E773673040EE66"
                // 前两个字符是地区代码
                const countryCode = ruid.substring(0, 2).toLowerCase()
                accountCountry = countryCode
                if (this.config.enableDebugLog) {
                    console.log('[debug] 从ruid提取账号地区:', ruid, '->', countryCode)
                }
            } else {
                // 如果无法从ruid获取，回退到原有方法
                accountCountry = dashboardData?.userProfile?.attributes?.country || '-'
                if (this.config.enableDebugLog) {
                    console.log('[debug] 无法从ruid获取地区，使用原有方法:', accountCountry)
                }
            }
            
            if (accessToken) {
                if (this.config.enableDebugLog) {
                    console.log('[debug] 使用getUnifiedPointsInfo获取积分信息，地区:', accountCountry)
                }
                pointsInfo = await pointsReporter.getUnifiedPointsInfo(accessToken, accountCountry)
            }
            
            // 如果统一方法失败，回退到dashboardData方法
            if (!pointsInfo) {
                if (this.config.enableDebugLog) {
                    console.log('[debug] getUnifiedPointsInfo失败，回退到getPointsInfoFromDashboardData')
                }
                pointsInfo = await pointsReporter.getPointsInfoFromDashboardData(dashboardData, accessToken)
            }
            
            if (!pointsInfo) {
                console.error('无法获取积分信息')
                return
            }
            
            // 使用实际执行地区，如果没有提供则使用默认逻辑
            let checkInCountry = actualRegions?.checkInRegion || 'us'
            let readCountry = actualRegions?.readRegion || 'us'
            let searchCountry = actualRegions?.searchRegion || 'us'
            
            // 如果没有提供实际执行地区，使用原有逻辑
            if (!actualRegions) {
                if (this.config.searchSettings?.useGeoLocaleQueries && typeof accountCountry === 'string' && accountCountry.length === 2) {
                    checkInCountry = accountCountry.toLowerCase()
                    readCountry = accountCountry.toLowerCase()
                    searchCountry = accountCountry.toLowerCase()
                }
            }
            
            if (this.config.enableDebugLog) {
                console.log('[debug] 地区信息:', {
                    accountCountry,
                    actualCheckIn: checkInCountry,
                    actualRead: readCountry,
                    actualSearch: searchCountry
                })
            }
            
            // 构建extraInfo，包含任务完成信息和实际执行地区
            const extraInfo = {
                accountCountry,
                checkInCountry,
                readCountry,
                searchCountry,
                taskSummary
            }
            
            const message = pointsReporter.formatPointsMessage(pointsInfo, accountEmail, extraInfo)
            await sendNotification(this.config, message)
            if (this.config.enableDebugLog) {
                console.log('积分统计通知已发送')
            }
        } catch (error) {
            console.error('发送积分统计通知失败:', error)
        }
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
        const domain = email.substring(atIndex + 1)
        
        if (localPart.length <= 3) {
            // 如果@前部分少于等于3个字符，全部用*代替
            return `${'*'.repeat(localPart.length)}@${domain}`
        } else {
            // 保留前3个字符，其余用*代替
            const maskedLocalPart = localPart.substring(0, 3) + '*'.repeat(localPart.length - 3)
            return `${maskedLocalPart}@${domain}`
        }
    }

    /**
     * 发送Telegram消息
     */
    async sendTelegramMessage(message: string): Promise<void> {
        console.log('[TG发送调试] === 开始发送Telegram消息 ===')
        console.log('[TG发送调试] 消息长度:', message.length)
        console.log('[TG发送调试] 消息预览:', message.substring(0, 200) + '...')
        
        try {
            if (!this.config.webhook?.telegram?.enabled) {
                console.log('[TG发送调试] ❌ Telegram通知未启用')
                return
            }
            console.log('[TG发送调试] ✅ Telegram通知已启用')

            const telegramConfig = this.config.webhook.telegram
            if (!telegramConfig.botToken || !telegramConfig.chatId) {
                console.log('[TG发送调试] ❌ Telegram配置不完整，缺少botToken或chatId')
                console.log('[TG发送调试] 配置详情:', {
                    enabled: telegramConfig.enabled,
                    botToken: telegramConfig.botToken ? '已配置' : '未配置',
                    chatId: telegramConfig.chatId ? '已配置' : '未配置',
                    apiProxy: telegramConfig.apiProxy || '未配置'
                })
                return
            }
            console.log('[TG发送调试] ✅ Telegram配置完整')

            const axiosClient = new AxiosClient({
                proxyAxios: false,
                url: '',
                port: 0,
                username: '',
                password: ''
            }, this.config.enableDebugLog)

            const apiUrl = telegramConfig.apiProxy 
                ? `${telegramConfig.apiProxy}/bot${telegramConfig.botToken}/sendMessage`
                : `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`

            console.log('[TG发送调试] === 完整请求信息 ===')
            console.log('[TG发送调试] API URL:', apiUrl)
            console.log('[TG发送调试] 请求方法: POST')
            console.log('[TG发送调试] Chat ID:', telegramConfig.chatId)
            console.log('[TG发送调试] Bot Token:', telegramConfig.botToken.substring(0, 10) + '...')

            const requestData = {
                chat_id: telegramConfig.chatId,
                text: message,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            }

            console.log('[TG发送调试] 请求数据:')
            console.log('[TG发送调试] - chat_id:', requestData.chat_id)
            console.log('[TG发送调试] - parse_mode:', requestData.parse_mode)
            console.log('[TG发送调试] - disable_web_page_preview:', requestData.disable_web_page_preview)
            console.log('[TG发送调试] - text长度:', requestData.text.length)

            console.log('[TG发送调试] 发送请求...')
            const response = await axiosClient.request({
                method: 'POST',
                url: apiUrl,
                data: requestData,
                headers: {
                    'Content-Type': 'application/json'
                }
            }, true) // 使用直连模式

            console.log('[TG发送调试] === 完整响应信息 ===')
            console.log('[TG发送调试] 响应状态码:', response.status)
            console.log('[TG发送调试] 响应状态文本:', response.statusText)
            console.log('[TG发送调试] 响应头:')
            Object.entries(response.headers).forEach(([key, value]) => {
                console.log(`[TG发送调试]   ${key}: ${value}`)
            })

            if (response.data?.ok) {
                console.log(`[TG发送调试] ✅ Telegram消息发送成功，消息ID: ${response.data.result.message_id}`)
                console.log('[TG发送调试] 响应数据:', JSON.stringify(response.data, null, 2))
            } else {
                console.error('[TG发送调试] ❌ Telegram API错误:', response.data?.description || '未知错误')
                console.error('[TG发送调试] 完整响应数据:', JSON.stringify(response.data, null, 2))
            }
        } catch (error: any) {
            console.error('[TG发送调试] ❌ Telegram通知发送失败:', error.message)
            console.error('[TG发送调试] 错误堆栈:', error.stack)
            
            if (error.response) {
                console.error('[TG发送调试] === 错误响应详情 ===')
                console.error('[TG发送调试] 错误响应状态码:', error.response.status)
                console.error('[TG发送调试] 错误响应状态文本:', error.response.statusText)
                console.error('[TG发送调试] 错误响应头:')
                Object.entries(error.response.headers).forEach(([key, value]) => {
                    console.error(`[TG发送调试]   ${key}: ${value}`)
                })
                console.error('[TG发送调试] 错误响应数据:')
                console.error(JSON.stringify(error.response.data, null, 2))
            }
            
            if (error.request) {
                console.error('[TG发送调试] === 请求错误详情 ===')
                console.error('[TG发送调试] 请求错误:', error.request)
            }
        }
    }
}