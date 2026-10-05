"use client";

import {
  MAX_SCENE_DURATION_MS,
  MIN_SCENE_DURATION_MS,
  TRANSITION_KINDS,
  addScene,
  removeScene,
  renameScene,
  reorderScene,
  setSceneDuration,
  setSceneTransition,
  type DesignDoc,
  type TransitionKind,
} from "../../lib/studio/ops";

interface Props {
  design: DesignDoc;
  activeScene: number;
  onChange: (next: DesignDoc) => void;
  onSelectScene: (sceneIndex: number) => void;
}

const TRANSITION_LABEL: Record<TransitionKind, string> = {
  none: "Cut (none)",
  fade: "Crossfade",
  "slide-left": "Slide left",
  zoom: "Zoom",
};

const mini =
  "inline-flex h-7 w-7 items-center justify-center rounded-sm border border-walshe-line bg-walshe-stone/60 text-walshe-ink transition-colors hover:bg-walshe-ink/10 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * The storyboard "Scene" panel (AC46): the ordered scene list (select / add / remove / reorder) and
 * the active scene's lifespan + transition. Every mutation goes through the pure ops, so the design
 * model stays the single source of truth.
 */
export default function SceneControls({ design, activeScene, onChange, onSelectScene }: Props) {
  const scenes = design.scenes;
  const active = scenes[activeScene];

  function add() {
    onChange(addScene(design));
    onSelectScene(scenes.length); // the newly appended scene
  }

  function remove(i: number) {
    if (scenes.length <= 1) return;
    onChange(removeScene(design, i));
    onSelectScene(Math.max(0, Math.min(i, scenes.length - 2)));
  }

  function move(i: number, delta: number) {
    const to = i + delta;
    if (to < 0 || to >= scenes.length) return;
    onChange(reorderScene(design, i, to));
    onSelectScene(to);
  }

  return (
    <div className="flex flex-col gap-4" aria-label="Scenes">
      <div className="flex items-center justify-between">
        <p className="text-small text-walshe-grey">
          {scenes.length} scene{scenes.length === 1 ? "" : "s"} · stitched in order → video
        </p>
        <button type="button" className="btn-secondary px-3 py-1.5 text-small" onClick={add}>
          + Add scene
        </button>
      </div>

      <ol className="flex flex-col gap-2" aria-label="Scene list">
        {scenes.map((s, i) => {
          const isActive = i === activeScene;
          return (
            <li key={s.id}>
              <div
                className={`flex items-center gap-2 rounded-sm border px-2.5 py-2 ${
                  isActive
                    ? "border-walshe-teal bg-walshe-mint/40"
                    : "border-walshe-line bg-walshe-stone/40"
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-pressed={isActive}
                  onClick={() => onSelectScene(i)}
                >
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-sm bg-walshe-teal text-[12px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="min-w-0 truncate text-small font-semibold text-walshe-ink">{s.name}</span>
                  <span className="flex-none text-[12px] text-walshe-grey">
                    {(s.durationMs / 1000).toFixed(1)}s
                  </span>
                </button>
                <button
                  type="button"
                  className={mini}
                  aria-label={`Move ${s.name} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={mini}
                  aria-label={`Move ${s.name} down`}
                  disabled={i === scenes.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={mini}
                  aria-label={`Remove ${s.name}`}
                  disabled={scenes.length <= 1}
                  onClick={() => remove(i)}
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {active && (
        <div className="flex flex-col gap-3 rounded-sm border border-walshe-line bg-walshe-stone/30 p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-walshe-grey">
            {active.name} settings
          </p>

          <label className="flex flex-col gap-1 text-small font-medium text-walshe-ink">
            <span>Name</span>
            <input
              type="text"
              value={active.name}
              aria-label="Scene name"
              onChange={(e) => onChange(renameScene(design, active.id, e.target.value))}
              className="h-9 rounded-sm border border-walshe-line bg-walshe-stone/60 px-2 text-small text-walshe-ink focus:border-walshe-mint"
            />
          </label>

          <label className="flex flex-col gap-1 text-small font-medium text-walshe-ink">
            <span className="flex items-center justify-between">
              <span>Duration</span>
              <span className="text-walshe-grey">{(active.durationMs / 1000).toFixed(1)}s</span>
            </span>
            <input
              type="range"
              min={MIN_SCENE_DURATION_MS}
              max={MAX_SCENE_DURATION_MS}
              step={500}
              value={active.durationMs}
              aria-label="Scene duration (ms)"
              onChange={(e) => onChange(setSceneDuration(design, active.id, Number(e.target.value)))}
              className="accent-walshe-teal"
            />
          </label>

          <label className="flex flex-col gap-1 text-small font-medium text-walshe-ink">
            <span>Transition to next scene</span>
            <select
              aria-label="Scene transition"
              value={active.transition}
              onChange={(e) =>
                onChange(setSceneTransition(design, active.id, e.target.value as TransitionKind))
              }
              className="h-9 rounded-sm border border-walshe-line bg-walshe-stone/60 px-2 text-small text-walshe-ink focus:border-walshe-mint"
            >
              {TRANSITION_KINDS.map((t) => (
                <option key={t} value={t}>
                  {TRANSITION_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
