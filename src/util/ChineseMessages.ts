// 中文日志消息翻译
export const ChineseMessages: Record<string, string> = {
    // 主进程相关
    'Primary process started': '主进程已启动',
    'All workers destroyed. Exiting main process!': '所有工作进程已销毁，退出主进程！',
    'Completed tasks for ALL accounts': '所有账户的任务已完成',
    'Error running desktop bot: ${error}': '运行桌面机器人时出错: ${error}',
    'Error running bots: ${error}': '运行机器人时出错: ${error}',

    // 浏览器相关
    'Starting browser': '正在启动浏览器',
    'Created browser with User-Agent: ${userAgent}': '已创建浏览器，用户代理: ${userAgent}',
    'Browser closed cleanly!': '浏览器已干净关闭！',
    'No points to earn and "runOnZeroPoints" is set to "false", stopping!': '没有可获得的积分且"runOnZeroPoints"设置为"false"，停止执行！',

    // 登录相关
    'Starting login process!': '开始登录过程！',
    'Logged into Microsoft successfully': '成功登录Microsoft',
    'Already logged in': '已经登录',
    'Logged in successfully, saved login session!': '登录成功，已保存登录会话！',
    'Successfully logged into the rewards portal': '成功登录奖励门户',
    'Email field not found': '未找到邮箱字段',
    'Password field not found, possibly 2FA required': '未找到密码字段，可能需要2FA',
    '2FA handling failed: TimeoutError: page.waitForSelector: Timeout 2000ms exceeded.': '2FA处理失败: 超时错误: 等待选择器超时2000毫秒',
    'Verifying Bing login': '验证Bing登录',
    'Visited homepage successfully': '成功访问主页',
    'Press the number ${numberToPress} on your Authenticator app to approve the login': '请在您的身份验证器应用中按数字${numberToPress}来批准登录',
    'If you press the wrong number or the "DENY" button, try again in 60 seconds': '如果您按错了数字或按了"拒绝"按钮，请在60秒后重试',
    'Login successfully approved!': '登录已成功批准！',
    'The code is expired. Trying to get a new code...': '验证码已过期，正在尝试获取新验证码...',
    'SMS 2FA code required. Waiting for user input...': '需要短信2FA验证码，等待用户输入...',
    '2FA code entered successfully': '2FA验证码输入成功',
    'Waiting for authorization...': '等待授权...',
    'Successfully authorized': '授权成功',

    // 任务相关
    'All Daily Set" items have already been completed': '所有"每日任务"项目已完成',
    'Started solving "Daily Set" items': '开始解决"每日任务"项目',
    'All "Daily Set" items have been completed': '所有"每日任务"项目已完成',
    'All "Punch Cards" have already been completed': '所有"打卡卡"已完成',
    'All "More Promotion" items have already been completed': '所有"更多促销"项目已完成',
    'Started solving "More Promotions" items': '开始解决"更多促销"项目',
    'All "More Promotion" items have been completed': '所有"更多促销"项目已完成',
    'Starting Daily Check In': '开始每日签到',
    'Already claimed today': '今日已签到',
    'Starting Read to Earn': '开始阅读赚取积分',
    'Read all available articles': '已阅读所有可用文章',
    'Completed Read to Earn': '阅读赚取积分已完成',

    // 搜索相关
    'Starting Bing searches': '开始Bing搜索',
    'Bing searches have already been completed': 'Bing搜索已完成',
    'Using domestic hot APIs for search queries': '使用国内热点API生成搜索查询',
    'Using Google Trends for search queries': '使用Google趋势生成搜索查询',
    'Completed searches': '搜索完成',

    // 网络错误处理相关
    'Attempting to navigate to ${url} (attempt ${attempt}/${maxRetries})': '正在尝试跳转到 ${url} (第 ${attempt}/${maxRetries} 次尝试)',
    'Connection error detected: ${errorMessage}': '检测到连接错误: ${errorMessage}',
    'Retrying in ${retryDelay}ms...': '将在 ${retryDelay} 毫秒后重试...',
    'Successfully navigated to ${url}': '成功跳转到 ${url}',
    'Failed to navigate to ${url} after ${maxRetries} attempts': '在 ${maxRetries} 次尝试后仍无法跳转到 ${url}',
    'Page reload failed, continuing with retry': '页面重新加载失败，继续重试',
    'Bad page detected, reloading!': '检测到错误页面，正在重新加载！',

    // 错误相关
    'An error occurred: ${error}': '发生错误: ${error}',
    'Error fetching dashboard data: ${error}': '获取仪表板数据时出错: ${error}',
    'page.goto: net::ERR_CONNECTION_CLOSED': '页面跳转: 网络连接已关闭',
    'page.reload: Protocol error (Page.reload): Not attached to an active page': '页面刷新: 协议错误 (页面刷新): 未附加到活动页面',
    'Error running desktop bot: undefined': '运行桌面机器人时出错: 未定义',
    'TimeoutError: page.goto: Timeout 30000ms exceeded.': '超时错误: 页面跳转超时30秒',
    'TimeoutError: page.goto: Timeout 60000ms exceeded.': '超时错误: 页面跳转超时60秒',
    'TimeoutError: page.goto: Timeout 120000ms exceeded.': '超时错误: 页面跳转超时120秒',
    'TimeoutError: page.waitForSelector: Timeout 2000ms exceeded.': '超时错误: 等待选择器超时2秒',
    'TimeoutError: page.reload: Timeout 60000ms exceeded.': '超时错误: 页面刷新超时60秒'
}

// 获取中文消息的函数
export function getChineseMessage(key: string, params?: Record<string, string | number>): string {
    let message = ChineseMessages[key] || key
    
    if (params) {
        Object.keys(params).forEach(param => {
            const regex = new RegExp(`\\$\\{${param}\\}`, 'g')
            message = message.replace(regex, String(params[param]))
        })
    }
    
    return message
} 