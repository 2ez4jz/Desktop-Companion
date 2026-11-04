import * as T from "three";
import type { Motion } from "../behaviors/companion";
const loops = new Set<Motion>(["Idle", "Walk", "Sleep", "Held"]);
export class Animator {
  mixer: T.AnimationMixer;
  private actions = new Map<string, T.AnimationAction>();
  private current: T.AnimationAction | undefined;
  private currentName = "";
  private blink: T.AnimationAction | undefined;
  private blinkAt = 1;
  private time = 0;
  constructor(root: T.Object3D, clips: T.AnimationClip[]) {
    this.mixer = new T.AnimationMixer(root);
    for (const clip of clips)
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.blink = this.actions.get("Blink");
    if (this.blink) {
      this.blink.setLoop(T.LoopOnce, 1);
      this.blink.clampWhenFinished = false;
    }
  }
  play(motion: Motion) {
    if (this.currentName === motion) return;
    const next = this.actions.get(motion);
    if (!next) return;
    const previous = this.current;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    next.setLoop(
      loops.has(motion) ? T.LoopRepeat : T.LoopOnce,
      loops.has(motion) ? Infinity : 1,
    );
    next.clampWhenFinished = true;
    next.play();
    if (previous) previous.crossFadeTo(next, 0.2, false);
    this.current = next;
    this.currentName = motion;
  }
  update(dt: number, sleeping: boolean) {
    this.time += dt;
    if (!sleeping && this.time > this.blinkAt) {
      this.blink?.reset().play();
      this.blinkAt = this.time + 2 + Math.random() * 4;
    }
    this.mixer.update(dt);
  }
  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
