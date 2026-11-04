import "./style.css";
import { packMask } from "./interactions/silhouette";
import { Companion, type Motion } from "./behaviors/companion";
import { CharacterRenderer } from "./character/renderer";
import { Sounds } from "./audio/sound";
import {
  desktop,
  call,
  on,
  readSettings,
  type Snapshot,
} from "./platform/desktop";
import { bindSettings, localSettings, settingsMarkup } from "./settings/panel";
import { sanitizeSettings, type Settings } from "./settings/schema";

async function start() {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  let settings = desktop ? await readSettings() : localSettings();
  if (new URLSearchParams(location.search).has("settings")) {
    document.body.className = "settings-window";
    app.innerHTML = `<main class="settings-card">${settingsMarkup(settings, true)}<footer class="settings-footer">SCULPY <span>Desktop Companion · 0.1.2-dev</span></footer></main>`;
    bindSettings(
      app,
      () => settings,
      async (s) => {
        settings = await call<Settings>("save_settings", { settings: s });
      },
      {
        reset: () => void call("reset_pet"),
        hide: () => void call("hide_pet"),
        quit: () => void call("quit_app"),
        reload: () => void call("reload_pet"),
        ...Object.fromEntries(
          ["Jump", "Happy", "Stretch", "Sleep"].map((action) => [
            "act:" + action,
            () => void call("perform_action", { action }),
          ]),
        ),
      },
    );
    await on<Settings>("settings-changed", (s) => {
      settings = s;
      const button = document.querySelector("#pause");
      if (button) button.textContent = s.paused ? "继续活动" : "暂停活动";
    });
    return;
  }
  document.body.className = desktop ? "desktop" : "studio";
  app.innerHTML = desktop
    ? '<main id="stage"></main><div id="bubble" role="status"></div>'
    : `
  <header class="topbar"><a class="wordmark" href="#">sculpy<span>®</span></a><span class="top-label">DESKTOP COMPANION</span><span class="version"><i></i> 0.1.2 · 开发预览</span></header>
  <main class="studio-layout"><aside class="sidebar"><div class="intro"><span class="eyebrow">A LITTLE PRESENCE.</span><h1>有点好奇，<br/>也有点<span>黏你。</span></h1><p>一只住在桌面的奶油小精灵。<br/>不用说什么，陪着就很好。</p></div>
  <section class="interaction-guide"><h2>打个招呼</h2><div><span class="guide-symbol">↖</span><p><b>点一下</b><small>看看它会怎么回应你</small></p></div><div><span class="guide-symbol">↔</span><p><b>来回摸摸头</b><small>鼠标在头上轻轻往返，不用按住</small></p></div><div><span class="guide-symbol">↑</span><p><b>抓起来，再松手</b><small>试试轻轻放下，或者让它跳一下</small></p></div></section>
  <button id="settings-toggle" class="settings-link">相处设置 <span>↗</span></button><div class="sidebar-foot">MADE FOR YOUR EVERYDAY.<br/><span>Windows 10 / 11 · 3D 互动开发版</span></div></aside>
  <section class="playground"><div class="scene-heading"><span><i></i> THE LITTLE STUDIO</span><button id="reset-scene" class="text-button">回到原位 ↺</button></div><div id="stage"><div class="floor-glow"></div><div id="bubble" role="status"></div><span class="loading">正在唤醒 SCULPY…</span></div>
  <div class="scene-caption"><span class="mood-dot"></span><span id="mood">平静 · 正在陪着你</span><span id="motion" class="motion-tag">Idle</span></div>
  <div class="actions"><button data-motion="Jump">跳一下 <span>↟</span></button><button data-motion="Happy">开心转圈 <span>↻</span></button><button data-motion="Stretch">伸个懒腰 <span>✧</span></button><button data-motion="Sleep">睡一会儿 <span>☾</span></button><button data-motion="WakeUp">醒醒 <span>☀</span></button></div>
  <div class="rotation-row"><span>360° 看看我</span><input id="rotation" aria-label="360度旋转" type="range" min="-180" max="180" value="0"/><button id="pause-scene" class="text-button">暂停活动</button></div>
  <p class="preview-note">这里用于检查真实 3D 模型和互动。透明桌面、系统托盘与点击穿透需在 Windows 桌面程序中验证。</p></section></main>
  <dialog id="settings-dialog"><button id="settings-close" class="dialog-close" aria-label="关闭设置">×</button><div id="settings-content"></div></dialog>`;
  const c = new Companion();
  c.settings = settings;
  const sounds = new Sounds();
  sounds.enabled = settings.sound;
  const stage = document.querySelector<HTMLElement>("#stage")!;
  const renderer = new CharacterRenderer(stage, desktop);
  const bubble = document.querySelector<HTMLElement>("#bubble")!;
  let bubbleUntil = 0;
  c.onEvent = (message) => {
    bubble.textContent = message;
    bubble.classList.add("visible");
    bubbleUntil = performance.now() + 1800;
    sounds.chirp(c.emotion === "Angry");
  };
  const save = async (s: Settings) => {
    c.cancelPointer();
    settings = desktop
      ? await call<Settings>("save_settings", { settings: s })
      : sanitizeSettings(s);
    if (!desktop)
      localStorage.setItem("sculpy-settings", JSON.stringify(settings));
    c.settings = settings;
    sounds.enabled = settings.sound;
    const pause = document.querySelector("#pause-scene");
    if (pause) pause.textContent = settings.paused ? "继续活动" : "暂停活动";
  };
  let snapshot: Snapshot | undefined;
  let unlisten: (() => void) | undefined;
  let visible = true;
  let rendererHealthy = true;
  const recover = () => {
    c.cancelPointer();
    const now = Date.now(),
      last = Number(sessionStorage.getItem("sculpy-recovery") ?? 0);
    if (now - last > 30000) {
      sessionStorage.setItem("sculpy-recovery", String(now));
      location.reload();
    } else {
      rendererHealthy = false;
      bubble.textContent = "角色已暂停，请从托盘重新加载";
      bubble.classList.add("visible");
    }
  };
  if (desktop) {
    snapshot = await call<Snapshot>("get_snapshot");
    c.setDisplays(snapshot.areas);
    Object.assign(c.body, snapshot.pet);
    unlisten = await on<Snapshot>("desktop-snapshot", (s) => {
      snapshot = s;
      visible = s.visible;
      if (!visible) {
        c.cancelPointer();
        return;
      }
      c.setDisplays(s.areas);
      const hit = renderer.hit(s.local.x, s.local.y);
      c.pointerMove(s.cursor, hit.head, 1 / 30);
      if (!s.leftDown) c.pointerUp();
    });
    await on<Settings>("settings-changed", (s) => {
      c.cancelPointer();
      settings = s;
      c.settings = s;
      sounds.enabled = s.sound;
    });
    await on<Motion>("perform-action", (m) => c.act(m));
    await on("reset-requested", () => {
      c.reset();
    });
  } else {
    const resize = () => {
      c.setDisplays([
        {
          x: 0,
          y: 0,
          width: stage.clientWidth,
          height: stage.clientHeight - 2,
          scale: 1,
        },
      ]);
      if (c.body.x > stage.clientWidth || c.body.y > stage.clientHeight)
        c.reset();
    };
    new ResizeObserver(resize).observe(stage);
    resize();
    c.reset();
    document.querySelector("#reset-scene")!.addEventListener("click", () => {
      c.reset();
      renderer.rotation = 0;
      (document.querySelector("#rotation") as HTMLInputElement).value = "0";
    });
    document
      .querySelector("#pause-scene")!
      .addEventListener(
        "click",
        () => void save({ ...settings, paused: !settings.paused }),
      );
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      "[data-motion]",
    ))
      button.onclick = () => {
        sounds.unlock();
        c.act(button.dataset.motion as Motion);
      };
    document.querySelector<HTMLInputElement>("#rotation")!.oninput = (e) => {
      renderer.rotation =
        (Number((e.target as HTMLInputElement).value) * Math.PI) / 180;
    };
    const dialog =
      document.querySelector<HTMLDialogElement>("#settings-dialog")!;
    document
      .querySelector("#settings-toggle")!
      .addEventListener("click", () => {
        const content =
          document.querySelector<HTMLElement>("#settings-content")!;
        content.innerHTML = settingsMarkup(settings, false);
        bindSettings(content, () => settings, save, {
          reset: () => c.reset(),
          ...Object.fromEntries(
            ["Jump", "Happy", "Stretch", "Sleep"].map((m) => [
              "act:" + m,
              () => c.act(m as Motion),
            ]),
          ),
        });
        dialog.showModal();
      });
    document
      .querySelector("#settings-close")!
      .addEventListener("click", () => dialog.close());
  }
  let pointer = { x: -1000, y: -1000 };
  const local = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  renderer.canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    sounds.unlock();
    const p = local(e),
      hit = renderer.hit(p.x, p.y);
    if (hit.hit) {
      c.pointerDown(desktop ? snapshot!.cursor : p, true);
      renderer.canvas.setPointerCapture(e.pointerId);
    }
  });
  renderer.canvas.addEventListener("pointermove", (e) => {
    pointer = local(e);
  });
  renderer.canvas.addEventListener("pointerleave", () => {
    if (!c.dragging) pointer = { x: -1000, y: -1000 };
  });
  renderer.canvas.addEventListener("pointerup", (e) => {
    c.pointerUp();
    if (renderer.canvas.hasPointerCapture(e.pointerId))
      renderer.canvas.releasePointerCapture(e.pointerId);
  });
  renderer.canvas.addEventListener("pointercancel", () => c.cancelPointer());
  renderer.canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (desktop) void call("open_settings");
    else
      (document.querySelector("#settings-toggle") as HTMLButtonElement).click();
  });
  renderer.canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    rendererHealthy = false;
    setTimeout(recover, 700);
    bubble.textContent = "正在恢复角色…";
    bubble.classList.add("visible");
  });
  window.addEventListener("blur", () => {
    if (!desktop) c.cancelPointer();
  });
  try {
    await renderer.load();
  } catch (error) {
    throw new Error("SCULPY 模型加载失败：" + String(error));
  }
  document.querySelector(".loading")?.remove();
  let previous = performance.now(),
    lastNative = 0,
    lastMask = 0,
    lastFrame = 0,
    pending = false;
  let mask: number[] | null = null;
  const moods = {
    Normal: "平静 · 正在陪着你",
    Happy: "开心 · 喜欢被摸摸",
    Angry: "生气 · 给我一点空间",
    Curious: "好奇 · 在看什么呢",
    Sleepy: "困倦 · 小憩一会儿",
    Surprised: "惊讶 · 发生什么啦",
  };
  function frame(now: number) {
    requestAnimationFrame(frame);
    if (desktop && now - lastFrame < 1000 / (c.settings.paused ? 10 : 30))
      return;
    lastFrame = now;
    const dt = Math.min((now - previous) / 1000, 1 / 30);
    previous = now;
    if (!visible || !rendererHealthy) return;
    if (!desktop) {
      const hit = renderer.hit(pointer.x, pointer.y);
      c.pointerMove(pointer, hit.head, dt);
      renderer.canvas.style.cursor = c.dragging
        ? "grabbing"
        : hit.hit
          ? "grab"
          : "default";
    }
    c.update(dt);
    renderer.render(c, dt);
    if (
      import.meta.env.DEV &&
      (window as unknown as { __SCULPY_TEST__?: { ready: boolean } })
        .__SCULPY_TEST__
    )
      (
        window as unknown as { __SCULPY_TEST__: { ready: boolean } }
      ).__SCULPY_TEST__.ready = true;
    if (now > bubbleUntil) bubble.classList.remove("visible");
    if (!desktop) {
      bubble.style.left = c.body.x + "px";
      bubble.style.top = c.body.y - c.settings.size - 35 + "px";
      document.querySelector("#mood")!.textContent = moods[c.emotion];
      document.querySelector("#motion")!.textContent = c.motion;
    }
    if (desktop && now - lastNative > 32 && !pending) {
      lastNative = now;
      try {
        if (now - lastMask > 250) {
          mask = packMask(renderer.mask());
          lastMask = now;
        }
      } catch (error) {
        console.error(error);
        recover();
        return;
      }
      pending = true;
      const timeout = setTimeout(() => {
        pending = false;
        recover();
      }, 2000);
      void call("sync_pet", {
        x: c.body.x,
        y: c.body.y,
        dragging: c.dragging,
        mask,
      })
        .catch((error) => {
          console.error(error);
          recover();
        })
        .finally(() => {
          clearTimeout(timeout);
          pending = false;
        });
      mask = null;
    }
  }
  requestAnimationFrame(frame);
  window.addEventListener("beforeunload", () => {
    unlisten?.();
    renderer.dispose();
  });
  if (import.meta.env.DEV)
    Object.assign(window, {
      __SCULPY_TEST__: { companion: c, renderer, ready: false },
    });
}
start().catch((error) => {
  console.error(error);
  document.querySelector("#app")!.innerHTML =
    '<main class="fatal"><h1>SCULPY 暂时没有醒来</h1><p></p><button id="retry">重新尝试</button></main>';
  document.querySelector(".fatal p")!.textContent = String(error);
  document
    .querySelector("#retry")!
    .addEventListener("click", () => location.reload());
});
