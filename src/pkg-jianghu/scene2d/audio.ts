/**
 * WebAudio 程序化音效（无素材，懒初始化）
 *
 * 首个用户手势后才创建 AudioContext（规避自动播放限制）。翻页/拾取/落定/
 * 解码成功/警觉触发分别合成短音。所有函数对「无音频环境」静默降级。
 */
let ctx: any = null;
let enabled = true;

function ac(): any {
    if (ctx) return ctx;
    try {
        const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return null;
        ctx = new Ctor();
    } catch {
        ctx = null;
    }
    return ctx;
}

/** 在首个用户手势里调用，解锁音频 */
export function resumeAudio(): void {
    if (!enabled) return;
    const c = ac();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function setAudioEnabled(on: boolean): void {
    enabled = on;
}

function blip(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.045): void {
    if (!enabled) return;
    const c = ac();
    if (!c || !c.createOscillator) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(c.destination);
    const t = c.currentTime;
    g.gain.setValueAtTime(Math.max(0.0001, gain), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur);
}

export const sfx = {
    /** 翻页：短促纸响 */
    flip: () => blip(540, 0.07, 'triangle'),
    /** 拾起：轻木声 */
    pick: () => blip(300, 0.06, 'sine'),
    /** 落定回弹 */
    drop: () => blip(210, 0.08, 'sine'),
    /** 解码成功：清脆两声 */
    decode: () => {
        blip(680, 0.08, 'triangle');
        setTimeout(() => blip(920, 0.1, 'triangle'), 80);
    },
    /** 警觉触发：低沉鼓点 */
    alarm: () => blip(120, 0.26, 'sawtooth', 0.06),
    /** 机关/抽屉：闷响 */
    clunk: () => blip(160, 0.12, 'square', 0.04),
    /** 线索解锁：柔和上行两音（电池/隔层/幽灵情报成形） */
    unlock: () => {
        blip(523.25, 0.1, 'sine', 0.05);
        setTimeout(() => blip(783.99, 0.16, 'sine', 0.05), 90);
    }
};
