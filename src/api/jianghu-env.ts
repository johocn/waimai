/**
 * 江湖模块数据源开关。
 *
 * VITE_JIANGHU_MOCK=true → 走本地 mock（src/api/mock/jianghu.ts），后端未就绪也能联调 UI；
 * 未设置或 false → 走真实 GraphQL（campus-jianghu-plugin）。
 * 开发期在 .env.development 置为 true，生产不设置即可自动切到真实接口。
 */
export const JIANGHU_MOCK: boolean =
    String((import.meta.env as any)?.VITE_JIANGHU_MOCK || '').toLowerCase() === 'true';
