import { defaults, sanitizeSettings, type Settings } from "./schema";
export function settingsMarkup(settings: Settings, desktop: boolean) {
  return `
  <header class="companion-header"><img src="/brand-icon.png" alt=""/><div><h1>SCULPY</h1><p>你的桌面小伙伴</p></div><span class="live-pill" id="live-status">${settings.paused ? "已暂停" : "陪伴中"}</span></header>
  <div class="pet-actions"><button data-pet-action="Jump"><span>↟</span>跳一下</button><button data-pet-action="Happy"><span>↻</span>转个圈</button><button data-pet-action="Stretch"><span>✧</span>伸懒腰</button><button data-pet-action="Sleep"><span>☾</span>小憩</button></div>
  <p class="touch-guide">轻点打招呼 · 鼠标往返摸头 · 按住拖动</p>
  <section class="preference-group"><h2>外观与活动</h2>
  <label class="range-row"><span>角色大小 <output id="size-value">${settings.size} px</output></span><input id="size" aria-label="角色大小" type="range" min="130" max="340" step="10" value="${settings.size}"/></label>
  <label class="range-row"><span>活跃程度 <output id="activity-value">${Math.round(settings.activity * 100)}%</output></span><input id="activity" aria-label="自主活动频率" type="range" min="0" max="100" value="${settings.activity * 100}"/></label>
  <div class="range-legend"><span>安静陪伴</span><span>活泼好动</span></div></section>
  <section class="preference-group"><h2>陪伴偏好</h2>
  <label class="toggle-row"><span>轻柔音效<small>互动时轻声回应</small></span><input id="sound" role="switch" type="checkbox" ${settings.sound ? "checked" : ""}/></label>
  <label class="toggle-row"><span>保持置顶<small>显示在其他窗口上方</small></span><input id="alwaysOnTop" role="switch" type="checkbox" ${settings.alwaysOnTop ? "checked" : ""} ${desktop ? "" : "disabled"}/></label>
  <label class="toggle-row"><span>开机陪伴<small>${desktop ? "登录 Windows 后自动出现" : "Windows 桌面版可用"}</small></span><input id="autostart" role="switch" type="checkbox" ${settings.autostart ? "checked" : ""} ${desktop ? "" : "disabled"}/></label></section>
  <div class="settings-actions"><button id="pause" class="primary">${settings.paused ? "继续陪伴" : "暂停活动"}</button><button id="reset" class="secondary">回到原位</button>${desktop ? '<button id="hide" class="secondary">暂时隐藏</button><button id="reload" class="secondary">恢复角色</button>' : ""}</div>
  <div class="settings-bottom"><p id="settings-feedback" role="status">设置会自动保存</p>${desktop ? '<button id="quit" class="text-button">退出 SCULPY</button>' : ""}</div>`;
}
export function bindSettings(
  root: HTMLElement,
  get: () => Settings,
  save: (s: Settings) => Promise<void>,
  actions: Record<string, () => void>,
) {
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-pet-action]",
  ))
    button.onclick = () => actions["act:" + button.dataset.petAction]?.();
  const feedback = root.querySelector<HTMLElement>("#settings-feedback")!;
  let queue = Promise.resolve();
  const apply = (patch: Partial<Settings>) => {
    queue = queue.then(async () => {
      try {
        await save(sanitizeSettings({ ...get(), ...patch }));
        feedback.textContent = "已保存";
        const paused = get().paused;
        root.querySelector("#live-status")!.textContent = paused
          ? "已暂停"
          : "陪伴中";
        for (const b of root.querySelectorAll<HTMLButtonElement>(
          "[data-pet-action]",
        ))
          b.disabled = paused;
      } catch (e) {
        feedback.textContent = `保存失败：${String(e)}`;
      }
    });
    return queue;
  };
  for (const key of ["size", "activity"] as const) {
    const el = root.querySelector<HTMLInputElement>("#" + key)!;
    el.oninput = () => {
      root.querySelector("#" + key + "-value")!.textContent =
        key === "size" ? el.value + " px" : el.value + "%";
    };
    el.onchange = () =>
      void apply({ [key]: Number(el.value) / (key === "activity" ? 100 : 1) });
  }
  for (const key of ["sound", "alwaysOnTop", "autostart"] as const) {
    const el = root.querySelector<HTMLInputElement>("#" + key)!;
    el.onchange = () => void apply({ [key]: el.checked });
  }
  root.querySelector<HTMLButtonElement>("#pause")!.onclick = () =>
    void apply({ paused: !get().paused }).then(() => {
      root.querySelector("#pause")!.textContent = get().paused
        ? "继续陪伴"
        : "暂停活动";
    });
  for (const [id, action] of Object.entries(actions)) {
    if (id.startsWith("act:")) continue;
    const el = root.querySelector<HTMLButtonElement>("#" + id);
    if (el) el.onclick = action;
  }
}
export function localSettings() {
  try {
    return sanitizeSettings(
      JSON.parse(
        localStorage.getItem("sculpy-settings") ?? JSON.stringify(defaults),
      ),
    );
  } catch {
    return { ...defaults };
  }
}
