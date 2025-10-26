export interface AppConfig {
    nodeEnv: 'development' | 'test' | 'production';
    port: number;
}
export declare const getConfig: () => AppConfig;
