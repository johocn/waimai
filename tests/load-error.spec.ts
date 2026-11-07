import { describe, it, expect } from 'vitest';
import { classifyLoadError } from '../src/utils/load-error';

describe('classifyLoadError（骑手端失败分类）', () => {
    it('GraphQL 权限类错误 → forbidden', () => {
        expect(classifyLoadError({ response: { errors: [{ message: 'Forbidden' }] } })).toBe('forbidden');
        expect(classifyLoadError({ message: 'Unauthorized' })).toBe('forbidden');
        expect(classifyLoadError({ message: '仅认证骑手可查看大厅' })).toBe('forbidden');
    });
    it('网络/其它错误 → failed', () => {
        expect(classifyLoadError(new Error('Failed to fetch'))).toBe('failed');
        expect(classifyLoadError({ response: { errors: [{ message: 'Internal server error' }] } })).toBe('failed');
        expect(classifyLoadError(null)).toBe('failed');
    });
    it('优先取 GraphQL 错误信息而不是外层 message', () => {
        expect(classifyLoadError({ response: { errors: [{ message: 'Not approved rider' }] }, message: 'network' })).toBe('forbidden');
    });
});
