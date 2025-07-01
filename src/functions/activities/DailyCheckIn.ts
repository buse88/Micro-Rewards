import { randomBytes } from 'crypto'
import { AxiosRequestConfig } from 'axios'

import { Workers } from '../Workers'

import { DashboardData } from '../../interface/DashboardData'


export class DailyCheckIn extends Workers {
    public async doDailyCheckIn(accessToken: string, data: DashboardData): Promise<{ success: boolean, pointsGained: number, message: string, region: string }> {
        if (this.bot.config.enableDebugLog) {
            console.log('[debug] 开始执行签到任务...')
        }

        this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', '开始每日签到')
        if (this.bot.config.enableDebugLog) {
        console.log('[签到调试] accessToken:', accessToken)
        }

        try {
            if (!data.userProfile || !data.userProfile.attributes) {
                throw new Error('用户信息缺失，无法获取地区信息')
            }
            let geoLocale = data.userProfile?.attributes?.country || 'us'
            if (this.bot.config.enableDebugLog) {
                console.log('[签到调试] 使用账号实际地区:', geoLocale)
            }
            
            const beforeBalanceRequest: AxiosRequestConfig = {
                url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'X-Rewards-Country': geoLocale,
                    'X-Rewards-Language': this.bot.config.searchSettings.rewardsLanguage || 'en'
                }
            }
            
            const beforeBalanceResponse = await this.bot.axios.request(beforeBalanceRequest)
            const beforeBalanceData = beforeBalanceResponse.data.response
            const beforeBalance = beforeBalanceData.balance || 0
            
            if (this.bot.config.enableDebugLog) {
                console.log(`[签到调试] 地区 ${geoLocale} 签到前余额:`, beforeBalance)
            }

            // 根据地区选择不同的请求参数格式
            let jsonData: any
            let requestHeaders: any

            if (geoLocale === 'cn') {
                // 使用油猴脚本的参数格式
                const dateTime = new Date()
                const yearNow = dateTime.getFullYear()
                const monthNow = ("0" + (dateTime.getMonth() + 1)).slice(-2)
                const dayNow = ("0" + dateTime.getDate()).slice(-2)
                const dateNowNum = Number(`${yearNow}${monthNow}${dayNow}`)

                jsonData = {
                    amount: 1,
                    attributes: {
                        offerid: 'Gamification_Sapphire_DailyCheckIn',
                        date: dateNowNum,
                        signIn: false,
                        timezoneOffset: "08:00:00"
                    },
                    id: "",
                    type: 101,
                    country: "cn",
                    risk_context: {},
                    channel: "SAAndroid"
                }

                requestHeaders = {
                    'authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }

                if (this.bot.config.enableDebugLog) {
                    console.log(`[签到调试] 地区 ${geoLocale} 使用油猴脚本格式，请求参数:`, JSON.stringify(jsonData, null, 2))
                }
            } else {
                // 使用原有格式
                jsonData = {
                    amount: 1,
                    country: geoLocale,
                    id: randomBytes(64).toString('hex'),
                    type: 101,
                    attributes: {
                        offerid: 'Gamification_Sapphire_DailyCheckIn'
                    }
                }

                requestHeaders = {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'X-Rewards-Country': geoLocale,
                    'X-Rewards-Language': this.bot.config.searchSettings.rewardsLanguage || 'en'
                }

                if (this.bot.config.enableDebugLog) {
                    console.log(`[签到调试] 地区 ${geoLocale} 使用原有格式，请求参数:`, JSON.stringify(jsonData, null, 2))
                }
            }

            const claimRequest: AxiosRequestConfig = {
                url: 'https://prod.rewardsplatform.microsoft.com/dapi/me/activities',
                method: 'POST',
                headers: requestHeaders,
                data: JSON.stringify(jsonData)
            }

            this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', `[${geoLocale}] 正在发送签到请求...`)
            const claimResponse = await this.bot.axios.request(claimRequest)
            if (this.bot.config.enableDebugLog) {
                console.log(`[签到调试] 地区 ${geoLocale} claimResponse.status:`, claimResponse.status)
                console.log(`[签到调试] 地区 ${geoLocale} claimResponse.data:`, JSON.stringify(claimResponse.data, null, 2))
            }
            
            // 详细记录API响应
            const responseData = await claimResponse.data
            if (this.bot.config.enableDebugLog) {
                console.log(`[签到调试] 地区 ${geoLocale} responseData:`, JSON.stringify(responseData, null, 2))
            }
            
            // 检查响应结构
            if (!responseData || !responseData.response) {
                const message = `[${geoLocale}] API响应格式错误，无法判断签到状态`
                this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', message, 'error')
                return { success: false, pointsGained: 0, message, region: geoLocale }
            }
            
            const activity = responseData.response.activity
            const afterBalance = responseData.response.balance || 0
            if (this.bot.config.enableDebugLog) {
                console.log(`[签到调试] 地区 ${geoLocale} activity:`, JSON.stringify(activity, null, 2))
                console.log(`[签到调试] 地区 ${geoLocale} 签到后余额:`, afterBalance)
            }
            
            // 计算实际获得的积分（通过余额变化）
            const actualPointsGained = afterBalance - beforeBalance
            const claimedPoint = parseInt(activity?.p) ?? 0
            
            if (this.bot.config.enableDebugLog) {
                console.log(`[签到调试] 地区 ${geoLocale} claimedPoint (API返回):`, claimedPoint)
                console.log(`[签到调试] 地区 ${geoLocale} actualPointsGained (余额变化):`, actualPointsGained)
            }
            
            // 记录详细的活动信息
            this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', `[${geoLocale}] 活动信息: ${JSON.stringify(activity, null, 2)}`)
            this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', `[${geoLocale}] API返回积分: ${claimedPoint}, 实际获得积分: ${actualPointsGained}`)
            
            // 更准确的判断逻辑
            if (actualPointsGained > 0) {
                // 余额增加了，说明签到成功
                const message = `[${geoLocale}] 成功签到，获得 ${actualPointsGained} 积分`
                this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', message)
                return { success: true, pointsGained: actualPointsGained, message, region: geoLocale }
            } else if (activity && activity.id) {
                // 有活动ID但余额没变化，说明已经签到过了
                const message = `[${geoLocale}] 今天已经签到过了`
                this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', message)
                return { success: false, pointsGained: 0, message, region: geoLocale }
            } else {
                // 其他情况，可能是API错误或网络问题
                const message = `[${geoLocale}] 签到失败，请检查网络连接或稍后重试`
                this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', message, 'error')
                return { success: false, pointsGained: 0, message, region: geoLocale }
            }
        } catch (error) {
            if (this.bot.config.enableDebugLog) {
                console.error('[签到调试] catch error:', error)
            }
            const message = '每日签到发生错误: ' + error
            this.bot.log(this.bot.isMobile, 'DAILY-CHECK-IN', message, 'error')
            return { success: false, pointsGained: 0, message, region: '' }
        }
    }
}