import { BrowserContext, Page } from 'rebrowser-playwright'
import { CheerioAPI, load } from 'cheerio'
import { AxiosRequestConfig } from 'axios'

import { MicrosoftRewardsBot } from '../index'
import { saveSessionData } from '../util/Load'

import { Counters, DashboardData, MorePromotion, PromotionalItem } from './../interface/DashboardData'
import { QuizData } from './../interface/QuizData'
import { AppUserData } from '../interface/AppUserData'
import { EarnablePoints } from '../interface/Points'


export default class BrowserFunc {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }


    /**
     * Navigate the provided page to rewards homepage
     * @param {Page} page Playwright page
    */
    async goHome(page: Page) {
        try {
            await this.bot.browser.utils.safeGoto(page, this.bot.config.baseURL)
            await page.waitForLoadState('domcontentloaded')
            await this.bot.browser.utils.reloadBadPage(page)

            this.bot.log(this.bot.isMobile, 'GO-HOME', '成功访问主页')

        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GO-HOME', '访问主页时发生错误:' + error, 'error')
        }
    }

    /**
     * Fetch user dashboard data
     * @returns {DashboardData} Object of user bing rewards dashboard data
    */
    async getDashboardData(): Promise<DashboardData> {
        const dashboardURL = new URL(this.bot.config.baseURL)
        const currentURL = new URL(this.bot.homePage.url())

        try {
            // Should never happen since tasks are opened in a new tab!
            if (currentURL.hostname !== dashboardURL.hostname) {
                this.bot.log(this.bot.isMobile, 'DASHBOARD-DATA', '当前页面不是dashboard页面，正在跳转到dashboard页面')
                await this.goHome(this.bot.homePage)
            }

            // Reload the page to get new data
            await this.bot.homePage.reload({ waitUntil: 'domcontentloaded' })

            const scriptContent = await this.bot.homePage.evaluate(() => {
                const scripts = Array.from(document.querySelectorAll('script'))
                const targetScript = scripts.find(script => script.innerText.includes('var dashboard'))

                return targetScript?.innerText ? targetScript.innerText : null
            })

            if (!scriptContent) {
                throw this.bot.log(this.bot.isMobile, 'GET-DASHBOARD-DATA', '在脚本中未找到dashboard数据', 'error')
            }

            // Extract the dashboard object from the script content
            const dashboardData = await this.bot.homePage.evaluate(scriptContent => {
                // Extract the dashboard object using regex
                const regex = /var dashboard = (\{.*?\});/s
                const match = regex.exec(scriptContent)

                if (match && match[1]) {
                    return JSON.parse(match[1])
                }

            }, scriptContent)

            if (!dashboardData) {
                throw this.bot.log(this.bot.isMobile, 'GET-DASHBOARD-DATA', '无法解析dashboard脚本', 'error')
            }

            // 添加调试日志
            if (this.bot.config.enableDebugLog) {
                console.log('[debug] 从浏览器页面获取到的dashboard数据:')
                console.log('[debug] - 用户状态:', {
                    availablePoints: dashboardData.userStatus?.availablePoints,
                    lifetimePoints: dashboardData.userStatus?.lifetimePoints,
                    levelInfo: dashboardData.userStatus?.levelInfo
                })
                console.log(`[debug] 接口返回地区：${dashboardData.userProfile?.attributes?.country || '未设置'}`)
                console.log('[debug] - 用户地区:', dashboardData.userProfile?.attributes?.country)
                console.log('[debug] - 用户语言:', dashboardData.userProfile?.attributes?.language || '未设置')
                console.log('[debug] - 用户ruid:', dashboardData.userProfile?.ruid)
                console.log('[debug] - 配置的preferredCountry:', this.bot.config.searchSettings.preferredCountry)
                
                // 修复每日任务数量显示 - 显示实际的每日任务数量
                const today = this.bot.utils.getFormattedDate()
                const todayTasks = dashboardData.dailySetPromotions?.[today] || []
                console.log('[debug] - 每日任务数量:', todayTasks.length)
                console.log('[debug] - 更多活动数量:', (dashboardData.morePromotionsWithoutPromotionalItems || []).length)
                console.log('[debug] - 搜索计数器:', {
                    pcSearch: dashboardData.userStatus?.counters?.pcSearch?.length || 0,
                    mobileSearch: dashboardData.userStatus?.counters?.mobileSearch?.length || 0
                })
                
                // 显示每日任务的详细信息
                if (todayTasks.length > 0) {
                    console.log('[debug] - 每日任务详情:')
                    todayTasks.forEach((task: any, index: number) => {
                        console.log(`[debug]   任务${index + 1}: ${task.title} (${task.offerId}) - 积分:${task.pointProgressMax} - 完成:${task.complete}`)
                    })
                }
                
                // 显示更多活动的详细信息
                if (dashboardData.morePromotionsWithoutPromotionalItems && dashboardData.morePromotionsWithoutPromotionalItems.length > 0) {
                    console.log('[debug] - 更多活动详情:')
                    dashboardData.morePromotionsWithoutPromotionalItems.forEach((activity: any, index: number) => {
                        console.log(`[debug]   活动${index + 1}: ${activity.title} (${activity.name}) - 完成:${activity.complete}`)
                    })
                }
            }

            return dashboardData

        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GET-DASHBOARD-DATA', `获取dashboard数据时发生错误: ${error}`, 'error')
        }

    }

    /**
     * Get search point counters
     * @returns {Counters} Object of search counter data
    */
    async getSearchPoints(): Promise<Counters> {
        const dashboardData = await this.getDashboardData() // Always fetch newest data

        return dashboardData.userStatus.counters
    }

    /**
     * Get total earnable points with web browser
     * @returns {number} Total earnable points
    */
    async getBrowserEarnablePoints(): Promise<EarnablePoints> {
        try {
            let desktopSearchPoints = 0
            let mobileSearchPoints = 0
            let dailySetPoints = 0
            let morePromotionsPoints = 0

            const data = await this.getDashboardData()

            // Desktop Search Points
            if (data.userStatus.counters.pcSearch?.length) {
                data.userStatus.counters.pcSearch.forEach(x => desktopSearchPoints += (x.pointProgressMax - x.pointProgress))
            }

            // Mobile Search Points
            if (data.userStatus.counters.mobileSearch?.length) {
                data.userStatus.counters.mobileSearch.forEach(x => mobileSearchPoints += (x.pointProgressMax - x.pointProgress))
            }

            // Daily Set
            data.dailySetPromotions[this.bot.utils.getFormattedDate()]?.forEach(x => dailySetPoints += (x.pointProgressMax - x.pointProgress))

            // More Promotions
            if (data.morePromotions?.length) {
                data.morePromotions.forEach(x => {
                    // Only count points from supported activities
                    if (['quiz', 'urlreward'].includes(x.promotionType) && x.exclusiveLockedFeatureStatus !== 'locked') {
                        morePromotionsPoints += (x.pointProgressMax - x.pointProgress)
                    }
                })
            }

            const totalEarnablePoints = desktopSearchPoints + mobileSearchPoints + dailySetPoints + morePromotionsPoints

            return {
                dailySetPoints,
                morePromotionsPoints,
                desktopSearchPoints,
                mobileSearchPoints,
                totalEarnablePoints
            }
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GET-BROWSER-EARNABLE-POINTS', '获取浏览器可赚取积分时发生错误:' + error, 'error')
        }
    }

    /**
     * Get total earnable points with mobile app
     * @returns {number} Total earnable points
    */
    async getAppEarnablePoints(accessToken: string) {
        try {
            const points = {
                readToEarn: 0,
                checkIn: 0,
                totalEarnablePoints: 0
            }

            const eligibleOffers = [
                'ENUS_readarticle3_30points',
                'Gamification_Sapphire_DailyCheckIn'
            ]

            const data = await this.getDashboardData()
            let geoLocale = data.userProfile.attributes.country
            geoLocale = (this.bot.config.searchSettings.useGeoLocaleQueries && geoLocale.length === 2) ? geoLocale.toLowerCase() : 'us'

            const userDataRequest: AxiosRequestConfig = {
                url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'X-Rewards-Country': geoLocale,
                    'X-Rewards-Language': this.bot.config.searchSettings.rewardsLanguage || 'en'
                }
            }

            const userDataResponse: AppUserData = (await this.bot.axios.request(userDataRequest)).data
            const userData = userDataResponse.response
            const eligibleActivities = userData.promotions.filter((x) => eligibleOffers.includes(x.attributes.offerid ?? ''))

            for (const item of eligibleActivities) {
                if (item.attributes.type === 'msnreadearn') {
                    points.readToEarn = parseInt(item.attributes.pointmax ?? '') - parseInt(item.attributes.pointprogress ?? '')
                    break
                } else if (item.attributes.type === 'checkin') {
                    const checkInDay = parseInt(item.attributes.progress ?? '') % 7

                    if (checkInDay < 6 && (new Date()).getDate() != (new Date(item.attributes.last_updated ?? '')).getDate()) {
                        points.checkIn = parseInt(item.attributes['day_' + (checkInDay + 1) + '_points'] ?? '')
                    }
                    break
                }
            }

            points.totalEarnablePoints = points.readToEarn + points.checkIn

            return points
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GET-APP-EARNABLE-POINTS', '获取应用可赚取积分时发生错误:' + error, 'error')
        }
    }

    /**
     * Get current point amount
     * @returns {number} Current total point amount
    */
    async getCurrentPoints(): Promise<number> {
        try {
            const data = await this.getDashboardData()

            return data.userStatus.availablePoints
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GET-CURRENT-POINTS', '获取当前积分时发生错误:' + error, 'error')
        }
    }

    /**
     * Parse quiz data from provided page
     * @param {Page} page Playwright page
     * @returns {QuizData} Quiz data object
    */
    async getQuizData(page: Page): Promise<QuizData> {
        try {
            const html = await page.content()
            const $ = load(html)

            const scriptContent = $('script').filter((index, element) => {
                return $(element).text().includes('_w.rewardsQuizRenderInfo')
            }).text()

            if (scriptContent) {
                const regex = /_w\.rewardsQuizRenderInfo\s*=\s*({.*?});/s
                const match = regex.exec(scriptContent)

                if (match && match[1]) {
                    const quizData = JSON.parse(match[1])
                    return quizData
                } else {
                    throw this.bot.log(this.bot.isMobile, 'GET-QUIZ-DATA', '未找到包含测验数据的脚本', 'error')
                }
            } else {
                throw this.bot.log(this.bot.isMobile, 'GET-QUIZ-DATA', 'Script containing quiz data not found', 'error')
            }

        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GET-QUIZ-DATA', '获取测验数据时发生错误:' + error, 'error')
        }

    }

    async waitForQuizRefresh(page: Page): Promise<boolean> {
        try {
            await page.waitForSelector('span.rqMCredits', { state: 'visible', timeout: 10000 })
            await this.bot.utils.wait(2000)

            return true
        } catch (error) {
            this.bot.log(this.bot.isMobile, 'QUIZ-REFRESH', '刷新测验时发生错误:' + error, 'error')
            return false
        }
    }

    async checkQuizCompleted(page: Page): Promise<boolean> {
        try {
            await page.waitForSelector('#quizCompleteContainer', { state: 'visible', timeout: 2000 })
            await this.bot.utils.wait(2000)

            return true
        } catch (error) {
            return false
        }
    }

    async loadInCheerio(page: Page): Promise<CheerioAPI> {
        const html = await page.content()
        const $ = load(html)

        return $
    }

    async getPunchCardActivity(page: Page, activity: PromotionalItem | MorePromotion): Promise<string> {
        let selector = ''
        try {
            const html = await page.content()
            const $ = load(html)

            const element = $('.offer-cta').toArray().find(x => x.attribs.href?.includes(activity.offerId))
            if (element) {
                selector = `a[href*="${element.attribs.href}"]`
            }
        } catch (error) {
            this.bot.log(this.bot.isMobile, 'GET-PUNCHCARD-ACTIVITY', '获取打卡活动时发生错误:' + error, 'error')
        }

        return selector
    }

    async closeBrowser(browser: BrowserContext, email: string) {
        try {
            // 检查浏览器上下文是否有效
            if (!browser) {
                this.bot.log(this.bot.isMobile, 'CLOSE-BROWSER', '浏览器上下文无效，跳过清理')
                return
            }

            // Save cookies
            try {
                await saveSessionData(this.bot.config.sessionPath, browser, email, this.bot.isMobile)
            } catch (cookieError) {
                this.bot.log(this.bot.isMobile, 'CLOSE-BROWSER', `保存cookies失败: ${cookieError}`, 'error')
            }

            await this.bot.utils.wait(500) // 减少等待时间

            // 关闭所有页面
            try {
                const pages = browser.pages()
                for (const page of pages) {
                    try {
                        if (!page.isClosed()) {
                            await page.close()
                        }
                    } catch (pageError) {
                        // 忽略页面关闭错误
                        this.bot.log(this.bot.isMobile, 'CLOSE-BROWSER', `关闭页面失败: ${pageError}`, 'error')
                    }
                }
            } catch (pagesError) {
                this.bot.log(this.bot.isMobile, 'CLOSE-BROWSER', `获取页面列表失败: ${pagesError}`, 'error')
            }

            // Close browser
            try {
                await browser.close()
                this.bot.log(this.bot.isMobile, 'CLOSE-BROWSER', '浏览器已干净关闭！')
            } catch (closeError) {
                this.bot.log(this.bot.isMobile, 'CLOSE-BROWSER', `关闭浏览器失败: ${closeError}`, 'error')
            }
        } catch (error) {
            this.bot.log(this.bot.isMobile, 'CLOSE-BROWSER', `关闭浏览器过程中发生错误: ${error}`, 'error')
        }
    }
}