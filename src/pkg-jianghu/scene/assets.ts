/**
 * 场景美术资产接入骨架（渲染无关）
 *
 * ── 用法（美术同学 / 自己渲图时）────────────────────────
 * 1. 按下面的「帧名规范」出图；
 * 2. 用 scripts/pack-ai-atlas.py 打包（去背/裁水印/帧盒底对齐），导出 dd-atlas.png + json；
 * 3. 放到：src/static/jianghu/
 *    （uniapp 会把 src/static 原样拷贝，H5 下即 /waimai/static/jianghu/...）
 * 4. 帧名与 FRAMES 保持一致即可自动生效；缺失任何一帧都会自动回退到程序化绘制，
 *    不会报错、不会白屏。
 *
 * 帧名规范（图集内 frame 名）：
 *   图书馆（学校图书馆·密页传递）：library/bookshelf、library/painting、library/student、
 *     library/librarian、library/table、library/story、library/reading
 *   通用：prop/stone（石墩，密室仍用）、prop/marker、player/idle
 *   已下架（旧死信箱场景，帧仍留在图集里但不被引用）：tree/*、pavilion/*、prop/grass
 * 锚点约定：所有物件 origin 为「底部中心」(0.5, 1)。
 */

/** 站点 base（H5 下为 /waimai/） */
export const ART_BASE = ((import.meta as any).env?.BASE_URL || '/').replace(/\/?$/, '/');
export const ART_DIR = ART_BASE + 'static/jianghu/';

export const ATLAS_KEY = 'dd-atlas';
export const ATLAS_PNG = ART_DIR + 'dd-atlas.png';
export const ATLAS_JSON = ART_DIR + 'dd-atlas.json';

/** 帧名规范：改这里即可对接不同的图集命名 */
export const FRAMES = {
    // 通用（prop/stone 保留：密室仍在用）
    block: 'prop/stone',
    marker: 'prop/marker',
    player: 'player/idle',
    // 学校图书馆 · 密页传递
    lib_bookshelf: 'library/bookshelf',
    lib_painting: 'library/painting',
    lib_student: 'library/student',
    lib_librarian: 'library/librarian',
    lib_table: 'library/table',
    lib_story: 'library/story',
    lib_reading: 'library/reading'
} as const;

/**
 * 探测美术资产是否存在。
 * 有 → 交给 Phaser 加载图集；无 → 直接回退程序化绘制（避免 404 噪声）。
 */
export async function probeArt(): Promise<boolean> {
    try {
        const r = await fetch(ATLAS_JSON);
        if (!r.ok) return false;
        const j = await r.json();
        return !!j && !!j.frames;
    } catch {
        return false;
    }
}

/** 在场景 preload 阶段加载图集（仅在探测到资产时调用） */
export function loadArt(scene: any): void {
    scene.load.atlas(ATLAS_KEY, ATLAS_PNG, ATLAS_JSON);
}

/** 图集中是否存在指定帧 */
export function hasFrame(scene: any, frame: string): boolean {
    if (!scene.textures || !scene.textures.exists(ATLAS_KEY)) return false;
    try {
        return !!scene.textures.get(ATLAS_KEY).has(frame);
    } catch {
        return false;
    }
}
