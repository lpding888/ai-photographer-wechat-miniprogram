import { config as loadEnv } from 'dotenv';
let cachedConfig = null;
export const getConfig = () => {
    if (cachedConfig) {
        return cachedConfig;
    }
    loadEnv();
    const nodeEnv = (process.env.NODE_ENV ?? 'development');
    const port = Number.parseInt(process.env.PORT ?? '', 10);
    cachedConfig = {
        nodeEnv,
        port: Number.isNaN(port) ? 4310 : port,
    };
    return cachedConfig;
};
