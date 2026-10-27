/**
 * 识别系统：线索碎片 → 拼合候选暗号 → 报号 → 情报原文
 *
 * 三层识别的数据层（渲染无关，便于单测）：
 * 1. 环境谜板：点场景物体取得线索碎片（书架编号 / 画中题诗 / 借阅卡号），
 *    取值与 codebook.contextualBoard 同源——玩家读到的值即暗号本体；
 * 2. 便签偏移：drift（world.driftOf）决定取件时点格容忍度（world.pickTolerance）；
 * 3. 痕迹线索：投放时按手法留下的 codeHint（"取自何处"）。
 *
 * 转化链：收集来源 ≥ requiredCount → assembleClues 给出候选暗号 →
 * 玩家在暗号盘报号 → 服务端校验 → 解密得情报 → 交付总舵核验。
 * 显影剂 / 解码镜 = 降低一档来源门槛（不再直接给答案）；
 * 录音笔录得的耳语可抵一类来源。
 */
import { CODEBOOK, contextualBoard } from './codebook';

/** 线索来源（与 contextualBoard 的 ctx-<source> 前缀对应） */
export type ClueSource = 'shelf' | 'painting' | 'card';

/** 一枚线索碎片 */
export interface ClueFragment {
    source: ClueSource;
    /** 线索正文（含暗号取值本身） */
    text: string;
    /** 取自何处（展示用） */
    where: string;
    /** 收集时刻（世界时钟） */
    at: number;
}

/** 三类线索的展示元数据 */
export const CLUE_SOURCES: { id: ClueSource; name: string; where: string }[] = [
    { id: 'shelf', name: '书架编号', where: '书架区 · 架位号' },
    { id: 'painting', name: '画中题诗', where: '背景画 · 夹层题诗' },
    { id: 'card', name: '借阅卡号', where: '阅览桌 · 借阅卡' }
];

/** 语境暗号 key 前缀 → 线索来源 */
export function sourceOfCodeKey(key: string): ClueSource | null {
    const m = /^ctx-(shelf|poem|card)-/.exec(key);
    if (!m) return null;
    return m[1] === 'poem' ? 'painting' : (m[1] as ClueSource);
}

/** 某暗号需要的线索来源：语境暗号取其自身来源；经典切口需书架 + 题诗两类 */
export function requiredSources(key: string): ClueSource[] {
    const own = sourceOfCodeKey(key);
    if (own) return [own];
    return ['shelf', 'painting'];
}

/** 需收集的独立来源数（显影剂/解码镜 −1；录音耳语抵一类），下限 1 */
export function requiredCount(key: string, opts: { decode?: boolean; recorded?: boolean } = {}): number {
    let n = requiredSources(key).length;
    if (opts.decode) n -= 1;
    if (opts.recorded) n -= 1;
    return Math.max(1, n);
}

/** 点场景物体取得的线索碎片（与 contextualBoard 同源，读到的值即暗号取值） */
export function clueFragment(source: ClueSource, seed: string, now = 0): ClueFragment {
    const key = 'ctx-' + (source === 'painting' ? 'poem' : source) + '-' + seed;
    const c = contextualBoard(seed).find((x) => x.k === key);
    const meta = CLUE_SOURCES.find((s) => s.id === source);
    return { source, text: c ? c.t : '（未见异常）', where: meta ? meta.where : source, at: now };
}

/** 还缺哪些来源才能拼合（UI 引导用） */
export function missingSources(collected: ClueFragment[], key: string, opts: { decode?: boolean; recorded?: boolean } = {}): ClueSource[] {
    const have = new Set(collected.map((c) => c.source));
    const need = requiredSources(key);
    if (need.length === 1) {
        return have.has(need[0]) ? [] : [need[0]];
    }
    const lack = need.filter((s) => !have.has(s));
    const target = requiredCount(key, opts);
    const ok = need.filter((s) => have.has(s));
    if (ok.length >= target) return [];
    return lack.slice(0, Math.max(0, target - ok.length));
}

/**
 * 拼合候选暗号：已收集来源达到该暗号门槛即入选。
 * - 语境暗号：须亲自取到该来源（持解码镜/显影剂时，任意一类也可抵）；
 * - 经典切口：凑够 requiredCount 类来源。
 * 未达门槛返回空数组（玩家据此知道还缺什么）。
 */
export function assembleClues(collected: ClueFragment[], seed: string, opts: { decode?: boolean; recorded?: boolean } = {}): string[] {
    const have = new Set(collected.map((c) => c.source));
    const pool = [...contextualBoard(seed), ...CODEBOOK];
    return pool
        .filter((c) => {
            const need = requiredSources(c.k);
            const target = requiredCount(c.k, opts);
            const ok = need.filter((s) => have.has(s));
            // 录音耳语抵「任意一类」来源
            const withEar = ok.length + (opts.recorded ? 1 : 0);
            if (withEar >= target) return true;
            // 解码镜/显影剂：不限定来源类型，凑够 target 类即可
            return !!opts.decode && have.size >= target;
        })
        .map((c) => c.k);
}
