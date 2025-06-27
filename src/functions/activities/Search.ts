import { Page } from 'rebrowser-playwright'
import { platform } from 'os'

import { Workers } from '../Workers'

import { Counters, DashboardData } from '../../interface/DashboardData'
import { GoogleSearch } from '../../interface/Search'
import { AxiosRequestConfig } from 'axios'

type GoogleTrendsResponse = [
    string,
    [
        string,
        ...null[],
        [string, ...string[]]
    ][]
];

// 国内热点API配置
interface HotApiConfig {
    url: string;
    hot: string[];
}

export class Search extends Workers {
    private bingHome = 'https://bing.com'
    private searchPageURL = ''

    // 国内热点API配置
    private hotApiConfigs: Map<string, HotApiConfig> = new Map([
        ["hot.eray.cc", {
            url: "https://dailyapi.eray.cc/",
            hot: ["weibo", "douyin", "baidu", "toutiao", "thepaper", "qq-news", "netease-news", "zhihu"]
        }],
        ["hot.baiwumm.com", {
            url: "https://hot.baiwumm.com/api/",
            hot: ["weibo", "douyin", "baidu", "toutiao", "thepaper", "qq", "netease", "zhihu"]
        }],
        ["hot.cnxiaobai.com", {
            url: "https://cnxiaobai.com/DailyHotApi/",
            hot: ["weibo", "douyin", "baidu", "toutiao", "thepaper", "qq-news", "netease-news", "zhihu"]
        }],
        ["hot.zhusun.top", {
            url: "https://hotapi.zhusun.top/",
            hot: ["weibo", "douyin", "baidu", "toutiao", "thepaper", "qq-news", "netease-news", "zhihu"]
        }],
        ["hot.imsyy.top", {
            url: "https://api-hot.imsyy.top/",
            hot: ["weibo", "douyin", "baidu", "toutiao", "thepaper", "qq-news", "netease-news", "zhihu"]
        }],
        ["hot.nntool.cc", {
            url: "https://hotapi.nntool.cc/",
            hot: ["weibo", "douyin", "baidu", "toutiao", "thepaper", "qq-news", "netease-news", "zhihu"]
        }]
    ]);

    // 搜索词缓存
    private searchWordCache: {
        list: string[];
        index: number;
        lastUpdate: number;
    } = {
        list: [],
        index: 0,
        lastUpdate: 0
    };

    public async doSearch(page: Page, data: DashboardData) {
        this.bot.log(this.bot.isMobile, 'SEARCH-BING', '开始必应搜索')

        // 添加配置检查日志
        this.bot.log(this.bot.isMobile, 'SEARCH-BING', `配置检查 - useDomesticHotAPIs: ${this.bot.config.searchSettings.useDomesticHotAPIs}`)
        this.bot.log(this.bot.isMobile, 'SEARCH-BING', `配置检查 - useGeoLocaleQueries: ${this.bot.config.searchSettings.useGeoLocaleQueries}`)

        page = await this.bot.browser.utils.getLatestTab(page)

        let searchCounters: Counters = await this.bot.browser.func.getSearchPoints()
        let missingPoints = this.calculatePoints(searchCounters)

        // 根据用户等级和API数据优化搜索限制
        const userLevel = data.userStatus.levelInfo.activeLevel
        const isLevel2 = userLevel === 'Level2'
        
        // 根据等级和平台设置搜索限制
        let maxSearchPoints: number
        
        if (this.bot.isMobile) {
            maxSearchPoints = isLevel2 ? 60 : 30 // 2级用户移动端60积分，1级用户30积分
        } else {
            maxSearchPoints = isLevel2 ? 90 : 30 // 2级用户桌面端90积分，1级用户30积分
        }

        this.bot.log(this.bot.isMobile, 'SEARCH-BING', `用户等级: ${userLevel}, 最大搜索积分: ${maxSearchPoints}, 剩余积分: ${missingPoints}`)

        if (missingPoints === 0) {
            this.bot.log(this.bot.isMobile, 'SEARCH-BING', '必应搜索已完成')
            await page.close() // 及时关闭页面
            return
        }

        // 根据配置选择搜索词获取方式 - 强制使用国内API
        let searchQueries: GoogleSearch[]
        const useDomesticAPIs = this.bot.config.searchSettings.useDomesticHotAPIs || true // 如果配置未加载，默认使用国内API
        
        if (useDomesticAPIs) {
            this.bot.log(this.bot.isMobile, 'SEARCH-BING', '使用国内热点API获取搜索词')
            searchQueries = await this.getHotSearchQueries()
        } else {
            this.bot.log(this.bot.isMobile, 'SEARCH-BING', '使用Google Trends获取搜索词')
            // 优先使用preferredCountry配置，如果没有配置则使用账号地区，最后回退到US
            let searchCountry = 'US'
            if (this.bot.config.searchSettings.useGeoLocaleQueries) {
                if (this.bot.config.searchSettings.preferredCountry && this.bot.config.searchSettings.preferredCountry.length === 2) {
                    searchCountry = this.bot.config.searchSettings.preferredCountry.toUpperCase()
                    this.bot.log(this.bot.isMobile, 'SEARCH-BING', `使用preferredCountry配置的地区: ${searchCountry}`)
                } else if (data.userProfile.attributes.country && data.userProfile.attributes.country.length === 2) {
                    searchCountry = data.userProfile.attributes.country.toUpperCase()
                    this.bot.log(this.bot.isMobile, 'SEARCH-BING', `使用账号实际地区: ${searchCountry}`)
                }
            }
            searchQueries = await this.getGoogleTrends(searchCountry)
        }
        
        searchQueries = this.bot.utils.shuffleArray(searchQueries)

        // 去重搜索词
        searchQueries = [...new Set(searchQueries)]

        // 根据用户等级和平台限制搜索词数量
        const maxQueries = this.bot.isMobile ? Math.min(20, maxSearchPoints) : Math.min(30, maxSearchPoints)
        if (searchQueries.length > maxQueries) {
            searchQueries = searchQueries.slice(0, maxQueries)
            this.bot.log(this.bot.isMobile, 'SEARCH-BING', `限制搜索词数量为 ${maxQueries} 个，避免资源过度消耗`)
        }

        // 前往必应
        await this.bot.browser.utils.safeGoto(page, this.searchPageURL ? this.searchPageURL : this.bingHome)

        await this.bot.utils.wait(500) // 减少等待时间

        await this.bot.browser.utils.tryDismissAllMessages(page)

        let maxLoop = 0 // 如果循环达到5次但没有获得积分，我们假设它卡住了

        const queries: string[] = []
        // 移动搜索似乎不喜欢相关查询？
        searchQueries.forEach(x => { this.bot.isMobile ? queries.push(x.topic) : queries.push(x.topic, ...x.related) })

        // 循环搜索查询
        for (let i = 0; i < queries.length; i++) {
            const query = queries[i] as string

            this.bot.log(this.bot.isMobile, 'SEARCH-BING', `剩余积分: ${missingPoints}/${maxSearchPoints} | 搜索词: ${query}`)

            searchCounters = await this.bingSearch(page, query)
            
            const newMissingPoints = this.calculatePoints(searchCounters)

            // 如果新的积分数量与之前相同
            if (newMissingPoints == missingPoints) {
                maxLoop++ // 添加到最大循环
            } else { // 积分发生了变化
                maxLoop = 0 // 重置循环
            }

            missingPoints = newMissingPoints

            if (missingPoints === 0) {
                this.bot.log(this.bot.isMobile, 'SEARCH-BING', '搜索积分已完成')
                break
            }

            // 检查是否达到最大积分限制
            const earnedPoints = maxSearchPoints - missingPoints
            if (earnedPoints >= maxSearchPoints) {
                this.bot.log(this.bot.isMobile, 'SEARCH-BING', `已达到最大积分限制 ${maxSearchPoints}，停止搜索`)
                break
            }

            // 仅用于移动搜索
            if (maxLoop > 3 && this.bot.isMobile) {
                this.bot.log(this.bot.isMobile, 'SEARCH-BING', '搜索连续3次未获得积分，可能是User-Agent问题', 'warn')
                break
            }

            // 如果我们5次迭代都没有获得积分，假设它卡住了
            if (maxLoop > 5) {
                this.bot.log(this.bot.isMobile, 'SEARCH-BING', '搜索连续5次未获得积分，停止搜索', 'warn')
                maxLoop = 0 // 重置为0，这样我们可以在下面重试相关搜索
                break
            }
        }

        // 仅用于移动搜索
        if (missingPoints > 0 && this.bot.isMobile) {
            this.bot.log(this.bot.isMobile, 'SEARCH-BING', `移动端搜索完成，剩余 ${missingPoints} 积分`)
            await page.close() // 及时关闭页面
            return
        }

        // 如果我们还有剩余的搜索查询，生成额外的查询
        if (missingPoints > 0) {
            this.bot.log(this.bot.isMobile, 'SEARCH-BING', `搜索完成但还缺少 ${missingPoints} 积分，生成额外搜索`)

            let i = 0
            while (missingPoints > 0) {
                const query = searchQueries[i++] as GoogleSearch

                // 获取与搜索查询相关的搜索词
                const relatedTerms = await this.getRelatedTerms(query?.topic)
                if (relatedTerms.length > 2) {
                    // 搜索前2个相关词
                    for (const term of relatedTerms.slice(1, 3)) {
                        this.bot.log(this.bot.isMobile, 'SEARCH-BING-EXTRA', `剩余积分: ${missingPoints} | 额外搜索词: ${term}`)

                        searchCounters = await this.bingSearch(page, term)
                        
                        const newMissingPoints = this.calculatePoints(searchCounters)

                        // 如果新的积分数量与之前相同
                        if (newMissingPoints == missingPoints) {
                            maxLoop++ // 添加到最大循环
                        } else { // 积分发生了变化
                            maxLoop = 0 // 重置循环
                        }

                        missingPoints = newMissingPoints

                        // 如果我们满足了搜索
                        if (missingPoints === 0) {
                            break
                        }

                        // 再试3次，然后我们总共尝试了8次，公平地说它卡住了
                        if (maxLoop > 3) {
                            this.bot.log(this.bot.isMobile, 'SEARCH-BING-EXTRA', '额外搜索连续3次未获得积分，停止搜索', 'warn')
                            await page.close() // 及时关闭页面
                            return
                        }
                    }
                }
            }
        }

        this.bot.log(this.bot.isMobile, 'SEARCH-BING', `搜索完成，获得积分: ${maxSearchPoints - missingPoints}/${maxSearchPoints}`)
        await page.close() // 搜索完成后及时关闭页面
    }

    private async bingSearch(searchPage: Page, query: string) {
        const platformControlKey = platform() === 'darwin' ? 'Meta' : 'Control'

        // Try a max of 3 times (减少重试次数)
        for (let i = 0; i < 3; i++) {
            try {
                // This page had already been set to the Bing.com page or the previous search listing, we just need to select it
                searchPage = await this.bot.browser.utils.getLatestTab(searchPage)

                // Go to top of the page
                await searchPage.evaluate(() => {
                    window.scrollTo(0, 0)
                })

                await this.bot.utils.wait(200) // 减少等待时间

                const searchBar = '#sb_form_q'
                await searchPage.waitForSelector(searchBar, { state: 'visible', timeout: 8000 }) // 减少超时时间
                await searchPage.click(searchBar) // Focus on the textarea
                await this.bot.utils.wait(200) // 减少等待时间
                await searchPage.keyboard.down(platformControlKey)
                await searchPage.keyboard.press('A')
                await searchPage.keyboard.press('Backspace')
                await searchPage.keyboard.up(platformControlKey)
                await searchPage.keyboard.type(query)
                await searchPage.keyboard.press('Enter')

                await this.bot.utils.wait(1500) // 减少等待时间

                // Bing.com in Chrome opens a new tab when searching
                const resultPage = await this.bot.browser.utils.getLatestTab(searchPage)
                this.searchPageURL = new URL(resultPage.url()).href // Set the results page

                await this.bot.browser.utils.reloadBadPage(resultPage)

                if (this.bot.config.searchSettings.scrollRandomResults) {
                    await this.bot.utils.wait(500) // 减少等待时间
                    await this.randomScroll(resultPage)
                }

                if (this.bot.config.searchSettings.clickRandomResults) {
                    await this.bot.utils.wait(500) // 减少等待时间
                    await this.clickRandomLink(resultPage)
                }

                // Delay between searches (使用配置中的延迟)
                const delay = Math.floor(this.bot.utils.randomNumber(this.bot.utils.stringToMs(this.bot.config.searchSettings.searchDelay.min), this.bot.utils.stringToMs(this.bot.config.searchSettings.searchDelay.max)))
                await this.bot.utils.wait(delay)

                return await this.bot.browser.func.getSearchPoints()

            } catch (error) {
                if (i === 2) { // 修改为2，因为重试次数改为3次
                    this.bot.log(this.bot.isMobile, 'SEARCH-BING', '重试3次后失败... 发生错误:' + error, 'error')
                    break
                }

                this.bot.log(this.bot.isMobile, 'SEARCH-BING', '搜索失败，发生错误:' + error, 'error')
                this.bot.log(this.bot.isMobile, 'SEARCH-BING', `重试搜索，第 ${i + 1}/3 次尝试`, 'warn')

                // Reset the tabs
                const lastTab = await this.bot.browser.utils.getLatestTab(searchPage)
                await this.closeTabs(lastTab)

                await this.bot.utils.wait(1000) // 减少等待时间
            }
        }

        this.bot.log(this.bot.isMobile, 'SEARCH-BING', '重试3次后搜索失败，结束搜索', 'error')
        return await this.bot.browser.func.getSearchPoints()
    }

    // 获取国内热点搜索词
    private async getHotSearchQueries(): Promise<GoogleSearch[]> {
        this.bot.log(this.bot.isMobile, 'SEARCH-HOT-API', '正在从国内热点API生成搜索词')

        try {
            // 检查缓存是否有效（1小时更新一次）
            const now = Date.now()
            if (this.searchWordCache.list.length > 0 && (now - this.searchWordCache.lastUpdate) < 3600000) {
                this.bot.log(this.bot.isMobile, 'SEARCH-HOT-API', '使用缓存的搜索词')
                return this.convertToGoogleSearchFormat(this.searchWordCache.list)
            }

            // 尝试从不同的API获取热点
            const apiNames = Array.from(this.hotApiConfigs.keys())
            let success = false

            for (const apiName of apiNames) {
                try {
                    const config = this.hotApiConfigs.get(apiName)!
                    const hotType = config.hot[Math.floor(Math.random() * config.hot.length)]
                    
                    this.bot.log(this.bot.isMobile, 'SEARCH-HOT-API', `正在尝试API: ${apiName}, 类型: ${hotType}`)
                    this.bot.log(this.bot.isMobile, 'SEARCH-HOT-API', `请求URL: ${config.url}${hotType}`)
                    
                    const response = await this.bot.axios.request({
                        url: `${config.url}${hotType}`,
                        method: 'GET',
                        timeout: 3000, // 缩短超时时间到3秒
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        }
                    }, this.bot.config.proxy.proxyDomesticHotAPIs ? this.bot.config.proxy.proxyDomesticHotAPIs : undefined)

                    this.bot.log(this.bot.isMobile, 'SEARCH-HOT-API', `响应状态: ${response.status}`)
                    this.bot.log(this.bot.isMobile, 'SEARCH-HOT-API', `响应数据键: ${Object.keys(response.data || {}).join(', ')}`)

                    if (response.data && response.data.code === 200 && response.data.data) {
                        const titles = response.data.data.map((item: any) => item.title || item.name || item.query)
                        if (titles.length > 0) {
                            // 限制搜索词数量，避免过多消耗资源
                            const maxQueries = this.bot.isMobile ? 30 : 50
                            this.searchWordCache.list = titles.slice(0, maxQueries)
                            this.searchWordCache.lastUpdate = now
                            this.searchWordCache.index = 0
                            success = true
                            this.bot.log(this.bot.isMobile, 'SEARCH-HOT-API', `成功从 ${apiName} 获取 ${this.searchWordCache.list.length} 个搜索词`)
                            this.bot.log(this.bot.isMobile, 'SEARCH-HOT-API', `示例标题: ${this.searchWordCache.list.slice(0, 3).join(', ')}`)
                            break
                        } else {
                            this.bot.log(this.bot.isMobile, 'SEARCH-HOT-API', `从 ${apiName} 的响应中未找到有效标题`, 'warn')
                        }
                    } else {
                        this.bot.log(this.bot.isMobile, 'SEARCH-HOT-API', `从 ${apiName} 收到无效响应格式: code=${response.data?.code}, hasData=${!!response.data?.data}`, 'warn')
                    }
                } catch (error) {
                    this.bot.log(this.bot.isMobile, 'SEARCH-HOT-API', `从 ${apiName} 获取搜索词失败: ${error}`, 'warn')
                    // 快速切换到下一个API，不等待
                    continue
                }
            }

            if (!success) {
                this.bot.log(this.bot.isMobile, 'SEARCH-HOT-API', '所有热点API都失败了，回退到Google Trends', 'warn')
                return this.getGoogleTrends()
            }

            return this.convertToGoogleSearchFormat(this.searchWordCache.list)

        } catch (error) {
            this.bot.log(this.bot.isMobile, 'SEARCH-HOT-API', '发生错误:' + error, 'error')
            // 回退到Google Trends
            return this.getGoogleTrends()
        }
    }

    // 将搜索词列表转换为GoogleSearch格式
    private convertToGoogleSearchFormat(titles: string[]): GoogleSearch[] {
        const queryTerms: GoogleSearch[] = []
        
        for (const title of titles) {
            queryTerms.push({
                topic: title,
                related: [] // 国内API通常不提供相关搜索词
            })
        }

        return queryTerms
    }

    private async getGoogleTrends(geoLocale: string = 'US'): Promise<GoogleSearch[]> {
        const queryTerms: GoogleSearch[] = []
        this.bot.log(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', `正在生成搜索词，可能需要一些时间！| 地理位置: ${geoLocale}`)

        try {
            const request: AxiosRequestConfig = {
                url: 'https://trends.google.com/_/TrendsUi/data/batchexecute',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                data: `f.req=[[[i0OFE,"[null, null, \\"${geoLocale.toUpperCase()}\\", 0, null, 48]"]]]`
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.proxyGoogleTrends)
            const rawText = response.data

            const trendsData = this.extractJsonFromResponse(rawText)
            if (!trendsData) {
               throw  this.bot.log(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', '解析Google Trends响应失败', 'error')
            }

            const mappedTrendsData = trendsData.map(query => [query[0], query[9]!.slice(1)])
            if (mappedTrendsData.length < 90) {
                this.bot.log(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', '搜索词不足，回退到美国地区', 'warn')
                return this.getGoogleTrends()
            }

            for (const [topic, relatedQueries] of mappedTrendsData) {
                queryTerms.push({
                    topic: topic as string,
                    related: relatedQueries as string[]
                })
            }

        } catch (error) {
            this.bot.log(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', '发生错误:' + error, 'error')
        }

        return queryTerms
    }

    private extractJsonFromResponse(text: string): GoogleTrendsResponse[1] | null {
        const lines = text.split('\n')
        for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                try {
                    return JSON.parse(JSON.parse(trimmed)[0][2])[1]
                } catch {
                    continue
                }
            }
        }

        return null
    }

    private async getRelatedTerms(term: string): Promise<string[]> {
        try {
            const request = {
                url: `https://api.bing.com/osjson.aspx?query=${term}`,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.proxyBingTerms)

            return response.data[1] as string[]
        } catch (error) {
            this.bot.log(this.bot.isMobile, 'SEARCH-BING-RELATED', '发生错误:' + error, 'error')
        }

        return []
    }

    private async randomScroll(page: Page) {
        try {
            const viewportHeight = await page.evaluate(() => window.innerHeight)
            const totalHeight = await page.evaluate(() => document.body.scrollHeight)
            const randomScrollPosition = Math.floor(Math.random() * (totalHeight - viewportHeight))

            await page.evaluate((scrollPos: number) => {
                window.scrollTo(0, scrollPos)
            }, randomScrollPosition)

        } catch (error) {
            this.bot.log(this.bot.isMobile, 'SEARCH-RANDOM-SCROLL', '发生错误:' + error, 'error')
        }
    }

    private async clickRandomLink(page: Page) {
        try {
            await page.click('#b_results .b_algo h2', { timeout: 1500 }).catch(() => { }) // 减少超时时间，Since we don't really care if it did it or not

            // Only used if the browser is not the edge browser (continue on Edge popup)
            await this.closeContinuePopup(page)

            // Stay for 3 seconds for page to load and "visit" (减少等待时间)
            await this.bot.utils.wait(3000)

            // Will get current tab if no new one is created, this will always be the visited site or the result page if it failed to click
            let lastTab = await this.bot.browser.utils.getLatestTab(page)

            let lastTabURL = new URL(lastTab.url()) // Get new tab info, this is the website we're visiting

            // Check if the URL is different from the original one, don't loop more than 3 times. (减少循环次数)
            let i = 0
            while (lastTabURL.href !== this.searchPageURL && i < 3) {

                await this.closeTabs(lastTab)

                // End of loop, refresh lastPage
                lastTab = await this.bot.browser.utils.getLatestTab(page) // Finally update the lastTab var again
                lastTabURL = new URL(lastTab.url()) // Get new tab info
                i++
            }

        } catch (error) {
            this.bot.log(this.bot.isMobile, 'SEARCH-RANDOM-CLICK', '发生错误:' + error, 'error')
        }
    }

    private async closeTabs(lastTab: Page) {
        const browser = lastTab.context()
        const tabs = browser.pages()

        try {
            if (tabs.length > 2) {
                // If more than 2 tabs are open, close the last tab

                await lastTab.close()
                this.bot.log(this.bot.isMobile, 'SEARCH-CLOSE-TABS', `超过2个标签页打开，关闭最后一个标签页: "${new URL(lastTab.url()).host}"`)

            } else if (tabs.length === 1) {
                // If only 1 tab is open, open a new one to search in

                const newPage = await browser.newPage()
                await this.bot.utils.wait(500) // 减少等待时间

                await this.bot.browser.utils.safeGoto(newPage, this.bingHome)
                await this.bot.utils.wait(1500) // 减少等待时间
                this.searchPageURL = newPage.url()

                this.bot.log(this.bot.isMobile, 'SEARCH-CLOSE-TABS', '只有1个标签页打开，创建了新标签页')
            } else {
                // Else reset the last tab back to the search listing or Bing.com

                lastTab = await this.bot.browser.utils.getLatestTab(lastTab)
                await this.bot.browser.utils.safeGoto(lastTab, this.searchPageURL ? this.searchPageURL : this.bingHome)
            }

        } catch (error) {
            this.bot.log(this.bot.isMobile, 'SEARCH-CLOSE-TABS', '发生错误:' + error, 'error')
        }
    }

    private calculatePoints(counters: Counters) {
        const mobileData = counters.mobileSearch?.[0] // Mobile searches
        const genericData = counters.pcSearch?.[0] // Normal searches
        const edgeData = counters.pcSearch?.[1] // Edge searches

        const missingPoints = (this.bot.isMobile && mobileData)
            ? mobileData.pointProgressMax - mobileData.pointProgress
            : (edgeData ? edgeData.pointProgressMax - edgeData.pointProgress : 0)
            + (genericData ? genericData.pointProgressMax - genericData.pointProgress : 0)

        return missingPoints
    }

    private async closeContinuePopup(page: Page) {
        try {
            await page.waitForSelector('#sacs_close', { timeout: 1000 })
            const continueButton = await page.$('#sacs_close')

            if (continueButton) {
                await continueButton.click()
            }
        } catch (error) {
            // Continue if element is not found or other error occurs
        }
    }

}