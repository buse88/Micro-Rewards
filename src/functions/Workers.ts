import { Page } from 'rebrowser-playwright'

import { DashboardData, MorePromotion, PromotionalItem, PunchCard } from '../interface/DashboardData'

import { MicrosoftRewardsBot } from '../index'

import { ChineseMessages } from '../util/ChineseMessages'

export class Workers {
    public bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    // Daily Set
    async doDailySet(page: Page, data: DashboardData) {
        const todayData = data.dailySetPromotions[this.bot.utils.getFormattedDate()]

        if (this.bot.config.enableDebugLog) {
            console.log('[debug] 每日任务数据存在:', !!todayData)
            if (todayData) {
                console.log('[debug] 每日任务数据类型:', typeof todayData)
                console.log('[debug] 每日任务数据长度:', Array.isArray(todayData) ? todayData.length : '非数组')
            }
        }

        const activitiesUncompleted = todayData?.filter(x => !x.complete && x.pointProgressMax > 0) ?? []

        if (this.bot.config.enableDebugLog) {
            console.log(`[debug] 每日任务总数: ${todayData?.length || 0}`)
            console.log(`[debug] 未完成每日任务数: ${activitiesUncompleted.length}`)
            if (todayData) {
                todayData.forEach((task: any, index: number) => {
                    console.log(`[debug] 每日任务${index + 1}: ${task.title} (${task.offerId}) - 积分:${task.pointProgressMax} - 完成:${task.complete}`)
                })
            }
        }

        if (!activitiesUncompleted.length) {
            this.bot.log(this.bot.isMobile, 'DAILY-SET', '所有"每日任务"项目已完成')
            return
        }

        // Solve Activities
        this.bot.log(this.bot.isMobile, 'DAILY-SET', '开始解决"每日任务"项目')

        if (this.bot.config.enableDebugLog) {
            console.log('[debug] 开始执行任务...')
        }

        await this.solveActivities(page, activitiesUncompleted)

        page = await this.bot.browser.utils.getLatestTab(page)

        // Always return to the homepage if not already
        await this.bot.browser.func.goHome(page)

        this.bot.log(this.bot.isMobile, 'DAILY-SET', '所有"每日任务"项目已完成')

        if (this.bot.config.enableDebugLog) {
            console.log('[debug] 任务执行完成')
        }
    }

    // Punch Card
    async doPunchCard(page: Page, data: DashboardData) {

        const punchCardsUncompleted = data.punchCards?.filter(x => x.parentPromotion && !x.parentPromotion.complete) ?? [] // Only return uncompleted punch cards

        if (!punchCardsUncompleted.length) {
            this.bot.log(this.bot.isMobile, 'PUNCH-CARD', ChineseMessages['All "Punch Cards" have already been completed'] || '所有"打卡卡"已完成')
            return
        }

        for (const punchCard of punchCardsUncompleted) {

            // Ensure parentPromotion exists before proceeding
            if (!punchCard.parentPromotion?.title) {
                this.bot.log(this.bot.isMobile, 'PUNCH-CARD', `跳过打卡卡"${punchCard.name}" | 原因: 父级促销活动缺失！`, 'warn')
                continue
            }

            // Get latest page for each card
            page = await this.bot.browser.utils.getLatestTab(page)

            const activitiesUncompleted = punchCard.childPromotions.filter(x => !x.complete) // Only return uncompleted activities

            // Solve Activities
            this.bot.log(this.bot.isMobile, 'PUNCH-CARD', `开始解决打卡卡"${punchCard.parentPromotion.title}"的项目`)

            // Got to punch card index page in a new tab
            await page.goto(punchCard.parentPromotion.destinationUrl, { referer: this.bot.config.baseURL })

            // Wait for new page to load, max 10 seconds, however try regardless in case of error
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { })

            if (this.bot.config.enableDebugLog) {
                console.log('[debug] 开始执行任务...')
            }

            await this.solveActivities(page, activitiesUncompleted, punchCard)

            page = await this.bot.browser.utils.getLatestTab(page)

            const pages = page.context().pages()

            if (pages.length > 3) {
                await page.close()
            } else {
                await this.bot.browser.func.goHome(page)
            }

            this.bot.log(this.bot.isMobile, 'PUNCH-CARD', `打卡卡"${punchCard.parentPromotion.title}"的所有项目已完成`)

            if (this.bot.config.enableDebugLog) {
                console.log('[debug] 任务执行完成')
            }
        }

        this.bot.log(this.bot.isMobile, 'PUNCH-CARD', ChineseMessages['All "Punch Card" items have been completed'] || '所有"打卡卡"项目已完成')
    }

    // More Promotions
    async doMorePromotions(page: Page, data: DashboardData) {
        // 使用与TG通知相同的数据源
        const morePromotions = (data as any).morePromotionsWithoutPromotionalItems || data.morePromotions || []

        if (this.bot.config.enableDebugLog) {
            console.log('[debug] 更多活动数据存在:', !!morePromotions)
            console.log('[debug] 更多活动数据类型:', typeof morePromotions)
            console.log('[debug] 更多活动数据长度:', Array.isArray(morePromotions) ? morePromotions.length : '非数组')
        }

        // 获取当天可执行的活动 - 基于API响应判断
        const todayWeekday = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
        if (this.bot.config.enableDebugLog) {
            console.log(`[debug] 今天是: ${todayWeekday}`)
        }
        
        // 筛选当天可执行的活动
        const todayActivities = morePromotions.filter((activity: any) => {
            const nameStr = activity.name || activity.offerId || ''
            const parts = nameStr.split('_')
            const lastPart = parts[parts.length - 1].toLowerCase()
            
            // 检查是否匹配今天的星期
            return lastPart === todayWeekday
        })
        
        if (this.bot.config.enableDebugLog) {
            console.log(`[debug] 更多活动总数: ${morePromotions.length}`)
            console.log(`[debug] 当天可执行活动数量: ${todayActivities.length}`)
            console.log('[debug] 所有更多活动:')
            morePromotions.forEach((activity: any, index: number) => {
                const nameStr = activity.name || activity.offerId || ''
                const parts = nameStr.split('_')
                const lastPart = parts[parts.length - 1].toLowerCase()
                const isToday = lastPart === todayWeekday
                console.log(`[debug] 活动${index + 1}: ${activity.title} (${activity.name}) - 星期:${lastPart} - 今天:${isToday} - 完成:${activity.complete} - 积分:${activity.pointProgressMax}`)
            })
            console.log('[debug] 当天活动:')
            todayActivities.forEach((activity: any) => {
                console.log(`[debug] 当天活动: ${activity.title} (${activity.name}) - 完成状态: ${activity.complete} - 积分:${activity.pointProgressMax}`)
            })
        }

        // 筛选未完成的活动
        const activitiesUncompleted = todayActivities.filter((x: any) => 
            !x.complete && 
            x.pointProgressMax > 0 && 
            x.exclusiveLockedFeatureStatus !== 'locked'
        )

        if (this.bot.config.enableDebugLog) {
            console.log(`[debug] 未完成活动数量: ${activitiesUncompleted.length}`)
            activitiesUncompleted.forEach((activity: any) => {
                console.log(`[debug] 待执行活动: ${activity.title} (${activity.name}) - 类型:${activity.promotionType} - 积分:${activity.pointProgressMax}`)
            })
        }

        if (!activitiesUncompleted.length) {
            this.bot.log(this.bot.isMobile, 'MORE-PROMOTIONS', 'All "More Promotion" items have already been completed')
            return
        }

        // Solve Activities
        this.bot.log(this.bot.isMobile, 'MORE-PROMOTIONS', 'Started solving "More Promotions" items')

        page = await this.bot.browser.utils.getLatestTab(page)

        if (this.bot.config.enableDebugLog) {
            console.log('[debug] 开始执行任务...')
        }

        await this.solveActivities(page, activitiesUncompleted)

        page = await this.bot.browser.utils.getLatestTab(page)

        // Always return to the homepage if not already
        await this.bot.browser.func.goHome(page)

        this.bot.log(this.bot.isMobile, 'MORE-PROMOTIONS', 'All "More Promotion" items have been completed')

        if (this.bot.config.enableDebugLog) {
            console.log('[debug] 任务执行完成')
        }
    }

    // Solve all the different types of activities
    private async solveActivities(activityPage: Page, activities: PromotionalItem[] | MorePromotion[], punchCard?: PunchCard) {
        const activityInitial = activityPage.url() // Homepage for Daily/More and Index for promotions

        if (this.bot.config.enableDebugLog) {
            console.log(`[debug] 开始执行 ${activities.length} 个任务`)
            console.log(`[debug] 初始页面URL: ${activityInitial}`)
        }

        for (const activity of activities) {
            try {
                if (this.bot.config.enableDebugLog) {
                    console.log(`[debug] 执行任务: ${activity.title} (${activity.offerId}) - 类型:${activity.promotionType} - 积分:${activity.pointProgressMax}`)
                }

                // Reselect the worker page
                activityPage = await this.bot.browser.utils.getLatestTab(activityPage)

                const pages = activityPage.context().pages()
                if (pages.length > 3) {
                    await activityPage.close()

                    activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                }

                await this.bot.utils.wait(1000)

                if (activityPage.url() !== activityInitial) {
                    await activityPage.goto(activityInitial)
                }

                let selector = `[data-bi-id^="${activity.offerId}"] .pointLink:not(.contentContainer .pointLink)`

                if (punchCard) {
                    selector = await this.bot.browser.func.getPunchCardActivity(activityPage, activity)

                } else if (activity.name.toLowerCase().includes('membercenter') || activity.name.toLowerCase().includes('exploreonbing')) {
                    selector = `[data-bi-id^="${activity.name}"] .pointLink:not(.contentContainer .pointLink)`
                }

                if (this.bot.config.enableDebugLog) {
                    console.log(`[debug] 任务选择器: ${selector}`)
                }

                // Wait for the new tab to fully load, ignore error.
                /*
                Due to common false timeout on this function, we're ignoring the error regardless, if it worked then it's faster,
                if it didn't then it gave enough time for the page to load.
                */
                await activityPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { })
                await this.bot.utils.wait(2000)

                switch (activity.promotionType) {
                    // Quiz (Poll, Quiz or ABC)
                    case 'quiz':
                        switch (activity.pointProgressMax) {
                            // Poll or ABC (Usually 10 points)
                            case 10:
                                // Normal poll
                                if (activity.destinationUrl.toLowerCase().includes('pollscenarioid')) {
                                    this.bot.log(this.bot.isMobile, 'ACTIVITY', `发现活动类型: "投票" 标题: "${activity.title}"`)
                                    if (this.bot.config.enableDebugLog) {
                                        console.log(`[debug] 执行投票任务: ${activity.title}`)
                                    }
                                    await activityPage.click(selector)
                                    activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                                    await this.bot.activities.doPoll(activityPage)
                                } else { // ABC
                                    this.bot.log(this.bot.isMobile, 'ACTIVITY', `发现活动类型: "ABC" 标题: "${activity.title}"`)
                                    if (this.bot.config.enableDebugLog) {
                                        console.log(`[debug] 执行ABC任务: ${activity.title}`)
                                    }
                                    await activityPage.click(selector)
                                    activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                                    await this.bot.activities.doABC(activityPage)
                                }
                                break

                            // This Or That Quiz (Usually 50 points)
                            case 50:
                                this.bot.log(this.bot.isMobile, 'ACTIVITY', `发现活动类型: "二选一" 标题: "${activity.title}"`)
                                if (this.bot.config.enableDebugLog) {
                                    console.log(`[debug] 执行二选一任务: ${activity.title}`)
                                }
                                await activityPage.click(selector)
                                activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                                await this.bot.activities.doThisOrThat(activityPage)
                                break

                            // Normal Quiz (Usually 40 points)
                            default:
                                this.bot.log(this.bot.isMobile, 'ACTIVITY', `发现活动类型: "测验" 标题: "${activity.title}"`)
                                if (this.bot.config.enableDebugLog) {
                                    console.log(`[debug] 执行测验任务: ${activity.title}`)
                                }
                                await activityPage.click(selector)
                                activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                                await this.bot.activities.doQuiz(activityPage)
                                break
                        }
                        break

                    // URL Reward
                    case 'urlreward':
                        this.bot.log(this.bot.isMobile, 'ACTIVITY', `发现活动类型: "URL奖励" 标题: "${activity.title}"`)
                        if (this.bot.config.enableDebugLog) {
                            console.log(`[debug] 执行URL奖励任务: ${activity.title}`)
                        }
                            await activityPage.click(selector)
                            activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                        await this.bot.activities.doUrlReward(activityPage)
                        break

                    // Search on Bing
                    case 'searchonbing':
                        this.bot.log(this.bot.isMobile, 'ACTIVITY', `发现活动类型: "必应搜索" 标题: "${activity.title}"`)
                        if (this.bot.config.enableDebugLog) {
                            console.log(`[debug] 执行必应搜索任务: ${activity.title}`)
                        }
                            await activityPage.click(selector)
                            activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                        await this.bot.activities.doSearchOnBing(activityPage, activity)
                        break

                    default:
                        this.bot.log(this.bot.isMobile, 'ACTIVITY', `未知活动类型: "${activity.promotionType}" 标题: "${activity.title}"`, 'warn')
                        if (this.bot.config.enableDebugLog) {
                            console.log(`[debug] 未知任务类型: ${activity.promotionType} - ${activity.title}`)
                        }
                        break
                }

                if (this.bot.config.enableDebugLog) {
                    console.log(`[debug] 任务完成: ${activity.title}`)
                }

                // Cooldown
                await this.bot.utils.wait(2000)

            } catch (error) {
                this.bot.log(this.bot.isMobile, 'ACTIVITY', 'An error occurred:' + error, 'error')
                if (this.bot.config.enableDebugLog) {
                    console.log(`[debug] 任务执行错误: ${activity.title} - ${error}`)
                }
            }

        }

        if (this.bot.config.enableDebugLog) {
            console.log(`[debug] 所有任务执行完成`)
        }
    }

}