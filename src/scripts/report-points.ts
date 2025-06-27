#!/usr/bin/env node

import { loadConfig } from '../util/Load'
import { loadAccounts } from '../util/Load'
import AxiosClient from '../util/Axios'
import { PointsReporter } from '../util/PointsReporter'

async function main() {
    try {
        console.log('🔍 开始获取Microsoft Rewards积分信息...')
        
        // 加载配置
        const config = loadConfig()
        const accounts = loadAccounts()
        
        if (accounts.length === 0) {
            console.error('❌ 未找到账户配置，请检查 src/accounts.json')
            process.exit(1)
        }
        
        // 检查Telegram配置
        if (!config.webhook.telegram?.enabled) {
            console.error('❌ Telegram通知未启用，请在配置中启用')
            process.exit(1)
        }
        
        console.log(`📧 找到 ${accounts.length} 个账户`)
        
        // 为每个账户获取积分信息
        for (const account of accounts) {
            console.log(`\n🔍 正在获取账户 ${account.email} 的积分信息...`)
            
            try {
                // 创建axios实例
                const axiosClient = new AxiosClient(account.proxy)
                const pointsReporter = new PointsReporter(axiosClient)
                
                // 获取并发送积分报告
                const success = await pointsReporter.sendPointsReport(account.email)
                
                if (success) {
                    console.log(`✅ 账户 ${account.email} 的积分报告已发送到Telegram`)
                } else {
                    console.log(`❌ 账户 ${account.email} 的积分报告发送失败`)
                }
                
                // 等待一段时间再处理下一个账户
                if (accounts.length > 1) {
                    console.log('⏳ 等待3秒后处理下一个账户...')
                    await new Promise(resolve => setTimeout(resolve, 3000))
                }
                
            } catch (error) {
                console.error(`❌ 处理账户 ${account.email} 时出错:`, error)
            }
        }
        
        console.log('\n🎉 所有账户的积分报告处理完成！')
        
    } catch (error) {
        console.error('❌ 脚本执行失败:', error)
        process.exit(1)
    }
}

// 运行脚本
if (require.main === module) {
    main()
} 