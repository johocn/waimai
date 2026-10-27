/**
 * 解谜与机关（纯逻辑，mock 内可解，不改后端契约）
 *
 * 三类：
 * - decode：密码本解码小游戏，密钥藏在某本书的某一页（答案由密钥书 id 派生，便于测试）；
 * - riddle：书中谜题，文字谜面输入答案；
 * - lock：画后暗格密码锁，三位门禁号。
 * 解出的线索复用既有 evidence/anomaly 入口进证据链，不新增后端字段。
 */
import type { PuzzleState } from './types';

/** 由密钥书 id 派生解码答案（mock 可解、可断言） */
export function makeDecodePuzzle(keyFromBook: string): PuzzleState {
    const seed = (keyFromBook || 'shelf-1-b0').replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase() || 'X0B1';
    return {
        kind: 'decode',
        answer: 'CODE-' + seed,
        solved: false,
        hint: '密钥藏在架上一本书的某一页，翻到对应页可破译密文',
        fromBook: keyFromBook
    };
}

export function makeRiddlePuzzle(): PuzzleState {
    return { kind: 'riddle', answer: '墨', solved: false, hint: '「白纸黑字，藏于乌有；落笔成痕，洗之不去」打一字' };
}

export function makeLockPuzzle(): PuzzleState {
    return { kind: 'lock', answer: '5181', solved: false, hint: '暗格三位门禁号（本地服务端口后四位）' };
}

/** 校验答案（忽略大小写与首尾空格） */
export function checkPuzzle(p: PuzzleState, input: string): boolean {
    if (!p || p.solved) return true;
    const a = (input || '').trim().toUpperCase();
    p.solved = a === p.answer.toUpperCase();
    return p.solved;
}

/** 解出后产出的线索文案（进证据链/提示用） */
export function puzzleClue(p: PuzzleState): string {
    switch (p.kind) {
        case 'decode':
            return '破译出接头暗号前缀（密页已可拼合）';
        case 'riddle':
            return '谜底点破画后暗格方位';
        case 'lock':
            return '暗格门禁已开，露出藏匿隔层';
        default:
            return '谜题已解';
    }
}
