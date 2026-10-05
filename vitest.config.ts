import { defineConfig } from 'vitest/config';

// 独立于 vite.config.ts（后者挂 uni 插件，node 测试环境加载 uni-cli-shared 会 MODULE_NOT_FOUND）
export default defineConfig({
    test: {
        include: ['tests/**/*.spec.ts'],
        environment: 'node',
    },
});
