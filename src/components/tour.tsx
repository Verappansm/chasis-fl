"use client";

import { createContext, use, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import type { TourStep } from "@/lib/tour-steps";
import { markTourDone } from "@/app/(app)/tour-actions";

/* ------------------------------------------------------------- context */

interface TourApi {
  start: () => void;
  ready: boolean;
}
const TourContext = createContext<TourApi>({ start: () => {}, ready: false });
export const useTour = () => use(TourContext);

const STORAGE_KEY = "chasis-tour-step";
const PAD = 6;
const CARD_W = 344;
const GAP = 14;

function readStoredStep(): number | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}
function storeStep(i: number | null) {
  try {
    if (i === null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, String(i));
  } catch {
    /* storage unavailable: tour just restarts from the beginning on reload */
  }
}

/**
 * Wraps the signed-in app. Steps arrive later from <TourConfig> (rendered
 * inside a Suspense boundary, since they depend on the user).
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const configured = useRef(false);

  const configure = useCallback((s: TourStep[], autoStart: boolean) => {
    setSteps(s);
    if (configured.current) return;
    configured.current = true;
    const stored = readStoredStep();
    if (stored !== null && stored >= 0 && stored < s.length) setIndex(stored);
    else if (autoStart) setIndex(0);
  }, []);

  const finish = useCallback(() => {
    setIndex(null);
    storeStep(null);
    void markTourDone();
  }, []);

  const indexRef = useRef<number | null>(null);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const go = useCallback((i: number) => {
    setDirection(indexRef.current !== null && i < indexRef.current ? -1 : 1);
    setIndex(i);
    storeStep(i);
  }, []);

  return (
    <TourContext value={{ start: () => go(0), ready: steps.length > 0 }}>
      <ConfigContext value={configure}>{children}</ConfigContext>
      {index !== null && steps[index] && (
        <TourOverlay key={index} steps={steps} index={index} direction={direction} onGo={go} onFinish={finish} />
      )}
    </TourContext>
  );
}

const ConfigContext = createContext<(steps: TourStep[], autoStart: boolean) => void>(() => {});

/** Rendered by the server with the steps this user may see. */
export function TourConfig({ steps, autoStart }: { steps: TourStep[]; autoStart: boolean }) {
  const configure = use(ConfigContext);
  useEffect(() => configure(steps, autoStart), [configure, steps, autoStart]);
  return null;
}

export function TourLauncher() {
  const { start, ready } = useTour();
  return (
    <button
      type="button"
      data-tour="tour-launcher"
      onClick={start}
      disabled={!ready}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" />
      </svg>
      Take the tour
    </button>
  );
}

/* ------------------------------------------------------------- overlay */

type Rect = { top: number; left: number; width: number; height: number };

/** First matching element that is actually rendered (responsive layouts duplicate some). */
function findTarget(target: string | undefined): HTMLElement | null {
  if (!target) return null;
  for (const node of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
    if (node.getClientRects().length > 0) return node;
  }
  return null;
}

/** Elements taller than this share of the viewport are "large" (e.g. long tables). */
const LARGE = 0.6;

const isPhone = () => window.innerWidth < 640;
/** On phones the card is a bottom sheet; this is the share of the screen it may take. */
const SHEET = 0.46;

/** Large elements: show their top (toolbar, headings, first rows) rather than their middle. */
function revealTarget(node: HTMLElement) {
  const r = node.getBoundingClientRect();
  if (isPhone() && !node.closest("nav")) {
    // Keep the element in the upper part of the screen, above the bottom sheet.
    window.scrollTo({ top: window.scrollY + r.top - 72, behavior: "smooth" });
  } else if (r.height > window.innerHeight * LARGE) {
    window.scrollTo({ top: window.scrollY + r.top - 80, behavior: "smooth" });
  } else {
    node.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }
}

/** Spotlight rect; large elements are capped so the explanation card fits beneath them. */
function spotlightRect(node: HTMLElement): Rect {
  const r = node.getBoundingClientRect();
  const vh = window.innerHeight;
  let height = r.height > vh * LARGE ? Math.max(240, vh * 0.42) : r.height;
  if (isPhone()) {
    // Element stuck in the lower half (end of a short page): the card goes on top instead.
    height = r.top > vh / 2
      ? Math.min(height, vh - r.top - 16)
      : Math.min(height, Math.max(120, vh * (1 - SHEET) - Math.max(r.top, 0) - 24));
  }
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: height + PAD * 2 };
}

function sameRect(a: Rect | null, b: Rect | null) {
  return !!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/** Remounted per step (key = index), so every step starts with fresh state. */
function TourOverlay({
  steps,
  index,
  direction,
  onGo,
  onFinish,
}: {
  steps: TourStep[];
  index: number;
  /** +1 when moving forward, -1 when going back; used to skip missing steps. */
  direction: 1 | -1;
  onGo: (i: number) => void;
  onFinish: () => void;
}) {
  const step = steps[index];
  const router = useRouter();
  const pathname = usePathname();
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [searching, setSearching] = useState(Boolean(step.target));
  const cardRef = useRef<HTMLDivElement>(null);
  const isLast = index === steps.length - 1;

  const next = useCallback(() => {
    if (isLast) onFinish();
    else onGo(index + 1);
  }, [index, isLast, onFinish, onGo]);
  const back = useCallback(() => {
    if (index > 0) onGo(index - 1);
  }, [index, onGo]);

  // 1. Go to the step's page, then wait for its element (pages stream in).
  useEffect(() => {
    if (step.route && pathname !== step.route) {
      router.push(step.route);
      return;
    }
    if (!step.target) return;
    let cancelled = false;
    const startedAt = Date.now();
    const find = () => {
      if (cancelled) return;
      const found = findTarget(step.target);
      if (found) {
        revealTarget(found);
        setEl(found);
        setSearching(false);
        return;
      }
      if (Date.now() - startedAt > 8000) {
        setSearching(false);
        // Missing optional element (e.g. nothing expiring): move on in the direction of travel.
        const target = index + direction;
        if (target >= 0 && target < steps.length) onGo(target);
        else onFinish();
        return;
      }
      window.setTimeout(find, 120);
    };
    const timer = window.setTimeout(find, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [step, pathname, router, index, direction, steps.length, onGo, onFinish]);

  // 2. Track the element's position every frame (scrolling, resizing, streaming).
  useEffect(() => {
    if (!el) return;
    let frame = 0;
    let last: Rect | null = null;
    const tick = () => {
      const node = el.isConnected ? el : findTarget(step.target);
      if (node) {
        const nextRect = spotlightRect(node);
        if (!sameRect(last, nextRect)) {
          last = nextRect;
          setRect(nextRect);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [el, step.target]);

  // 3. Click-to-continue: the real element (e.g. a sidebar tab) advances the tour.
  useEffect(() => {
    if (!el || !step.clickToContinue) return;
    const onClick = () => next();
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [el, step.clickToContinue, next]);

  // 4. Keyboard + focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFinish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, onFinish]);

  const hasRect = rect !== null;
  useLayoutEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [searching, hasRect]);

  if (typeof document === "undefined") return null;
  const centred = !step.target || (!searching && !rect);

  return createPortal(
    // The container itself lets clicks through; only the shields and the card catch them,
    // so the spotlighted element stays clickable on click-to-continue steps.
    <div className="pointer-events-none fixed inset-0 z-[100]" aria-live="polite">
      {centred || !rect ? (
        <div className="pointer-events-auto absolute inset-0 bg-slate-950/60 motion-safe:transition-opacity" />
      ) : (
        <>
          {/* Spotlight: a transparent hole with a huge shadow dimming everything else. */}
          <div
            data-tour-spot
            className={`tour-spot pointer-events-none absolute rounded-xl motion-safe:transition-all motion-safe:duration-300 ${
              step.clickToContinue ? "tour-spot-pulse" : ""
            }`}
            style={rect}
          />
          {/* Click shields around the hole (and over it unless the step is click-to-continue). */}
          <Shields rect={rect} blockHole={!step.clickToContinue} />
        </>
      )}

      {!searching && (
        <Card
          ref={cardRef}
          step={step}
          index={index}
          total={steps.length}
          rect={centred ? null : rect}
          onNext={next}
          onBack={back}
          onSkip={onFinish}
        />
      )}
    </div>,
    document.body,
  );
}

function Shields({ rect, blockHole }: { rect: Rect; blockHole: boolean }) {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const base = "pointer-events-auto absolute";
  return (
    <>
      <div className={base} style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top) }} />
      <div className={base} style={{ top: bottom, left: 0, right: 0, bottom: 0 }} />
      <div className={base} style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }} />
      <div className={base} style={{ top: rect.top, left: right, right: 0, height: rect.height }} />
      {blockHole && <div className={base} style={rect} />}
    </>
  );
}

/** Places the card beside the highlight: right, below, above, then left; on phones, a bottom sheet. */
function placeCard(rect: Rect | null, cardH: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(CARD_W, vw - 32);
  if (!rect) return { top: Math.max(16, (vh - cardH) / 2), left: (vw - w) / 2, width: w };
  if (vw < 640) return { top: rect.top > vh / 2 ? 16 : Math.max(16, vh - cardH - 16), left: 16, width: vw - 32 };

  const clampTop = (t: number) => Math.min(Math.max(16, t), vh - cardH - 16);
  const clampLeft = (l: number) => Math.min(Math.max(16, l), vw - w - 16);
  if (rect.left + rect.width + GAP + w <= vw - 16) return { top: clampTop(rect.top), left: rect.left + rect.width + GAP, width: w };
  if (rect.top + rect.height + GAP + cardH <= vh - 16) return { top: rect.top + rect.height + GAP, left: clampLeft(rect.left), width: w };
  if (rect.top - GAP - cardH >= 16) return { top: rect.top - GAP - cardH, left: clampLeft(rect.left), width: w };
  if (rect.left - GAP - w >= 16) return { top: clampTop(rect.top), left: rect.left - GAP - w, width: w };
  return { top: vh - cardH - 16, left: clampLeft(rect.left), width: w };
}

function Card({
  ref,
  step,
  index,
  total,
  rect,
  onNext,
  onBack,
  onSkip,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  step: TourStep;
  index: number;
  total: number;
  rect: Rect | null;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [height, setHeight] = useState(220);
  useLayoutEffect(() => {
    if (ref.current) setHeight(ref.current.offsetHeight);
  }, [ref, step.id]);
  const pos = placeCard(rect, height);
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const welcome = isFirst && !step.target;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
      tabIndex={-1}
      className="pointer-events-auto absolute rounded-2xl bg-white p-5 shadow-2xl outline-none ring-1 ring-slate-900/5 motion-safe:transition-[top,left] motion-safe:duration-300"
      style={pos}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-indigo-600">
          {welcome ? "Quick tour" : `Step ${index + 1} of ${total}`}
        </span>
        {!isLast && (
          <button type="button" onClick={onSkip} className="rounded-md px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            Skip tour
          </button>
        )}
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className="h-full rounded-full bg-indigo-500 motion-safe:transition-all motion-safe:duration-300" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>
      <h2 id="tour-title" className="mt-4 text-base font-semibold text-slate-900">
        {step.title}
      </h2>
      <p id="tour-body" className="mt-1.5 text-sm leading-relaxed text-slate-600">
        {step.body}
      </p>
      {step.clickToContinue && (
        <p className="mt-3 flex items-center gap-2 text-xs font-medium text-indigo-700">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-indigo-500" />
          </span>
          Click the highlighted item, or press Next
        </p>
      )}
      <div className="mt-5 flex items-center justify-between gap-2">
        {welcome ? (
          <button type="button" onClick={onSkip} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
            Maybe later
          </button>
        ) : (
          <button
            type="button"
            onClick={onBack}
            disabled={isFirst}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:invisible"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          {welcome ? "Start the tour" : isLast ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );
}
