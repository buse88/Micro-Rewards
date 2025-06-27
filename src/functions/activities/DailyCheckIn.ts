import { randomBytes } from 'crypto'
import { AxiosRequestConfig } from 'axios'

import { Workers } from '../Workers'

import { DashboardData } from '../../interface/DashboardData'


export class DailyCheckIn extends Workers {
    public async doDailyCheckIn(accessToken: string, data: DashboardData): Promise<{ success: boolean, pointsGained: number, message: string }> {
        this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', '开始每日签到')
        console.log('[签到调试] accessToken:', accessToken)

        try {
            let geoLocale = data.userProfile.attributes.country
            // 优先使用preferredCountry配置，如果没有配置则使用账号地区，最后回退到us
            if (this.bot.config.searchSettings.useGeoLocaleQueries) {
                if (this.bot.config.searchSettings.preferredCountry && this.bot.config.searchSettings.preferredCountry.length === 2) {
                    geoLocale = this.bot.config.searchSettings.preferredCountry.toLowerCase()
                    console.log('[签到调试] 使用preferredCountry配置的地区:', geoLocale)
                } else if (geoLocale && geoLocale.length === 2) {
                    geoLocale = geoLocale.toLowerCase()
                    console.log('[签到调试] 使用账号实际地区:', geoLocale)
                } else {
                    geoLocale = 'us'
                    console.log('[签到调试] 使用默认地区:', geoLocale)
                }
            } else {
                geoLocale = 'us'
                console.log('[签到调试] useGeoLocaleQueries为false，使用默认地区:', geoLocale)
            }
            console.log('[签到调试] geoLocale:', geoLocale)

            const jsonData = {
                amount: 1,
                country: geoLocale,
                id: randomBytes(64).toString('hex'),
                type: 101,
                attributes: {
                    offerid: 'Gamification_Sapphire_DailyCheckIn'
                }
            }
            console.log('[签到调试] 请求参数:', JSON.stringify(jsonData, null, 2))

            const claimRequest: AxiosRequestConfig = {
                url: 'https://prod.rewardsplatform.microsoft.com/dapi/me/activities',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'X-Rewards-Country': geoLocale,
                    'X-Rewards-Language': 'en'
                },
                data: JSON.stringify(jsonData)
            }

            this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', '正在发送签到请求...')
            const claimResponse = await this.bot.axios.request(claimRequest)
            console.log('[签到调试] claimResponse.status:', claimResponse.status)
            console.log('[签到调试] claimResponse.data:', JSON.stringify(claimResponse.data, null, 2))
            
            // 详细记录API响应
            const responseData = await claimResponse.data
            console.log('[签到调试] responseData:', JSON.stringify(responseData, null, 2))
            
            // 检查响应结构
            if (!responseData || !responseData.response) {
                const message = 'API响应格式错误，无法判断签到状态'
                this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', message, 'error')
                return { success: false, pointsGained: 0, message }
            }
            
            const activity = responseData.response.activity
            console.log('[签到调试] activity:', JSON.stringify(activity, null, 2))
            const claimedPoint = parseInt(activity?.p) ?? 0
            console.log('[签到调试] claimedPoint:', claimedPoint)
            
            // 记录详细的活动信息
            this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', `活动信息: ${JSON.stringify(activity, null, 2)}`)
            this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', `获得积分: ${claimedPoint}`)
            
            // 更准确的判断逻辑
            if (claimedPoint > 0) {
                const message = `成功签到，获得 ${claimedPoint} 积分`
                this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', message)
                return { success: true, pointsGained: claimedPoint, message }
            } else if (activity && activity.id) {
                // 如果有活动ID但没有积分，可能是已经签到过了
                const message = '今天已经签到过了'
                this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', message)
                return { success: false, pointsGained: 0, message }
            } else {
                // 其他情况，可能是API错误或网络问题
                const message = '签到失败，请检查网络连接或稍后重试'
                this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', message, 'error')
                return { success: false, pointsGained: 0, message }
            }
        } catch (error) {
            console.error('[签到调试] catch error:', error)
            const message = '每日签到发生错误: ' + error
            this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', message, 'error')
            return { success: false, pointsGained: 0, message }
        }
    }

}