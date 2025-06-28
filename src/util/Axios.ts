import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { AccountProxy } from '../interface/Account'

class AxiosClient {
    private instance: AxiosInstance
    private account: AccountProxy
    private enableDebugLog: boolean = false

    constructor(account: AccountProxy, enableDebugLog: boolean = false) {
        this.account = account
        this.enableDebugLog = enableDebugLog
        this.instance = axios.create()

        // If a proxy configuration is provided, set up the agent
        if (this.account.url && this.account.proxyAxios) {
            const agent = this.getAgentForProxy(this.account)
            this.instance.defaults.httpAgent = agent
            this.instance.defaults.httpsAgent = agent
        }

        // 添加请求拦截器
        this.instance.interceptors.request.use(
            (config: InternalAxiosRequestConfig) => {
                if (this.enableDebugLog) {
                    console.log(`[debug][HTTP请求] ${config.method?.toUpperCase()} ${config.url}`)
                    if (config.headers) {
                        console.log(`[debug][HTTP请求头]`, config.headers)
                    }
                    if (config.data) {
                        console.log(`[debug][HTTP请求体]`, config.data)
                    }
                }
                return config
            },
            (error: AxiosError) => {
                if (this.enableDebugLog) {
                    console.log(`[debug][HTTP请求错误]`, error)
                }
                return Promise.reject(error)
            }
        )

        // 添加响应拦截器
        this.instance.interceptors.response.use(
            (response: AxiosResponse) => {
                if (this.enableDebugLog) {
                    console.log(`[debug][HTTP响应] ${response.status} ${response.statusText} ${response.config.url}`)
                    console.log(`[debug][HTTP响应头]`, response.headers)
                    console.log(`[debug][HTTP响应体]`, response.data)
                }
                return response
            },
            (error: AxiosError) => {
                if (this.enableDebugLog) {
                    console.log(`[debug][HTTP响应错误]`, {
                        status: error.response?.status,
                        statusText: error.response?.statusText,
                        url: error.config?.url,
                        message: error.message,
                        data: error.response?.data
                    })
                }
                return Promise.reject(error)
            }
        )
    }

    private getAgentForProxy(proxyConfig: AccountProxy): HttpProxyAgent<string> | HttpsProxyAgent<string> | SocksProxyAgent {
        const { url, port } = proxyConfig

        switch (true) {
            case proxyConfig.url.startsWith('http'):
                return new HttpProxyAgent(`${url}:${port}`)
            case proxyConfig.url.startsWith('https'):
                return new HttpsProxyAgent(`${url}:${port}`)
            case proxyConfig.url.startsWith('socks'):
                return new SocksProxyAgent(`${url}:${port}`)
            default:
                throw new Error(`Unsupported proxy protocol: ${url}`)
        }
    }

    // Generic method to make any Axios request
    public async request(config: AxiosRequestConfig, bypassProxy = false): Promise<AxiosResponse> {
        if (bypassProxy) {
            const bypassInstance = axios.create()
            
            // 为bypass实例也添加调试日志
            if (this.enableDebugLog) {
                bypassInstance.interceptors.request.use(
                    (config: InternalAxiosRequestConfig) => {
                        console.log(`[debug][HTTP请求-直连] ${config.method?.toUpperCase()} ${config.url}`)
                        if (config.headers) {
                            console.log(`[debug][HTTP请求头-直连]`, config.headers)
                        }
                        if (config.data) {
                            console.log(`[debug][HTTP请求体-直连]`, config.data)
                        }
                        return config
                    }
                )
                
                bypassInstance.interceptors.response.use(
                    (response: AxiosResponse) => {
                        console.log(`[debug][HTTP响应-直连] ${response.status} ${response.statusText} ${response.config.url}`)
                        console.log(`[debug][HTTP响应头-直连]`, response.headers)
                        console.log(`[debug][HTTP响应体-直连]`, response.data)
                        return response
                    },
                    (error: AxiosError) => {
                        console.log(`[debug][HTTP响应错误-直连]`, {
                            status: error.response?.status,
                            statusText: error.response?.statusText,
                            url: error.config?.url,
                            message: error.message,
                            data: error.response?.data
                        })
                        return Promise.reject(error)
                    }
                )
            }
            
            return bypassInstance.request(config)
        }

        return this.instance.request(config)
    }
}

export default AxiosClient