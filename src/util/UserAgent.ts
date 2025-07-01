import axios from 'axios'
import { BrowserFingerprintWithHeaders } from 'fingerprint-generator'

import { log } from './Logger'

import { ChromeVersion, EdgeVersion } from '../interface/UserAgentUtil'

const NOT_A_BRAND_VERSION = '99'

export async function getUserAgent(isMobile: boolean) {
    const system = getSystemComponents(isMobile)
    const app = await getAppComponents(isMobile)

    const uaTemplate = isMobile ?
        `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${app.chrome_reduced_version} Mobile Safari/537.36 EdgA/${app.edge_version}` :
        `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${app.chrome_reduced_version} Safari/537.36 Edg/${app.edge_version}`

    const platformVersion = `${isMobile ? Math.floor(Math.random() * 5) + 9 : Math.floor(Math.random() * 15) + 1}.0.0`

    const uaMetadata = {
        isMobile,
        platform: isMobile ? 'Android' : 'Windows',
        fullVersionList: [
            { brand: 'Not/A)Brand', version: `${NOT_A_BRAND_VERSION}.0.0.0` },
            { brand: 'Microsoft Edge', version: app['edge_version'] },
            { brand: 'Chromium', version: app['chrome_version'] }
        ],
        brands: [
            { brand: 'Not/A)Brand', version: NOT_A_BRAND_VERSION },
            { brand: 'Microsoft Edge', version: app['edge_major_version'] },
            { brand: 'Chromium', version: app['chrome_major_version'] }
        ],
        platformVersion,
        architecture: isMobile ? '' : 'x86',
        bitness: isMobile ? '' : '64',
        model: ''
    }

    return { userAgent: uaTemplate, userAgentMetadata: uaMetadata }
}

export async function getChromeVersion(isMobile: boolean): Promise<string> {
    try {
        const request = {
            url: 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        }

        const response = await axios(request)
        const data: ChromeVersion = response.data
        return data.channels.Stable.version

    } catch (error) {
        throw log(isMobile, 'USERAGENT-CHROME-VERSION', 'An error occurred:' + error, 'error')
    }
}

export async function getEdgeVersions(isMobile: boolean) {
    try {
        const request = {
            url: 'https://edgeupdates.microsoft.com/api/products',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        }

        const response = await axios(request)
        const data: EdgeVersion[] = response.data
        const stable = data.find(x => x.Product == 'Stable') as EdgeVersion
        return {
            android: stable.Releases.find(x => x.Platform == 'Android')?.ProductVersion,
            windows: stable.Releases.find(x => (x.Platform == 'Windows' && x.Architecture == 'x64'))?.ProductVersion
        }


    } catch (error) {
        throw log(isMobile, 'USERAGENT-EDGE-VERSION', 'An error occurred:' + error, 'error')
    }
}

export function getSystemComponents(mobile: boolean): string {
    const osId: string = mobile ? 'Linux' : 'Windows NT 10.0'
    const uaPlatform: string = mobile ? `Android 1${Math.floor(Math.random() * 5)}` : 'Win64; x64'

    if (mobile) {
        return `${uaPlatform}; ${osId}; K`
    }

    return `${uaPlatform}; ${osId}`
}

export async function getAppComponents(isMobile: boolean) {
    const versions = await getEdgeVersions(isMobile)
    const edgeVersion = isMobile ? versions.android : versions.windows as string
    const edgeMajorVersion = edgeVersion?.split('.')[0]

    const chromeVersion = await getChromeVersion(isMobile)
    const chromeMajorVersion = chromeVersion?.split('.')[0]
    const chromeReducedVersion = `${chromeMajorVersion}.0.0.0`

    return {
        not_a_brand_version: `${NOT_A_BRAND_VERSION}.0.0.0`,
        not_a_brand_major_version: NOT_A_BRAND_VERSION,
        edge_version: edgeVersion as string,
        edge_major_version: edgeMajorVersion as string,
        chrome_version: chromeVersion as string,
        chrome_major_version: chromeMajorVersion as string,
        chrome_reduced_version: chromeReducedVersion as string
    }
}

export async function updateFingerprintUserAgent(fingerprint: BrowserFingerprintWithHeaders, isMobile: boolean, config?: any): Promise<BrowserFingerprintWithHeaders> {
    try {
        const userAgentData = await getUserAgent(isMobile)
        const componentData = await getAppComponents(isMobile)

        //@ts-expect-error Errors due it not exactly matching
        fingerprint.fingerprint.navigator.userAgentData = userAgentData.userAgentMetadata
        fingerprint.fingerprint.navigator.userAgent = userAgentData.userAgent
        fingerprint.fingerprint.navigator.appVersion = userAgentData.userAgent.replace(`${fingerprint.fingerprint.navigator.appCodeName}/`, '')

        fingerprint.headers['user-agent'] = userAgentData.userAgent
        fingerprint.headers['sec-ch-ua'] = `"Microsoft Edge";v="${componentData.edge_major_version}", "Not=A?Brand";v="${componentData.not_a_brand_major_version}", "Chromium";v="${componentData.chrome_major_version}"`
        fingerprint.headers['sec-ch-ua-full-version-list'] = `"Microsoft Edge";v="${componentData.edge_version}", "Not=A?Brand";v="${componentData.not_a_brand_version}", "Chromium";v="${componentData.chrome_version}"`

        // 动态设置accept-language
        let acceptLanguage = 'en-US,en;q=0.9'
        if (config && config.preferredCountry && config.preferredCountry.length === 2) {
            const country = config.preferredCountry.toLowerCase()
            switch (country) {
                case 'cn':
                    acceptLanguage = 'zh-CN,zh;q=0.9,en;q=0.8'
                    break
                case 'us':
                    acceptLanguage = 'en-US,en;q=0.9'
                    break
                case 'jp':
                    acceptLanguage = 'ja-JP,ja;q=0.9,en;q=0.8'
                    break
                case 'kr':
                    acceptLanguage = 'ko-KR,ko;q=0.9,en;q=0.8'
                    break
                case 'gb':
                    acceptLanguage = 'en-GB,en;q=0.9'
                    break
                case 'de':
                    acceptLanguage = 'de-DE,de;q=0.9,en;q=0.8'
                    break
                case 'fr':
                    acceptLanguage = 'fr-FR,fr;q=0.9,en;q=0.8'
                    break
                case 'es':
                    acceptLanguage = 'es-ES,es;q=0.9,en;q=0.8'
                    break
                case 'it':
                    acceptLanguage = 'it-IT,it;q=0.9,en;q=0.8'
                    break
                case 'ru':
                    acceptLanguage = 'ru-RU,ru;q=0.9,en;q=0.8'
                    break
                default:
                    acceptLanguage = 'en-US,en;q=0.9'
            }
        }
        fingerprint.headers['accept-language'] = acceptLanguage

        return fingerprint
    } catch (error) {
        throw log(isMobile, 'USER-AGENT-UPDATE', 'An error occurred:' + error, 'error')
    }
}