import { describe, expect, it } from "vitest";
import { quotaSafe, memoryStorage } from "@/lib/xhs/store";
import { dataUrlBytes, fitBox, MAX_EDGE } from "@/lib/xhs/image";

/**
 * Regression cover for the broken-image bug: a card came out of a real render
 * containing `<img src="asset:amtufp3udd">`, because the attached screenshots
 * were never persisted while the tokens referencing them were.
 */

describe("fitBox", () => {
  it("不放大小图", () => {
    expect(fitBox(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("按长边缩到上限, 保持比例", () => {
    const box = fitBox(3000, 1500);
    expect(box.width).toBe(MAX_EDGE);
    expect(box.height).toBe(MAX_EDGE / 2);
  });

  it("竖图按高度缩", () => {
    const box = fitBox(1170, 2532, 1600);
    expect(box.height).toBe(1600);
    expect(box.width).toBe(Math.round((1170 * 1600) / 2532));
  });

  it("极端长宽比时短边不会被舍入成 0", () => {
    expect(fitBox(10000, 3).width).toBe(MAX_EDGE);
    expect(fitBox(10000, 3).height).toBeGreaterThanOrEqual(1);
  });

  it("尺寸非法时返回 0, 调用方据此放弃缩放", () => {
    expect(fitBox(0, 100)).toEqual({ width: 0, height: 0 });
    expect(fitBox(Number.NaN, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe("dataUrlBytes", () => {
  it("估算 base64 解码后的大小", () => {
    // 4 base64 chars carry 3 bytes.
    expect(dataUrlBytes("data:image/png;base64," + "A".repeat(4000))).toBe(3000);
  });

  it("不是 data URL 时返回 0", () => {
    expect(dataUrlBytes("asset:abc")).toBe(0);
  });
});

describe("quotaSafe", () => {
  const snapshot = (assets: Record<string, string>) =>
    JSON.stringify({
      state: { tasks: [{ id: "t1", sourceText: "用户辛苦写的正文", assets }] },
      version: 1,
    });

  it("写得下时原样写入", () => {
    const inner = memoryStorage();
    const s = quotaSafe(inner);
    const v = snapshot({ "asset:a": "data:image/jpeg;base64,AAAA" });
    s.setItem("k", v);
    expect(inner.getItem("k")).toBe(v);
  });

  it("超配额时丢掉图片、保住正文, 而不是整份快照写失败", () => {
    const inner = memoryStorage();
    let allow = false;
    const flaky = {
      getItem: inner.getItem,
      removeItem: inner.removeItem,
      setItem: (n: string, v: string) => {
        // Reject the first (large) write the way a real quota error would.
        if (!allow) {
          allow = true;
          throw new DOMException("quota", "QuotaExceededError");
        }
        inner.setItem(n, v);
      },
    };
    quotaSafe(flaky).setItem("k", snapshot({ "asset:a": "data:image/jpeg;base64," + "A".repeat(9_000_000) }));

    const written = JSON.parse(inner.getItem("k") as string);
    expect(written.state.tasks[0].sourceText).toBe("用户辛苦写的正文");
    expect(written.state.tasks[0].assets).toEqual({});
  });

  it("两次都失败时不抛异常, 保留上一份快照", () => {
    const always = {
      getItem: () => "previous",
      removeItem: () => {},
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    expect(() => quotaSafe(always).setItem("k", snapshot({}))).not.toThrow();
    expect(quotaSafe(always).getItem("k")).toBe("previous");
  });
});
