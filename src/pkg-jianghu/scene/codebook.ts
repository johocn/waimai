/**
 * 暗语本（江湖切口）
 *
 * 玩法：投放人从暗语本里选一个词作「暗号」，只口头告知接头人；
 * 取件人上线后必须报出同一个暗号才能开信，报错则被巡线截获。
 * 暗号本身不下发前端（服务端留存），前端只拿到一条线索（类别 + 字数 + 取自何处）。
 *
 * P3 环境暗号（contextual）：除经典切口外，还有一类「图书馆语境」暗号——
 * 书架编号 / 背景画题诗 / 借阅卡号，按 playerId 种子确定性生成，
 * 使暗号源自场景中真实可读的环境（环境即谜面），且多人之间不重样。
 */

import { seededPick } from './world';

export interface CodeEntry {
    /** 键 */
    k: string;
    /** 暗语文本 */
    t: string;
    /** 类别（用于生成线索） */
    cat: string;
}

/** 语境暗号来源 */
export type CodeSource = 'shelf' | 'painting' | 'card';

/** 语境暗号：附带「在何处读」的线索（只指位置，不泄露暗号本体） */
export interface ContextualCode extends CodeEntry {
    source: CodeSource;
    /** 读取位置描述（如「背景画题诗第 3 字」），不含暗号值 */
    where: string;
}

export const CODEBOOK: CodeEntry[] = [
    { k: 'qinglong', t: '青龙', cat: '四象' },
    { k: 'baihu', t: '白虎', cat: '四象' },
    { k: 'zhuque', t: '朱雀', cat: '四象' },
    { k: 'xuanwu', t: '玄武', cat: '四象' },
    { k: 'duanqiao', t: '断桥', cat: '景物' },
    { k: 'guzhou', t: '孤舟', cat: '景物' },
    { k: 'hanshan', t: '寒山', cat: '景物' },
    { k: 'yeyu', t: '夜雨', cat: '景物' },
    { k: 'guke', t: '故客', cat: '人事' },
    { k: 'laojiu', t: '老酒', cat: '人事' },
    { k: 'duanyan', t: '断雁', cat: '人事' },
    { k: 'qingdeng', t: '青灯', cat: '人事' }
];

/** 背景画题诗（场景中可读；取其第 N 字作暗号） */
export const PAINTING_POEM = '山色有无中';

/**
 * 图书馆语境暗号板：按种子确定性生成三类环境暗号。
 * 与场景内「环境谜面」板同源（都走此函数），保证玩家读到的值即暗号本体。
 */
export function contextualBoard(seed: string): ContextualCode[] {
    const shelfNo = 10 + seededPick(seed, 'ctx-shelf', 80); // 架位号 10..89
    const poemIdx = seededPick(seed, 'ctx-poem', PAINTING_POEM.length);
    const cardTail = 100 + seededPick(seed, 'ctx-card', 900); // 末三位 100..999
    return [
        { k: 'ctx-shelf-' + seed, t: '架' + shelfNo, cat: '书架编号', source: 'shelf', where: '闭架区架位编号' },
        { k: 'ctx-poem-' + seed, t: PAINTING_POEM[poemIdx], cat: '画中题诗', source: 'painting', where: `背景画题诗第 ${poemIdx + 1} 字` },
        { k: 'ctx-card-' + seed, t: String(cardTail), cat: '借阅卡', source: 'card', where: '借阅卡号末三位' }
    ];
}

/** 暗号可报错次数；超过即被截获 */
export const MAX_CODE_TRIES = 2;

export function codeEntry(k: string): CodeEntry | undefined {
    const classic = CODEBOOK.find((c) => c.k === k);
    if (classic) return classic;
    // 语境暗号：k 形如 ctx-<source>-<seed>；seed 可能含连字符，按来源前缀切分后回推
    const m = /^ctx-(shelf|poem|card)-(.+)$/.exec(k);
    if (m) return contextualBoard(m[2]).find((c) => c.k === k);
    return undefined;
}

/** 给取件人的线索：暴露类别与字数；语境暗号额外给出「取自何处」（不含暗号值） */
export function codeHintOf(k: string): string {
    const e = codeEntry(k) as ContextualCode | undefined;
    if (!e) return '';
    const base = `类别「${e.cat}」· ${e.t.length} 字`;
    return e.where ? `${base} · 取自${e.where}` : base;
}
