export interface Config {
    baseURL: string;
    sessionPath: string;
    headless: boolean;
    parallel: boolean;
    runOnZeroPoints: boolean;
    clusters: number;
    saveFingerprint: ConfigSaveFingerprint;
    workers: ConfigWorkers;
    searchOnBingLocalQueries: boolean;
    globalTimeout: number | string;
    searchSettings: ConfigSearchSettings;
    logExcludeFunc: string[];
    webhookLogExcludeFunc: string[];
    proxy: ConfigProxy;
    webhook: ConfigWebhook;
    networkSettings: ConfigNetworkSettings;
    browserSettings: any;
    onlyReport: boolean;
    enableDebugLog: boolean;
}

export interface ConfigSaveFingerprint {
    mobile: boolean;
    desktop: boolean;
}

export interface ConfigSearchSettings {
    useGeoLocaleQueries: boolean;
    useDomesticHotAPIs: boolean;
    preferredCountry: string;
    rewardsLanguage: string;
    scrollRandomResults: boolean;
    clickRandomResults: boolean;
    searchDelay: ConfigSearchDelay;
    retryMobileSearchAmount: number;
}

export interface ConfigSearchDelay {
    min: number | string;
    max: number | string;
}

export interface ConfigNetworkSettings {
    maxRetries: number;
    retryDelay: number;
    connectionTimeout: number;
    pageLoadTimeout: number;
}

export interface ConfigWebhook {
    enabled: boolean;
    url: string;
    notifyOn?: string[];
    telegram?: {
        enabled: boolean;
        botToken: string;
        chatId: string;
        apiProxy?: string;
    };
}

export interface ConfigProxy {
    proxyGoogleTrends: boolean;
    proxyBingTerms: boolean;
    proxyDomesticHotAPIs: boolean;
}

export interface ConfigWorkers {
    doDailySet: boolean;
    doMorePromotions: boolean;
    doPunchCards: boolean;
    doDesktopSearch: boolean;
    doMobileSearch: boolean;
    doDailyCheckIn: boolean;
    doReadToEarn: boolean;
}
