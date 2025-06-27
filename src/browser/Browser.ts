import playwright, { BrowserContext } from 'playwright'

import { newInjectedContext } from 'fingerprint-injector'
import { FingerprintGenerator } from 'fingerprint-generator'

import { MicrosoftRewardsBot } from '../index'
import { loadSessionData, saveFingerprintData } from '../util/Load'
import { updateFingerprintUserAgent } from '../util/UserAgent'

import { AccountProxy } from '../interface/Account'

/* Test Stuff
https://abrahamjuliot.github.io/creepjs/
https://botcheck.luminati.io/
https://fv.pro/
https://pixelscan.net/
https://www.browserscan.net/
*/

class Browser {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async createBrowser(proxy: AccountProxy, email: string): Promise<BrowserContext> {
        const browser = await playwright.chromium.launch({
            //channel: 'msedge', // Uses Edge instead of chrome
            headless: this.bot.config.headless,
            ...(proxy.url && { proxy: { username: proxy.username, password: proxy.password, server: `${proxy.url}:${proxy.port}` } }),
            args: [
                '--no-sandbox',
                '--mute-audio',
                '--disable-setuid-sandbox',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list',
                '--ignore-ssl-errors',
                // 内存和性能优化
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                // 内存限制
                '--memory-pressure-off',
                '--max_old_space_size=512',
                // 禁用不必要的功能
                '--disable-extensions',
                '--disable-plugins',
                '--disable-images',
                '--disable-javascript-harmony-shipping',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                // 网络优化 - 移除可能影响连接的参数
                '--hide-scrollbars',
                '--metrics-recording-only',
                '--safebrowsing-disable-auto-update',
                // DNS和网络连接优化 - 移除可能影响连接的参数
                '--enable-features=NetworkService,NetworkServiceLogging',
                '--force-fieldtrials=*BackgroundTracing/default/'
            ]
        })

        const sessionData = await loadSessionData(this.bot.config.sessionPath, email, this.bot.isMobile, this.bot.config.saveFingerprint)

        const fingerprint = sessionData.fingerprint ? sessionData.fingerprint : await this.generateFingerprint()

        const context = await newInjectedContext(browser as any, { 
            fingerprint: fingerprint,
            newContextOptions: {
                viewport: this.bot.isMobile ? { width: 375, height: 667 } : { width: 1920, height: 1080 },
                userAgent: fingerprint.fingerprint.navigator.userAgent,
                extraHTTPHeaders: {
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                }
            }
        })

        // Set timeout to preferred amount
        context.setDefaultTimeout(this.bot.utils.stringToMs(this.bot.config?.globalTimeout ?? 30000))

        await context.addCookies(sessionData.cookies)

        if (this.bot.config.saveFingerprint) {
            await saveFingerprintData(this.bot.config.sessionPath, email, this.bot.isMobile, fingerprint)
        }

        this.bot.log(this.bot.isMobile, 'BROWSER', `Created browser with User-Agent: "${fingerprint.fingerprint.navigator.userAgent}"`)

        return context as BrowserContext
    }

    async generateFingerprint() {
        const fingerPrintData = new FingerprintGenerator().getFingerprint({
            devices: this.bot.isMobile ? ['mobile'] : ['desktop'],
            operatingSystems: this.bot.isMobile ? ['android'] : ['windows'],
            browsers: [{ name: 'edge' }]
        })

        const updatedFingerPrintData = await updateFingerprintUserAgent(fingerPrintData, this.bot.isMobile)

        return updatedFingerPrintData
    }
}

export default Browser