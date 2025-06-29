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

    try {
        const response = await axios(request)
        if (response.status === 204) {
            console.log('✅ Discord通知发送成功')
        } else {
            console.log(`✅ Discord通知发送成功，状态码: ${response.status}`)
        }
    } catch (error: any) {
        console.error('❌ Discord通知发送失败:', error.message)
    }
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
            text: content,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        }
    }

    try {
        const response = await axios(request)
        
        if (response.data?.ok) {
            console.log(`✅ Telegram消息发送成功，消息ID: ${response.data.result.message_id}`)
        } else {
            console.error('❌ Telegram API错误:', response.data?.description || '未知错误')
        }
    } catch (error: any) {
        console.error('❌ Telegram通知发送失败:', error.message)
    }
}

// 统一通知函数
export async function sendNotification(configData: Config, content: string) {
    // 发送Discord通知
    await Webhook(configData, content)
    
    // 发送Telegram通知
    await TelegramNotification(configData, content)
}