import chalk from 'chalk'

import { sendNotification } from './Webhook'
import { loadConfig } from './Load'
import { getChineseMessage } from './ChineseMessages'


export function log(isMobile: boolean | 'main', title: string, message: string, type: 'log' | 'warn' | 'error' = 'log', color?: keyof typeof chalk): void {
    const configData = loadConfig()

    if (configData.logExcludeFunc.some(x => x.toLowerCase() === title.toLowerCase())) {
        return
    }

    // 尝试翻译消息为中文
    const translatedMessage = getChineseMessage(message)

    const currentTime = new Date().toLocaleString()
    const platformText = isMobile === 'main' ? 'MAIN' : isMobile ? 'MOBILE' : 'DESKTOP'
    const chalkedPlatform = isMobile === 'main' ? chalk.bgCyan('MAIN') : isMobile ? chalk.bgBlue('MOBILE') : chalk.bgMagenta('DESKTOP')

    // Clean string for the Webhook (no chalk)
    const cleanStr = `[${currentTime}] [PID: ${process.pid}] [${type.toUpperCase()}] ${platformText} [${title}] ${translatedMessage}`

    // 根据配置决定是否发送通知
    const notifyOn = configData.webhook.notifyOn
    const shouldNotify = !notifyOn || notifyOn.length === 0 || notifyOn.includes(title)

    // Send the clean string to the Webhook
    if (shouldNotify && !configData.webhookLogExcludeFunc.some(x => x.toLowerCase() === title.toLowerCase())) {
        sendNotification(configData, cleanStr)
    }

    // Formatted string with chalk for terminal logging
    const str = `[${currentTime}] [PID: ${process.pid}] [${type.toUpperCase()}] ${chalkedPlatform} [${title}] ${translatedMessage}`

    const applyChalk = color && typeof chalk[color] === 'function' ? chalk[color] as (msg: string) => string : null

    // Log based on the type
    switch (type) {
        case 'warn':
            applyChalk ? console.warn(applyChalk(str)) : console.warn(str)
            break

        case 'error':
            applyChalk ? console.error(applyChalk(str)) : console.error(str)
            break

        default:
            applyChalk ? console.log(applyChalk(str)) : console.log(str)
            break
    }
}
