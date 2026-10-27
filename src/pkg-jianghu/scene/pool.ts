/**
 * 通用对象池（渲染无关，可单测）
 *
 * 用于需要反复出现/消失的场景对象（装饰草丛、碎石、落叶道具、临时标记等），
 * 避免频繁 create/destroy 造成 GC 抖动。
 */
export class ObjectPool<T> {
    private free: T[] = [];
    private used: Set<T> = new Set();
    private factory: () => T;
    private resetFn?: (o: T) => void;

    constructor(factory: () => T, resetFn?: (o: T) => void) {
        this.factory = factory;
        this.resetFn = resetFn;
    }

    /** 取一个对象（优先复用） */
    acquire(): T {
        const o = this.free.length ? (this.free.pop() as T) : this.factory();
        this.used.add(o);
        return o;
    }

    /** 归还一个对象 */
    release(o: T): void {
        if (!this.used.delete(o)) return;
        if (this.resetFn) this.resetFn(o);
        this.free.push(o);
    }

    /** 全部归还 */
    releaseAll(): void {
        Array.from(this.used).forEach((o) => this.release(o));
    }

    /** 当前在用数量 */
    get active(): number {
        return this.used.size;
    }
    /** 空闲可复用数量 */
    get idle(): number {
        return this.free.length;
    }
}
