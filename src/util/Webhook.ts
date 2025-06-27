import axios from 'axios'

import { Config } from '../interface/Config'

// Discord Webhook
export async function Webhook(configData: Config, content: string) {
    const webhook = configData.webhook

    if (!webhook.enabled || webhook.url.length < 10) return

    const request = {
        method: 'POST',
        url: webhook.url,
        headers: {
            'Content-Type': 'application/json'
        },
        data: {
            'content': content
        }
    }

    await axios(request).catch(() => { })
}

// Telegram Bot通知
export async function TelegramNotification(configData: Config, content: string) {
    const telegram = configData.webhook.telegram

    if (!telegram?.enabled || !telegram.botToken || !telegram.chatId) return

    // 构建API URL，支持代理
    const apiBase = telegram.apiProxy || 'https://api.telegram.org'
    const apiUrl = `${apiBase}/bot${telegram.botToken}/sendMessage`

    const request = {
        method: 'POST',
        url: apiUrl,
        headers: {
            'Content-Type': 'application/json'
        },
        data: {
            chat_id: telegram.chatId,
            text: content
        }
    }

    await axios(request).catch((error) => {
        console.error('Telegram通知发送失败:', error.message)
    })
}

// 统一通知函数
export async function sendNotification(configData: Config, content: string) {
    // 发送Discord通知
    await Webhook(configData, content)
    
    // 发送Telegram通知
    await TelegramNotification(configData, content)
}