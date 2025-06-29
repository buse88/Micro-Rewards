import cluster from 'cluster'
import { Page } from 'rebrowser-playwright'
import path from 'path'
import fs from 'fs'

import Browser from './browser/Browser'
import BrowserFunc from './browser/BrowserFunc'
import BrowserUtil from './browser/BrowserUtil'

import { log } from './util/Logger'
import Util from './util/Utils'
import { loadAccounts, loadConfig } from './util/Load'

import { Login } from './functions/Login'
import { Workers } from './functions/Workers'
import Activities from './functions/Activities'

import { Account } from './interface/Account'
import AxiosClient from './util/Axios'
import { NotificationManager } from './util/NotificationManager'

// 添加TG消息生成功能
import { generateTGMessage } from './util/TGMessageGenerator'

// Main bot class
export class MicrosoftRewardsBot {
    public log: typeof log
    public config
    public utils: Util
    public activities: Activities = new Activities(this)
    public browser: {
        func: BrowserFunc,
        utils: BrowserUtil
    }
    public isMobile: boolean
    public homePage!: Page

    private pointsCanCollect: number = 0
    private pointsInitial: number = 0

    private activeWorkers: number
    private browserFactory: Browser = new Browser(this)
    private accounts: Account[]
    private workers: Workers
    private login = new Login(this)
    private accessToken: string = ''
    private notificationManager: NotificationManager = new NotificationManager()

    //@ts-expect-error Will be initialized later
    public axios: AxiosClient

    constructor(isMobile: boolean) {
        this.isMobile = isMobile
        this.log = log

        this.accounts = []
        this.utils = new Util()
        this.workers = new Workers(this)
        this.browser = {
            func: new BrowserFunc(this),
            utils: new BrowserUtil(this)
        }
        this.config = loadConfig(true)
        this.activeWorkers = this.config.clusters
    }

    async initialize() {
        this.accounts = loadAccounts()
    }

    async run() {
        log('main', 'MAIN', `机器人已启动，使用 ${this.config.clusters} 个集群`)

        // Only cluster when there's more than 1 cluster demanded
        if (this.config.clusters > 1) {
            if (cluster.isPrimary) {
                this.runMaster()
            } else {
                this.runWorker()
            }
        } else {
            await this.runTasks(this.accounts)
        }
    }

    private runMaster() {
        log('main', 'MAIN-PRIMARY', '主进程已启动')

        const accountChunks = this.utils.chunkArray(this.accounts, this.config.clusters)

        for (let i = 0; i < accountChunks.length; i++) {
            const worker = cluster.fork()
            const chunk = accountChunks[i]
            worker.send({ chunk })
        }

        cluster.on('exit', (worker, code) => {
            this.activeWorkers -= 1

            log('main', 'MAIN-WORKER', `工作进程 ${worker.process.pid} 已销毁 | 代码: ${code} | 活跃工作进程: ${this.activeWorkers}`, 'warn')

            // Check if all workers have exited
            if (this.activeWorkers === 0) {
                log('main', 'MAIN-WORKER', '所有工作进程已销毁，退出主进程！', 'warn')
                process.exit(0)
            }
        })
    }

    private runWorker() {
        log('main', 'MAIN-WORKER', `工作进程 ${process.pid} 已生成`)
        // Receive the chunk of accounts from the master
        process.on('message', async ({ chunk }) => {
            await this.runTasks(chunk)
        })
    }

    private async runTasks(accounts: Account[]) {
        const startTime = Date.now()
        let successfulAccounts = 0
        let failedAccounts = 0
        const accountResults: Array<{
            email: string
            desktopResult: any
            mobileResult: any
            success: boolean
        }> = []

        for (const account of accounts) {
            log('main', 'MAIN-WORKER', `开始执行账户 ${account.email} 的任务`)

            try {
                let desktopResult: any = null
                let mobileResult: any = null
                
                // 每个账号都使用独立的浏览器实例，确保会话隔离
                if (this.config.parallel) {
                    const [desktop, mobile] = await Promise.all([
                        this.runAccountTasks(account, false), // Desktop
                        this.runAccountTasks(account, true)   // Mobile
                    ])
                    desktopResult = desktop
                    mobileResult = mobile
                } else {
                    // 使用独立浏览器实例完成所有任务
                    desktopResult = await this.runAccountTasks(account, false) // Desktop first
                    mobileResult = await this.runAccountTasks(account, true)  // Mobile second
                }

                // 检查两个任务是否都成功
                if (desktopResult?.success && mobileResult?.success) {
                    successfulAccounts++
                    log('main', 'MAIN-WORKER', `账户 ${account.email} 的所有任务已完成`, 'log', 'green')
                    if (this.config.enableDebugLog) {
                        console.log('[debug] mobileResult.dashboardData:', !!mobileResult.dashboardData, mobileResult.dashboardData)
                    }
                    if (!this.config.onlyReport && mobileResult.dashboardData) {
                        if (this.config.enableDebugLog) {
                            console.log('[debug] 即将生成TG积分报告', account.email)
                        }
                        
                        // 构建任务完成信息
                        const taskSummary = {
                            startPoints: Math.min(desktopResult.startPoints || 0, mobileResult.startPoints || 0),
                            endPoints: Math.max(desktopResult.endPoints || 0, mobileResult.endPoints || 0),
                            pointsGained: (desktopResult.pointsGained || 0) + (mobileResult.pointsGained || 0),
                            dailyCheckInResult: mobileResult.dailyCheckInResult,
                            executionTime: Math.max(desktopResult.executionTime || 0, mobileResult.executionTime || 0),
                            isMobile: false // 桌面端和移动端都执行了
                        }
                        
                        // 检查是否有dashboard数据，无论任务是否全部成功都尝试发送TG积分报告
                        if (mobileResult.dashboardData) {
                            try {
                                console.log('[主程序调试] === 开始生成TG积分报告（宽容模式） ===')
                                console.log('[主程序调试] 账户邮箱:', account.email)
                                console.log('[主程序调试] 任务摘要:', taskSummary)
                                console.log('[主程序调试] desktopResult.success:', desktopResult?.success)
                                console.log('[主程序调试] mobileResult.success:', mobileResult?.success)
                                console.log('[主程序调试] mobileResult.dashboardData存在:', !!mobileResult.dashboardData)
                                
                                // 获取实际执行任务的地区信息
                                const actualRegions = this.getActualRegions(mobileResult.dashboardData)
                                if (this.config.enableDebugLog) {
                                    console.log('[主程序调试] 实际执行任务的地区:', actualRegions)
                                }
                                
                                // 将地区信息添加到dashboard数据中，供TG消息生成器使用
                                const dashboardWithRegions = {
                                    ...mobileResult.dashboardData,
                                    actualRegions: actualRegions,
                                    config: {
                                        searchSettings: {
                                            preferredCountry: this.config.searchSettings.preferredCountry,
                                            useGeoLocaleQueries: this.config.searchSettings.useGeoLocaleQueries
                                        }
                                    }
                                }
                                
                                console.log('[主程序调试] dashboard数据结构:')
                                console.log('[主程序调试] - userStatus存在:', !!dashboardWithRegions.userStatus)
                                console.log('[主程序调试] - userProfile存在:', !!dashboardWithRegions.userProfile)
                                console.log('[主程序调试] - dailySetPromotions存在:', !!dashboardWithRegions.dailySetPromotions)
                                console.log('[主程序调试] - morePromotions存在:', !!dashboardWithRegions.morePromotions)
                                
                                // 获取accessToken用于阅读积分查询
                                let accessToken = null
                                try {
                                    const sessionDir = path.join(process.cwd(), 'dist', 'browser', this.config.sessionPath, account.email)
                                    const mobileAccessTokenPath = path.join(sessionDir, 'mobile_accessToken.txt')
                                    if (fs.existsSync(mobileAccessTokenPath)) {
                                        accessToken = fs.readFileSync(mobileAccessTokenPath, 'utf8').trim()
                                        console.log('[主程序调试] ✅ 从文件获取accessToken成功，长度:', accessToken.length)
                                    } else {
                                        console.log('[主程序调试] ⚠️  accessToken文件不存在:', mobileAccessTokenPath)
                                    }
                                } catch (error) {
                                    if (this.config.enableDebugLog) {
                                        const msg = error instanceof Error ? error.message : String(error)
                                        console.log('[主程序调试] ❌ 获取accessToken失败:', msg)
                                    }
                                }
                                
                                // 生成TG消息
                                if (this.config.enableDebugLog) {
                                    console.log('[主程序调试] 准备生成TG消息，传入的dashboard数据:')
                                    console.log('[主程序调试] - mobileResult.dashboardData.ruid:', mobileResult.dashboardData?.ruid)
                                    console.log('[主程序调试] - mobileResult.dashboardData.userProfile?.attributes?.ruid:', mobileResult.dashboardData?.userProfile?.attributes?.ruid)
                                    console.log('[主程序调试] - mobileResult.dashboardData.userProfile?.attributes?.country:', mobileResult.dashboardData?.userProfile?.attributes?.country)
                                }
                                
                                console.log('[主程序调试] 开始调用generateTGMessage...')
                                const tgMessage = await generateTGMessage(account.email, dashboardWithRegions, taskSummary, accessToken, this.config)
                                console.log('[主程序调试] ✅ TG消息生成成功，长度:', tgMessage.length)
                                console.log('[主程序调试] TG消息预览:', tgMessage.substring(0, 300) + '...')
                                
                                // 发送TG通知
                                if (this.config.webhook?.telegram?.enabled) {
                                    console.log('[主程序调试] Telegram已启用，开始发送消息...')
                                    await this.notificationManager.sendTelegramMessage(tgMessage)
                                    if (this.config.enableDebugLog) {
                                        console.log('[主程序调试] ✅ TG积分报告已发送')
                                    }
                                } else {
                                    if (this.config.enableDebugLog) {
                                        console.log('[主程序调试] ⚠️  Telegram未启用，跳过发送')
                                        console.log('[主程序调试] Telegram配置:', this.config.webhook?.telegram)
                                    }
                                }
                            } catch (error) {
                                console.error('[主程序调试] ❌ TG消息生成或发送失败:', error)
                                console.error('[主程序调试] 错误堆栈:', error instanceof Error ? error.stack : '无堆栈信息')
                                console.error('[主程序调试] 错误详情:', {
                                    message: error instanceof Error ? error.message : String(error),
                                    name: error instanceof Error ? error.name : 'Unknown',
                                    stack: error instanceof Error ? error.stack : '无堆栈信息'
                                })
                            }
                        }
                        
                        // 收集成功的结果
                        accountResults.push({
                            email: account.email,
                            desktopResult,
                            mobileResult,
                            success: true
                        })
                    }
                } else {
                    failedAccounts++
                    const error = desktopResult?.error || mobileResult?.error || '未知错误'
                    log('main', 'MAIN-WORKER', `账户 ${account.email} 的任务执行失败: ${error}`, 'error')
                    // 收集失败的结果
                    accountResults.push({
                        email: account.email,
                        desktopResult,
                        mobileResult,
                        success: false
                    })
                }
            } catch (error: any) {
                failedAccounts++
                log('main', 'MAIN-WORKER', `账户 ${account.email} 的任务执行失败: ${error}`, 'error')
                // 收集异常的结果
                accountResults.push({
                    email: account.email,
                    desktopResult: null,
                    mobileResult: null,
                    success: false
                })
            }
        }

        // 只允许主进程发送批量任务完成通知
        if (!cluster.isWorker || typeof cluster.isWorker === 'undefined') {
            const totalExecutionTime = Date.now() - startTime
            
            await this.notificationManager.sendBatchCompletionNotification(
                accounts.length,
                successfulAccounts,
                failedAccounts,
                totalExecutionTime
            )
            log(this.isMobile, 'MAIN-PRIMARY', '所有账户的任务已完成', 'log', 'green')
        process.exit()
        }
    }

    // 统一的账户任务执行方法
    async runAccountTasks(account: Account, isMobile: boolean) {
        this.isMobile = isMobile
        this.axios = new AxiosClient(account.proxy, this.config.enableDebugLog)
        
        const startTime = Date.now()
        let startPoints = 0
        let endPoints = 0
        let readToEarnResult = { articlesRead: 0, totalPointsGained: 0 }
        let mobileResult: any = null
        let browser: any = null

        try {
            // 为每个账号创建独立的浏览器实例，确保会话隔离
            browser = await this.browserFactory.createBrowser(account.proxy, account.email)
            
            // 检查浏览器上下文是否有效
            if (!browser) {
                throw new Error('Browser context is invalid')
            }
            
            this.homePage = await browser.newPage()

            // 登录
            await this.login.login(this.homePage, account.email, account.password)
            
            // 登录成功通知通过原有日志方式
            log(this.isMobile, 'MAIN', `账户 ${account.email} 登录成功`)

            // 获取初始积分
            startPoints = await this.browser.func.getCurrentPoints()

            // 从浏览器页面获取dashboard数据
            let data: any
            try {
                if (this.config.enableDebugLog) {
                    console.log('[debug] 尝试从浏览器页面获取dashboard数据')
                }
                data = await this.browser.func.getDashboardData()
            } catch (error) {
                if (this.config.enableDebugLog) {
                    console.log('[debug] 获取dashboard数据失败:', error)
                }
                throw error
            }

            if (!data || !data.userStatus) {
                log(this.isMobile, 'MAIN-ERROR', `账户 ${account.email} 获取用户数据失败`, 'error')
                return { success: false, error: 'Failed to get user data' }
            }

            // 获取实际执行地区信息
            const regions = this.getActualRegions(data)
            if (this.config.enableDebugLog) {
                console.log('[debug] 实际执行地区:', regions)
            }

            // 任务结果跟踪
            const taskResults = {
                desktopSearch: false,
                mobileSearch: false,
                dailySet: false,
                activities: false,
                readToEarn: false,
                dailyCheckIn: false
            }

            if (isMobile) {
                mobileResult = await this.runMobileTasks(browser, data)
                readToEarnResult = { articlesRead: mobileResult.articlesRead, totalPointsGained: mobileResult.totalPointsGained }
                taskResults.mobileSearch = true
                
                // 处理每日签到结果
                if (mobileResult.dailyCheckInResult) {
                    if (mobileResult.dailyCheckInResult.success) {
                        log(this.isMobile, 'MAIN-CHECKIN', `每日签到成功: ${mobileResult.dailyCheckInResult.message}`)
                    } else {
                        log(this.isMobile, 'MAIN-CHECKIN', `每日签到: ${mobileResult.dailyCheckInResult.message}`)
                    }
                }
            } else {
                await this.runDesktopTasks(browser, data)
                taskResults.desktopSearch = true
                taskResults.dailySet = true
                taskResults.activities = true
                taskResults.readToEarn = true
            }

            // 所有任务完成后再获取一次积分
            endPoints = await this.browser.func.getCurrentPoints()
            log(this.isMobile, 'MAIN-POINTS', `本次获得积分: ${endPoints - startPoints}`)

            // 返回任务结果，不在这里发送通知
            return {
                success: true,
                taskResults: taskResults,
                executionTime: Date.now() - startTime,
                pointsGained: endPoints - startPoints,
                startPoints: startPoints,
                endPoints: endPoints,
                readToEarnResult: readToEarnResult,
                dailyCheckInResult: isMobile ? mobileResult?.dailyCheckInResult : undefined,
                dashboardData: isMobile ? mobileResult?.dashboardData : undefined
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            log(this.isMobile, 'MAIN-ERROR', `运行${isMobile ? '移动端' : '桌面端'}机器人时出错: ${errorMessage}`, 'error')
            
            // 错误通知通过原有日志方式
            log(this.isMobile, 'MAIN-ERROR', `账户 ${account.email} 任务执行失败: ${errorMessage}`, 'error')
            
            return {
                success: false,
                error: errorMessage
            }
        } finally {
            // 确保浏览器被关闭，释放资源
            if (!this.config.onlyReport && browser) {
                try {
                    await this.browser.func.closeBrowser(browser, account.email)
                } catch (closeError) {
                    log(this.isMobile, 'MAIN-ERROR', `关闭浏览器时出错: ${closeError}`, 'error')
                }
            }
        }
    }

    // 获取实际执行地区信息
    private getActualRegions(data: any): {
        searchRegion?: string
        checkInRegion?: string
        readRegion?: string
    } {
        const accountCountry = data.userProfile?.attributes?.country || 'us'
        
        // 获取账号实际地区（从ruid）
        let accountRegion = 'us'
        if (data?.userProfile?.ruid && typeof data.userProfile.ruid === 'string' && data.userProfile.ruid.includes('-')) {
            accountRegion = data.userProfile.ruid.split('-')[0].toLowerCase()
        } else if (accountCountry && accountCountry.length === 2) {
            accountRegion = accountCountry.toLowerCase()
        }
        
        // 使用与各功能相同的地区选择逻辑 - 修改优先级逻辑
        let searchRegion = 'us'
        let checkInRegion = 'us'
        let readRegion = 'us'
        
        // 1. 优先检查 preferredCountry（仅用于搜索）
        if (this.config.searchSettings.preferredCountry && this.config.searchSettings.preferredCountry.length === 2) {
            searchRegion = this.config.searchSettings.preferredCountry.toLowerCase()
            if (this.config.enableDebugLog) {
                console.log('[debug] 使用preferredCountry配置的搜索地区:', searchRegion)
            }
        } else if (this.config.searchSettings.useGeoLocaleQueries) {
            // 2. 只有在 preferredCountry 为空时才检查 useGeoLocaleQueries
            if (accountCountry && accountCountry.length === 2) {
                searchRegion = accountCountry.toLowerCase()
                if (this.config.enableDebugLog) {
                    console.log('[debug] 使用useGeoLocaleQueries配置的搜索地区:', searchRegion)
                }
            }
        }
        
        // 签到和阅读任务使用账号实际地区，不受preferredCountry影响
        checkInRegion = accountRegion
        readRegion = accountRegion
        
        if (this.config.enableDebugLog) {
            console.log('[debug] 账号实际地区:', accountRegion)
            console.log('[debug] 签到地区:', checkInRegion)
            console.log('[debug] 阅读地区:', readRegion)
        }
        
        return {
            searchRegion,
            checkInRegion,
            readRegion
        }
    }

    // 桌面端任务
    async runDesktopTasks(browser: any, data: any) {
        this.pointsInitial = data.userStatus.availablePoints
        log(this.isMobile, 'MAIN-POINTS', `当前积分数量: ${this.pointsInitial}`)

        const browserEnarablePoints = await this.browser.func.getBrowserEarnablePoints()
        this.pointsCanCollect = browserEnarablePoints.dailySetPoints +
                               browserEnarablePoints.desktopSearchPoints + 
                               browserEnarablePoints.morePromotionsPoints

        log(this.isMobile, 'MAIN-POINTS', `今天可以获得 ${this.pointsCanCollect} 积分`)

        // 修改：runOnZeroPoints为false时不再提前return，而是只跳过任务执行，后续流程继续
        if (!this.config.runOnZeroPoints && this.pointsCanCollect === 0) {
            log(this.isMobile, 'MAIN', '没有可获得的积分且"runOnZeroPoints"设置为"false"，跳过任务执行，但继续积分统计和推送！', 'log', 'yellow')
            return // 只跳过任务执行，主流程会继续
        }

        // 创建工作页面
        const workerPage = await browser.newPage()
        await this.browser.func.goHome(workerPage)

        // 执行桌面端任务
        if (this.config.workers.doDailySet) {
            await this.workers.doDailySet(workerPage, data)
        }

        if (this.config.workers.doMorePromotions) {
            await this.workers.doMorePromotions(workerPage, data)
        }

        if (this.config.workers.doPunchCards) {
            await this.workers.doPunchCard(workerPage, data)
        }

        if (this.config.workers.doDesktopSearch) {
            await this.activities.doSearch(workerPage, data)
        }

        await workerPage.close()
    }

    // 移动端任务
    async runMobileTasks(browser: any, data: any): Promise<{ articlesRead: number, totalPointsGained: number, dailyCheckInResult?: { success: boolean, pointsGained: number, message: string }, dashboardData?: any }> {
        // 获取移动端accessToken
        try {
            if (this.config.enableDebugLog) {
                console.log('[debug] 开始获取移动端accessToken...')
            }
            this.accessToken = await this.login.getMobileAccessToken(this.homePage, data.userProfile?.attributes?.email || '')
            if (this.config.enableDebugLog) {
                console.log('[debug] 移动端accessToken获取成功:', this.accessToken ? '已获取' : '获取失败')
            }
        } catch (error) {
            if (this.config.enableDebugLog) {
                console.log('[debug] 获取移动端accessToken失败:', error)
            }
            this.accessToken = ''
        }

        const browserEnarablePoints = await this.browser.func.getBrowserEarnablePoints()
        const appEarnablePoints = await this.browser.func.getAppEarnablePoints(this.accessToken)

        this.pointsCanCollect = browserEnarablePoints.mobileSearchPoints + appEarnablePoints.totalEarnablePoints

        log(this.isMobile, 'MAIN-POINTS', `今天可以获得 ${this.pointsCanCollect} 积分 (浏览器: ${browserEnarablePoints.mobileSearchPoints} 积分, 应用: ${appEarnablePoints.totalEarnablePoints} 积分)`)

        let readToEarnResult = { articlesRead: 0, totalPointsGained: 0 }
        let dailyCheckInResult: { success: boolean, pointsGained: number, message: string } | undefined

        // 执行移动端任务
        if (this.config.workers.doDailyCheckIn) {
            dailyCheckInResult = await this.activities.doDailyCheckIn(this.accessToken, data)
        }

        if (!this.config.runOnZeroPoints && this.pointsCanCollect === 0) {
            log(this.isMobile, 'MAIN', '没有可获得的积分且"runOnZeroPoints"设置为"false"，停止执行！', 'log', 'yellow')
            return { articlesRead: 0, totalPointsGained: 0, dailyCheckInResult }
        }

        if (this.config.workers.doReadToEarn) {
            readToEarnResult = await this.activities.doReadToEarn(this.accessToken, data)
        }

        if (this.config.workers.doMobileSearch) {
            if (data.userStatus.counters.mobileSearch) {
                const workerPage = await browser.newPage()
                await this.browser.func.goHome(workerPage)
                await this.activities.doSearch(workerPage, data)
                await workerPage.close()
            } else {
                log(this.isMobile, 'MAIN', '无法获取搜索积分，您的账户可能太"新"了！请稍后再试！', 'warn')
            }
        }

        return { ...readToEarnResult, dailyCheckInResult, dashboardData: data }
    }

}

async function main() {
    const rewardsBot = new MicrosoftRewardsBot(false)

    try {
        await rewardsBot.initialize()
        await rewardsBot.run()
    } catch (error) {
        log(false, 'MAIN-ERROR', `Error running desktop bot: ${error}`, 'error')
    }
}

// Start the bots
main().catch(error => {
    log('main', 'MAIN-ERROR', `Error running bots: ${error}`, 'error')
    process.exit(1)
})