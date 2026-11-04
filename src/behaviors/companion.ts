import {
  clamp,
  integrate,
  nearestArea,
  safePosition,
  type Area,
  type Body,
  type Point,
} from "../physics/world";
import { StrokeDetector } from "../interactions/strokes";
import { defaults, type Settings } from "../settings/schema";
export type Motion =
  | "Idle"
  | "Look"
  | "HeadTilt"
  | "Walk"
  | "Jump"
  | "Sit"
  | "Sleep"
  | "WakeUp"
  | "Stretch"
  | "Fall"
  | "GetUp"
  | "Happy"
  | "Angry"
  | "Surprised"
  | "Held";
export type Emotion =
  "Normal" | "Happy" | "Angry" | "Curious" | "Sleepy" | "Surprised";
export class Companion {
  body: Body = { x: 600, y: 700, vx: 0, vy: 0, grounded: true };
  areas: Area[] = [];
  settings: Settings = { ...defaults };
  motion: Motion = "Idle";
  emotion: Emotion = "Normal";
  motionAge = 0;
  clock = 0;
  idle = 0;
  petting = false;
  tilt = 0;
  pointer: Point = { x: 0, y: 0 };
  private down: Point | null = null;
  private offset: Point = { x: 0, y: 0 };
  dragging = false;
  private lastPointer: Point = { x: 0, y: 0 };
  private clicks: number[] = [];
  private strokes = new StrokeDetector();
  private petted = 0;
  private nextBehavior = 12;
  private until = 0;
  private moodUntil = 0;
  private cooldowns = new Map<string, number>();
  private shaken = false;
  private landing = false;
  private wasNear = false;
  onEvent: (message: string) => void = () => {};
  constructor(private random: () => number = Math.random) {}
  get scale() {
    return this.areas.length ? nearestArea(this.body, this.areas).scale : 1;
  }
  get size() {
    return this.settings.size * this.scale;
  }
  setDisplays(areas: Area[]) {
    if (!areas.length) return;
    this.areas = areas;
    const area = nearestArea(this.body, areas);
    Object.assign(
      this.body,
      safePosition(this.body, area, this.settings.size * area.scale),
    );
  }
  reset() {
    if (!this.areas.length) return;
    const a = this.areas[0];
    Object.assign(this.body, {
      x: a.x + a.width * 0.72,
      y: a.y + a.height,
      vx: 0,
      vy: 0,
      grounded: true,
    });
    this.dragging = false;
    this.down = null;
    this.setMotion("Idle");
    this.emotion = "Normal";
    this.idle = 0;
  }
  setMotion(m: Motion, duration = 0) {
    if (this.motion !== m) {
      this.motion = m;
      this.motionAge = 0;
    }
    this.until = this.clock + duration;
  }
  private mood(e: Emotion, seconds = 5) {
    this.emotion = e;
    this.moodUntil = this.clock + seconds;
  }
  private ready(event: string, seconds: number) {
    if ((this.cooldowns.get(event) ?? 0) > this.clock) return false;
    this.cooldowns.set(event, this.clock + seconds);
    return true;
  }
  pointerDown(p: Point, hit: boolean) {
    if (!hit || this.settings.paused) return;
    this.pointer = { ...p };
    this.lastPointer = { ...p };
    this.down = { ...p };
    this.offset = { x: this.body.x - p.x, y: this.body.y - p.y };
    this.idle = 0;
    this.strokes.reset();
  }
  pointerMove(p: Point, head: boolean, dt: number) {
    this.pointer = { ...p };
    if (this.settings.paused) {
      this.lastPointer = { ...p };
      return;
    }
    if (
      this.down &&
      !this.dragging &&
      Math.hypot(p.x - this.down.x, p.y - this.down.y) > 7 * this.scale
    ) {
      this.dragging = true;
      this.shaken = false;
      this.setMotion("Held");
      this.body.grounded = false;
      this.onEvent("轻轻抓住啦");
    }
    if (this.dragging) {
      const d = Math.max(dt, 1 / 120),
        vx = (p.x - this.lastPointer.x) / d,
        vy = (p.y - this.lastPointer.y) / d;
      const a = nearestArea(p, this.areas);
      const target = safePosition(
        { x: p.x + this.offset.x, y: p.y + this.offset.y },
        a,
        this.settings.size * a.scale,
      );
      this.body.x = target.x;
      this.body.y = target.y;
      this.body.vx = clamp(vx, -1800 * a.scale, 1800 * a.scale);
      this.body.vy = clamp(vy, -1800 * a.scale, 1800 * a.scale);
      this.tilt = clamp(-vx / (4000 * a.scale), -0.55, 0.55);
      if (Math.hypot(vx, vy) > 1400 * a.scale && this.ready("shake", 7)) {
        this.shaken = true;
        this.mood("Angry");
        this.onEvent("慢一点，我要晕啦");
      }
      this.idle = 0;
    } else {
      this.petting = this.strokes.sample(p, head, dt, this.size);
      if (this.petting) {
        this.idle = 0;
        this.petted += dt;
        this.mood("Happy");
        if (!["Happy", "WakeUp", "Fall", "GetUp"].includes(this.motion))
          this.setMotion("HeadTilt", 0.7);
        if (this.petted > 2.2 && this.ready("spin", 15)) {
          this.setMotion("Happy", 1.8);
          this.onEvent("喜欢这样摸摸");
          this.petted = 0;
        }
      } else this.petted = Math.max(0, this.petted - dt * 0.5);
      const near =
        Math.hypot(p.x - this.body.x, p.y - (this.body.y - this.size * 0.65)) <
        this.size * 0.9;
      const speed =
        Math.hypot(p.x - this.lastPointer.x, p.y - this.lastPointer.y) /
        Math.max(dt, 0.008);
      if (
        near &&
        !this.wasNear &&
        speed > 1100 * this.scale &&
        this.idle > 8 &&
        this.random() < 0.25 &&
        this.ready("startle", 25)
      ) {
        this.mood("Surprised");
        this.setMotion("Surprised", 0.75);
        this.onEvent("吓我一跳");
      }
      this.wasNear = near;
    }
    this.lastPointer = { ...p };
  }
  pointerUp() {
    if (!this.down) return;
    const dragged = this.dragging;
    this.down = null;
    this.dragging = false;
    if (dragged) {
      this.landing = true;
      this.setMotion(this.shaken ? "Angry" : "Jump", 0.8);
      this.onEvent(this.shaken ? "我先缓一缓" : "要落地啦");
      return;
    }
    if (this.motion === "Sleep" || this.motion === "Sit") {
      this.mood("Surprised");
      this.setMotion("WakeUp", 1);
      this.onEvent("醒啦，怎么啦");
      return;
    }
    this.clicks = this.clicks.filter((t) => this.clock - t < 2.5);
    this.clicks.push(this.clock);
    if (this.clicks.length >= 5) {
      if (this.ready("angry", 6)) {
        this.mood("Angry");
        this.setMotion("Angry", 1.25);
        this.body.vx =
          (this.pointer.x < this.body.x ? 1 : -1) * 65 * this.scale;
        this.onEvent("别戳啦");
      }
    } else {
      this.mood("Curious", 3);
      this.setMotion(this.random() < 0.5 ? "HeadTilt" : "Look", 1.2);
      this.onEvent("嗯？");
    }
  }
  cancelPointer() {
    this.pointerUp();
    this.strokes.reset();
    this.petting = false;
  }
  act(m: Motion, interaction = true) {
    if (this.dragging || this.settings.paused) return;
    if (interaction) this.idle = 0;
    const durations: Partial<Record<Motion, number>> = {
      Jump: 0.8,
      Happy: 1.8,
      Angry: 1.25,
      Stretch: 1.7,
      Surprised: 0.75,
      WakeUp: 1,
    };
    if (m === "Jump" && this.body.grounded) {
      this.body.vy = -570 * this.scale;
      this.body.grounded = false;
    }
    if (m === "Walk") {
      this.body.vx = (this.random() < 0.5 ? -1 : 1) * 48 * this.scale;
      this.setMotion(m, 2);
      return;
    }
    if (m === "Happy") this.mood("Happy");
    if (m === "Angry") this.mood("Angry");
    if (m === "Sleep") this.mood("Sleepy", 1e6);
    this.setMotion(m, durations[m] ?? (m === "Sleep" ? 1e6 : 1));
  }
  update(dt: number) {
    if (this.settings.paused || !this.areas.length) return;
    dt = clamp(dt, 0, 1 / 30);
    this.clock += dt;
    this.motionAge += dt;
    this.idle += dt;
    if (this.emotion !== "Normal" && this.clock > this.moodUntil)
      this.emotion = "Normal";
    if (!this.dragging) {
      const area = nearestArea(this.body, this.areas);
      if (this.motion === "Walk")
        this.body.vx = (Math.sign(this.body.vx) || 1) * 48 * area.scale;
      const impact = integrate(this.body, dt, area, this.size);
      if (impact && this.landing && impact.speed > 720 * area.scale) {
        this.setMotion("Fall", 0.65);
        this.landing = false;
        this.body.vx = 0;
        this.body.vy = 0;
        this.body.grounded = true;
        this.onEvent("哎呀，摔了一跤");
      }
      if (this.body.grounded) this.landing = false;
      this.tilt *= Math.exp(-6 * dt);
    }
    if (this.until && this.clock >= this.until) {
      if (this.motion === "Fall") this.setMotion("GetUp", 1.1);
      else if (this.motion !== "Sleep" && this.motion !== "Held") {
        if (this.motion === "Walk") this.body.vx = 0;
        this.setMotion("Idle");
      }
    }
    if (
      this.dragging ||
      !this.body.grounded ||
      this.motion !== "Idle" ||
      this.petting
    )
      return;
    if (this.idle > 180) {
      this.mood("Sleepy", 1e6);
      this.setMotion("Sleep", 1e6);
      return;
    }
    if (this.idle > 70 && this.ready("greet", 140)) {
      this.act("Stretch", false);
      this.onEvent("我还在这里哦");
      return;
    }
    if (this.clock > this.nextBehavior) {
      const frequency = this.settings.activity;
      this.nextBehavior =
        this.clock + 12 + (1 - frequency) * 40 + this.random() * 14;
      if (frequency === 0 || this.random() > frequency) return;
      const choice = this.random();
      if (choice < 0.25) this.act("Look", false);
      else if (choice < 0.5) this.act("HeadTilt", false);
      else if (choice < 0.68) this.act("Stretch", false);
      else if (choice < 0.85) this.act("Walk", false);
      else if (this.emotion === "Curious") {
        this.body.vx =
          Math.sign(this.pointer.x - this.body.x) * 30 * this.scale;
        this.setMotion("Walk", 1.5);
      } else this.act("Sit", false);
    }
  }
}
