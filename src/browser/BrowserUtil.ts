import { Page } from 'playwright'
import { load } from 'cheerio'

import { MicrosoftRewardsBot } from '../index'


export default class BrowserUtil {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async tryDismissAllMessages(page: Page): Promise<void> {
        const buttons = [
            { selector: '#acceptButton', label: 'AcceptButton' },
            { selector: '.ext-secondary.ext-button', label: '"Skip for now" Button' },
            { selector: '#iLandingViewAction', label: 'iLandingViewAction' },
            { selector: '#iShowSkip', label: 'iShowSkip' },
            { selector: '#iNext', label: 'iNext' },
            { selector: '#iLooksGood', label: 'iLooksGood' },
            { selector: '#idSIButton9', label: 'idSIButton9' },
            { selector: '.ms-Button.ms-Button--primary', label: 'Primary Button' },
            { selector: '.c-glyph.glyph-cancel', label: 'Mobile Welcome Button' },
            { selector: '.maybe-later', label: 'Mobile Rewards App Banner' },
            { selector: '//div[@id="cookieConsentContainer"]//button[contains(text(), "Accept")]', label: 'Accept Cookie Consent Container', isXPath: true },
            { selector: '#bnp_btn_accept', label: 'Bing Cookie Banner' },
            { selector: '#reward_pivot_earn', label: 'Reward Coupon Accept' }
        ]

        for (const button of buttons) {
            try {
                const element = button.isXPath ? page.locator(`xpath=${button.selector}`) : page.locator(button.selector)
                await element.first().click({ timeout: 500 })
                await page.waitForTimeout(500)

                this.bot.log(this.bot.isMobile, 'DISMISS-ALL-MESSAGES', `Dismissed: ${button.label}`)

            } catch (error) {
                // Silent fail
            }
        }
    }

    async getLatestTab(page: Page): Promise<Page> {
        try {
            await this.bot.utils.wait(1000)

            const browser = page.context()
            const pages = browser.pages()
            const newTab = pages[pages.length - 1]

            if (newTab) {
                return newTab
            }

            throw this.bot.log(this.bot.isMobile, 'GET-NEW-TAB', 'Unable to get latest tab', 'error')
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GET-NEW-TAB', 'An error occurred:' + error, 'error')
        }
    }

    async getTabs(page: Page) {
        try {
            const browser = page.context()
            const pages = browser.pages()

            const homeTab = pages[1]
            let homeTabURL: URL

            if (!homeTab) {
                throw this.bot.log(this.bot.isMobile, 'GET-TABS', 'Home tab could not be found!', 'error')

            } else {
                homeTabURL = new URL(homeTab.url())

                if (homeTabURL.hostname !== 'rewards.bing.com') {
                    throw this.bot.log(this.bot.isMobile, 'GET-TABS', 'Reward page hostname is invalid: ' + homeTabURL.host, 'error')
                }
            }

            const workerTab = pages[2]
            if (!workerTab) {
                throw this.bot.log(this.bot.isMobile, 'GET-TABS', 'Worker tab could not be found!', 'error')
            }

            return {
                homeTab: homeTab,
                workerTab: workerTab
            }

        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'GET-TABS', 'An error occurred:' + error, 'error')
        }
    }

    async reloadBadPage(page: Page): Promise<void> {
        try {
            const html = await page.content().catch(() => '')
            const $ = load(html)

            const isNetworkError = $('body.neterror').length

            if (isNetworkError) {
                this.bot.log(this.bot.isMobile, 'RELOAD-BAD-PAGE', 'Bad page detected, reloading!')
                await page.reload()
            }

        } catch (error) {
            throw this.bot.log(this.bot.isMobile, 'RELOAD-BAD-PAGE', 'An error occurred:' + error, 'error')
        }
    }

    /**
     * 安全页面跳转方法，包含重试机制和连接错误处理
     * @param page Playwright页面对象
     * @param url 要跳转的URL
     * @param maxRetries 最大重试次数，默认使用配置值
     * @param retryDelay 重试间隔（毫秒），默认使用配置值
     */
    async safeGoto(page: Page, url: string, maxRetries?: number, retryDelay?: number): Promise<void> {
        // 使用配置中的网络设置，如果没有提供参数的话
        const configMaxRetries = maxRetries ?? this.bot.config.networkSettings?.maxRetries ?? 3
        const configRetryDelay = retryDelay ?? this.bot.config.networkSettings?.retryDelay ?? 1000
        const configPageLoadTimeout = this.bot.config.networkSettings?.pageLoadTimeout ?? 30000
        
        let lastError: Error | null = null

        for (let attempt = 1; attempt <= configMaxRetries; attempt++) {
            try {
                this.bot.log(this.bot.isMobile, 'SAFE-GOTO', `正在尝试导航到 ${url} (第 ${attempt}/${configMaxRetries} 次尝试)`)
                
                await page.goto(url, { 
                    waitUntil: 'domcontentloaded',
                    timeout: configPageLoadTimeout 
                })

                // 检查页面是否成功加载
                await this.reloadBadPage(page)
                
                this.bot.log(this.bot.isMobile, 'SAFE-GOTO', `成功导航到 ${url}`)
                return

            } catch (error: any) {
                lastError = error
                const errorMessage = error.message || error.toString()
                
                // 检查是否是连接相关错误
                const isConnectionError = errorMessage.includes('ERR_CONNECTION_CLOSED') || 
                                        errorMessage.includes('ERR_CONNECTION_REFUSED') ||
                                        errorMessage.includes('ERR_CONNECTION_TIMED_OUT') ||
                                        errorMessage.includes('ERR_NETWORK') ||
                                        errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
                                        errorMessage.includes('net::ERR_CONNECTION_CLOSED') ||
                                        errorMessage.includes('Timeout') ||
                                        errorMessage.includes('timeout')
                
                if (isConnectionError) {
                    this.bot.log(this.bot.isMobile, 'SAFE-GOTO', `连接错误: ${errorMessage}`, 'warn')
                } else {
                    this.bot.log(this.bot.isMobile, 'SAFE-GOTO', `导航失败: ${errorMessage}`, 'warn')
                }
                
                if (attempt < configMaxRetries) {
                    this.bot.log(this.bot.isMobile, 'SAFE-GOTO', `等待 ${configRetryDelay}ms 后重试...`)
                    await this.bot.utils.wait(configRetryDelay)
                }
            }
        }
        
        // 所有重试都失败了
        this.bot.log(this.bot.isMobile, 'SAFE-GOTO', `导航到 ${url} 失败，已尝试 ${configMaxRetries} 次`, 'error')
        throw lastError || new Error(`Failed to navigate to ${url} after ${configMaxRetries} attempts`)
    }

    /**
     * 检查页面是否处于错误状态
     * @param page Playwright页面对象
     * @returns 是否处于错误状态
     */
    async isPageInErrorState(page: Page): Promise<boolean> {
        try {
            const html = await page.content().catch(() => '')
            const $ = load(html)
            
            // 检查各种错误页面标识
            const hasNetworkError = $('body.neterror').length > 0
            const hasErrorPage = $('title').text().toLowerCase().includes('error') || 
                               $('title').text().toLowerCase().includes('无法访问') ||
                               $('title').text().toLowerCase().includes('connection')
            const hasErrorContent = $('body').text().includes('ERR_CONNECTION_CLOSED') ||
                                  $('body').text().includes('ERR_CONNECTION_REFUSED') ||
                                  $('body').text().includes('ERR_NETWORK')
            
            return hasNetworkError || hasErrorPage || hasErrorContent
        } catch (error) {
            return false
        }
    }

}