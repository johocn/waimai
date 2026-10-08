import gql from 'graphql-tag';
import { GraphQLClient } from 'graphql-request';
import { JIANGHU_MOCK } from '../jianghu-env';
import * as mock from '../mock/jianghu';
import type { JianghuClue, JianghuEvent, JianghuEventInput } from '../../types/jianghu';

/**
 * 江湖运营后台接口（admin-api）。
 *
 * 承载 admin mutation：jianghuCreateEvent（发布江湖事件）、jianghuAuditClue（审核/下线线索）。
 * 线索的「读」走专属 admin 查询 jianghuListClues（含 PENDING 待审，玩家侧不可见）；
 * 事件概览仍复用 shop 的 jianghuEventDetail（公共线索墙只返 SHOWN）。
 *
 * 鉴权：admin-api 走 `/admin-api`，生产需运营账号的 admin token（VITE_ADMIN_TOKEN）。
 * 开发期 VITE_JIANGHU_MOCK=true 时改走本地 mock，与真实接口签名一致。
 */

function adminApiUrl(): string {
    const base = (import.meta.env?.VITE_API_URL || '') + '/admin-api';
    // #ifdef H5
    if (!/^https?:\/\//.test(base)) return window.location.origin + base;
    // #endif
    return base;
}

function adminClient(): GraphQLClient {
    const headers: Record<string, string> = {
        'vendure-token': (import.meta.env?.VITE_CHANNEL_TOKEN as string) || '',
    };
    const token = (import.meta.env?.VITE_ADMIN_TOKEN as string) || '';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return new GraphQLClient(adminApiUrl(), { headers });
}

const JH_CREATE_EVENT = gql`
    mutation jianghuCreateEvent($input: JianghuEventInput!) {
        jianghuCreateEvent(input: $input) {
            id name desc total collected perPersonLimit endAt rewardPoolRep
        }
    }
`;

const JH_AUDIT_CLUE = gql`
    mutation jianghuAuditClue($id: ID!, $approve: Boolean!) {
        jianghuAuditClue(id: $id, approve: $approve) {
            id eventId nickname content sourceNote campusCode likes status createdAt
        }
    }
`;

const JH_LIST_CLUES = gql`
    query jianghuListClues($status: String, $limit: Int) {
        jianghuListClues(status: $status, limit: $limit) {
            id eventId nickname content sourceNote campusCode likes status createdAt
        }
    }
`;

/** 发布江湖事件：name/desc 必填，其余有默认值 */
export async function jianghuCreateEvent(input: JianghuEventInput): Promise<JianghuEvent> {
    if (JIANGHU_MOCK) return mock.jianghuCreateEvent(input);
    return adminClient()
        .request(JH_CREATE_EVENT, { input })
        .then((r: any) => r.jianghuCreateEvent);
}

/**
 * 审核线索：approve=true 保持/恢复上墙(SHOWN)，approve=false 下线(REJECTED) 并回收事件进度。
 * 运营后台对每条线索的「通过 / 下线」均走此接口。
 */
export async function jianghuAuditClue(id: string, approve: boolean): Promise<JianghuClue> {
    if (JIANGHU_MOCK) return mock.jianghuAuditClue(id, approve);
    return adminClient()
        .request(JH_AUDIT_CLUE, { id, approve })
        .then((r: any) => r.jianghuAuditClue);
}

/**
 * 列出当前事件的线索（含 PENDING 待审），供运营审核。玩家侧不可见 PENDING，故走 admin 专属查询。
 * status 不传返回全部；传 'PENDING' 仅取待审。
 */
export async function jianghuListClues(status?: string, limit = 50): Promise<JianghuClue[]> {
    if (JIANGHU_MOCK) return mock.jianghuListClues(status, limit);
    return adminClient()
        .request(JH_LIST_CLUES, { status, limit })
        .then((r: any) => r.jianghuListClues);
}
