import { randomBytes } from 'crypto'
import { AxiosRequestConfig } from 'axios'

import { Workers } from '../Workers'

import { DashboardData } from '../../interface/DashboardData'


export class ReadToEarn extends Workers {
    public async doReadToEarn(accessToken: string, data: DashboardData): Promise<{ articlesRead: number, totalPointsGained: number }> {
        if (this.bot.config.enableDebugLog) {
            console.log('[debug] 开始执行阅读赚积分任务...')
        }

        try {
            let geoLocale = data.userProfile?.attributes?.country || 'us'
            if (this.bot.config.enableDebugLog) {
                console.log('[阅读调试] 使用账号实际地区:', geoLocale)
                console.log(`[debug] X-Rewards-Country: ${geoLocale}`)
                console.log(`[debug] X-Rewards-Language: ${this.bot.config.searchSettings.rewardsLanguage || 'en'}`)
            }

            if (this.bot.config.enableDebugLog) {
            console.log('[阅读调试] accessToken:', accessToken)
            console.log('[阅读调试] geoLocale:', geoLocale)
            }

            // 首先获取用户当前积分余额
            const userDataRequest: AxiosRequestConfig = {
                url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'X-Rewards-Country': geoLocale,
                    'X-Rewards-Language': this.bot.config.searchSettings.rewardsLanguage || 'en'
                }
            }
            
            this.bot.log(this.bot.isMobile, 'READ-TO-EARN', '正在获取用户数据以检查当前余额...')
            if (this.bot.config.enableDebugLog) {
            console.log('[阅读调试] userDataRequest:', JSON.stringify(userDataRequest, null, 2))
            }
            const userDataResponse = await this.bot.axios.request(userDataRequest)
            if (this.bot.config.enableDebugLog) {
            console.log('[阅读调试] userDataResponse:', JSON.stringify(userDataResponse.data, null, 2))
            }
            const userData = (await userDataResponse.data).response
            if (this.bot.config.enableDebugLog) {
            console.log('[阅读调试] userData:', JSON.stringify(userData, null, 2))
            }
            let userBalance = userData.balance
            if (this.bot.config.enableDebugLog) {
            console.log('[阅读调试] userBalance:', userBalance)
            }
            
            this.bot.log(this.bot.isMobile, 'READ-TO-EARN', `当前余额: ${userBalance} 积分`)

            // 使用原始成功的请求参数格式
            const jsonData = {
                amount: 1,
                country: geoLocale,
                id: '1',
                type: 101,
                attributes: {
                    offerid: 'ENUS_readarticle3_30points'
                }
            }

            const articleCount = 10
            let articlesRead = 0
            let totalPointsGained = 0
            
            this.bot.log(this.bot.isMobile, 'READ-TO-EARN', `尝试阅读最多 ${articleCount} 篇文章...`)
            
            for (let i = 0; i < articleCount; ++i) {
                jsonData.id = randomBytes(64).toString('hex')
                const claimRequest = {
                    url: 'https://prod.rewardsplatform.microsoft.com/dapi/me/activities',
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'X-Rewards-Country': geoLocale,
                        'X-Rewards-Language': this.bot.config.searchSettings.rewardsLanguage || 'en'
                    },
                    data: JSON.stringify(jsonData)
                }
                if (this.bot.config.enableDebugLog) {
                console.log(`[阅读调试] 第${i+1}次claimRequest:`, JSON.stringify(claimRequest, null, 2))
                }
                try {
                    this.bot.log(this.bot.isMobile, 'READ-TO-EARN', `正在尝试阅读第 ${i + 1} 篇文章...`)
                const claimResponse = await this.bot.axios.request(claimRequest)
                    if (this.bot.config.enableDebugLog) {
                    console.log(`[阅读调试] 第${i+1}次claimResponse:`, JSON.stringify(claimResponse.data, null, 2))
                    }
                const newBalance = (await claimResponse.data).response.balance
                    const pointsGained = newBalance - userBalance
                    if (this.bot.config.enableDebugLog) {
                    console.log(`[阅读调试] 第${i+1}次newBalance:`, newBalance, 'pointsGained:', pointsGained)
                    }
                    
                    if (pointsGained > 0) {
                        articlesRead++
                        totalPointsGained += pointsGained
                        userBalance = newBalance
                        this.bot.log(this.bot.isMobile, 'READ-TO-EARN', `成功阅读文章，获得 ${pointsGained} 积分`)
                    } else {
                        this.bot.log(this.bot.isMobile, 'READ-TO-EARN', '未获得积分，可能已达到每日限制')
                        break
                    }
                    
                    // 等待一段时间再阅读下一篇文章
                    await this.bot.utils.wait(2000)
                    
                } catch (error) {
                    if (this.bot.config.enableDebugLog) {
                    console.error(`[阅读调试] 第${i+1}次catch error:`, error)
                    }
                    break
                }
            }

            if (articlesRead > 0) {
                this.bot.log(this.bot.isMobile, 'READ-TO-EARN', `完成阅读赚积分: 阅读了 ${articlesRead} 篇文章，获得 ${totalPointsGained} 积分`)
            } else {
                this.bot.log(this.bot.isMobile, 'READ-TO-EARN', '没有成功阅读任何文章')
            }

            if (this.bot.config.enableDebugLog) {
            console.log('[阅读调试] 最终articlesRead:', articlesRead, 'totalPointsGained:', totalPointsGained)
            }
            return { articlesRead, totalPointsGained }
            
        } catch (error) {
            if (this.bot.config.enableDebugLog) {
            console.error('[阅读调试] catch error:', error)
            }
            return { articlesRead: 0, totalPointsGained: 0 }
        }
    }
}