import ms from 'ms'

export default class Util {

    async wait(ms: number): Promise<void> {
        return new Promise<void>((resolve) => {
            setTimeout(resolve, ms)
        })
    }

    getFormattedDate(ms = Date.now()): string {
        const today = new Date(ms)
        const month = String(today.getMonth() + 1).padStart(2, '0')  // January is 0
        const day = String(today.getDate()).padStart(2, '0')
        const year = today.getFullYear()

        return `${month}/${day}/${year}`
    }

    shuffleArray<T>(array: T[]): T[] {
        return array.map(value => ({ value, sort: Math.random() }))
            .sort((a, b) => a.sort - b.sort)
            .map(({ value }) => value)
    }

    randomNumber(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min
    }

    chunkArray<T>(arr: T[], numChunks: number): T[][] {
        const chunkSize = Math.ceil(arr.length / numChunks)
        const chunks: T[][] = []

        for (let i = 0; i < arr.length; i += chunkSize) {
            const chunk = arr.slice(i, i + chunkSize)
            chunks.push(chunk)
        }

        return chunks
    }

    stringToMs(input: string | number): number {
        const milisec = ms(input.toString())
        if (!milisec) {
            throw new Error('The string provided cannot be parsed to a valid time! Use a format like "1 min", "1m" or "1 minutes"')
        }
        return milisec
    }

    // 调试日志控制方法
    debugLog(tag: string, message: string, data?: any): void {
        // 这个方法需要在有config访问权限的地方调用
        // 这里只是定义方法，实际使用需要在具体的类中实现
        console.log(`[${tag}] ${message}`, data || '')
    }

    // 检查是否启用调试日志
    isDebugEnabled(config?: any): boolean {
        return config?.enableDebugLog === true
    }

}