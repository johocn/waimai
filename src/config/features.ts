/**
 * 功能开关：生产后端尚未部署对应插件/接口的模块，默认关闭入口，避免用户点进去必然失败。
 * 均为编译期常量（Vite env），需要时在 .env 中设为 true 即可开启，无需改代码。
 */

const flag = (v: unknown) => String(v) === 'true';

/**
 * 券包（voucher-plugin，查询 myVouchers）。
 * 默认关闭：待后端部署 voucher-plugin 后开启（在 .env 设置 VITE_FEATURE_VOUCHER=true）。
 */
export const FEATURE_VOUCHER = flag(import.meta.env.VITE_FEATURE_VOUCHER);

/**
 * 周期购订阅（subscription-plugin，availablePlans / mySubscriptions / mySubscriptionOccurrences /
 * createSubscription / confirmRenewal）。
 * 默认关闭：待后端部署 subscription-plugin 后开启（在 .env 设置 VITE_FEATURE_SUBSCRIPTION=true）。
 */
export const FEATURE_SUBSCRIPTION = flag(import.meta.env.VITE_FEATURE_SUBSCRIPTION);

/**
 * 江湖自定义技能审核（admin-api jianghuListCustomSkills / jianghuAuditCustomSkill，后端暂无实现）。
 * 默认关闭：待后端实现这两个接口后开启（在 .env 设置 VITE_FEATURE_JIANGHU_SKILL_AUDIT=true）。
 */
export const FEATURE_JIANGHU_SKILL_AUDIT = flag(import.meta.env.VITE_FEATURE_JIANGHU_SKILL_AUDIT);
