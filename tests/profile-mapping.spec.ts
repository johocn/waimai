import { describe, it, expect } from 'vitest';
import {
    pickDefaultCampusAddress, isValidCampusTarget,
    parseInvoiceTitles, validateInvoiceTitle, type InvoiceTitle,
} from '../src/utils/profile-mapping';

const addr = (over: any = {}) => ({ id: '1', fullName: '张同学', phoneNumber: '13800000001', streetLine1: '3号楼502', defaultShippingAddress: false, customFields: { zoneId: '7', buildingId: '12' }, ...over });

describe('pickDefaultCampusAddress', () => {
    it('优先取 defaultShippingAddress 的校园地址', () => {
        const list = [addr({ id: '2', customFields: {} }), addr()];
        expect(pickDefaultCampusAddress(list)?.id).toBe('1');
    });
    it('无默认时取首个带 zoneId 的地址', () => {
        const list = [addr({ defaultShippingAddress: false, customFields: {} }), addr({ id: '3' })];
        expect(pickDefaultCampusAddress(list)?.id).toBe('3');
    });
    it('无校园地址返回 null', () => {
        expect(pickDefaultCampusAddress([addr({ customFields: {} })])).toBeNull();
        expect(pickDefaultCampusAddress([])).toBeNull();
    });
});

describe('isValidCampusTarget', () => {
    const zones = [{ id: '7' }, { id: '8' }];
    const buildings = [{ id: '12', zoneId: '7' }];
    it('zone+building 均命中且归属正确', () => {
        expect(isValidCampusTarget('7', '12', zones, buildings)).toBe(true);
    });
    it('楼栋不属于该分区 → false（跨店铺脏数据）', () => {
        expect(isValidCampusTarget('8', '12', zones, buildings)).toBe(false);
    });
    it('zone 或 building 已删除 → false', () => {
        expect(isValidCampusTarget('9', '12', zones, buildings)).toBe(false);
        expect(isValidCampusTarget('7', '99', zones, buildings)).toBe(false);
    });
});

describe('invoiceTitles', () => {
    it('parse：合法 JSON 数组原样返回，坏 JSON 返回 []，超 5 条裁剪', () => {
        expect(parseInvoiceTitles('[{"type":"personal","name":"张三","email":"a@b.c"}]')).toHaveLength(1);
        expect(parseInvoiceTitles('not-json')).toEqual([]);
        expect(parseInvoiceTitles(null)).toEqual([]);
        const five: InvoiceTitle[] = [
            { type: 'personal', name: '1', email: 'a@a.c' }, { type: 'personal', name: '2', email: 'a@a.c' },
            { type: 'personal', name: '3', email: 'a@a.c' }, { type: 'personal', name: '4', email: 'a@a.c' },
            { type: 'personal', name: '5', email: 'a@a.c' }, { type: 'personal', name: '6', email: 'a@a.c' },
        ];
        expect(parseInvoiceTitles(JSON.stringify(five))).toHaveLength(5);
    });
    it('validate：个人缺税号合法，企业缺税号报 TAXNO_REQUIRED', () => {
        expect(validateInvoiceTitle({ type: 'personal', name: '张三', email: 'a@b.c' })).toBeNull();
        expect(validateInvoiceTitle({ type: 'company', name: '公司', email: 'a@b.c' })).toBe('TAXNO_REQUIRED');
        expect(validateInvoiceTitle({ type: 'company', name: '公司', taxNo: '123', email: 'a@b.c' })).toBe('TAXNO_INVALID');
        expect(validateInvoiceTitle({ type: 'personal', name: '', email: 'a@b.c' })).toBe('NAME_REQUIRED');
        expect(validateInvoiceTitle({ type: 'personal', name: '张三', email: 'bad' })).toBe('EMAIL_INVALID');
        expect(validateInvoiceTitle({ type: 'other' } as any)).toBe('TYPE_INVALID');
    });
});
