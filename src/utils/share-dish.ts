/**
 * 单品分享：把「店铺 + 菜品」编码进链接，好友打开直达该店铺菜单页，
 * 自动高亮并定位这道菜，提供一键加购。
 * 复用 base64url（unicode 安全，H5 可用），字段缩写保持链接简短。
 */
export interface DishRef {
    /** 店铺 channelToken */
    token: string;
    /** 规格 id（菜单页据此定位与高亮） */
    variantId: string;
    /** 规格名 */
    name: string;
}

function toBase64(str: string): string {
    try {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        bytes.forEach((b) => { bin += String.fromCharCode(b); });
        return btoa(bin);
    } catch {
        try {
            return btoa(unescape(encodeURIComponent(str)));
        } catch {
            return '';
        }
    }
}

function fromBase64(b64: string): string {
    try {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    } catch {
        try {
            return decodeURIComponent(escape(atob(b64)));
        } catch {
            return '';
        }
    }
}

export function encodeDish(ref: DishRef): string {
    const b64 = toBase64(JSON.stringify({ t: ref.token, v: ref.variantId, n: ref.name }));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeDish(raw: string): DishRef | null {
    const norm = String(raw || '').replace(/-/g, '+').replace(/_/g, '/');
    if (!norm) return null;
    const pad = norm.length % 4 ? '='.repeat(4 - (norm.length % 4)) : '';
    const json = fromBase64(norm + pad);
    if (!json) return null;
    try {
        const obj = JSON.parse(json);
        if (!obj || !obj.t || !obj.v) return null;
        return { token: String(obj.t), variantId: String(obj.v), name: String(obj.n || '') };
    } catch {
        return null;
    }
}

/** 菜单页 URL 查询串片段（放在其它参数之后） */
export function dishQuery(encoded: string): string {
    return `&d=${encoded}`;
}

/** 站内分享路径（配合 sharePage 转绝对地址） */
export function dishPath(encoded: string): string {
    return `/pages/shop/menu?d=${encoded}`;
}
