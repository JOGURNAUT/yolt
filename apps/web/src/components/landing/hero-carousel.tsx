"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cx, ICON_STROKE } from "@/components/ui/cx";

export type HeroSlideDef = {
  key: string;
  /** Names the slide for screen readers ("Winter Vintage Drop"). */
  label: string;
  /** Dark slides get white controls, light ones ink. */
  tone: "dark" | "light";
  node: React.ReactNode;
};

export const HERO_AUTOPLAY_MS = 6000;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const reducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;

/**
 * HeroCarousel (board C3, B2.1). Autoplays every 6 s with story-style segments on phones and dots
 * with arrows on desktop. It pauses while a mouse hovers, a finger touches or the keyboard is
 * inside, and never starts by itself under reduced motion. The pause/play button is always
 * visible. Progress is driven from one animation frame loop so pausing freezes it exactly.
 */
export function HeroCarousel({ slides, className }: { slides: HeroSlideDef[]; className?: string }) {
  const n = slides.length;
  const [idx, setIdx] = useState(0);
  const [userPlay, setUserPlay] = useState<boolean | null>(null);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const rm = useSyncExternalStore(subscribeMotion, reducedMotion, () => false);

  const autoplay = n > 1 && (userPlay ?? !rm);
  const paused = !autoplay || hover || focused || touching;

  const segs = useRef<(HTMLElement | null)[]>([]);
  const bar = useRef<HTMLElement | null>(null);
  const elapsed = useRef(0);
  const swipeStart = useRef<number | null>(null);

  const go = useCallback(
    (i: number) => {
      elapsed.current = 0;
      setIdx(((i % n) + n) % n);
    },
    [n],
  );

  // Segments before the current one are full, after it empty; the current one is full under reduced motion.
  useEffect(() => {
    segs.current.forEach((el, j) => {
      if (el) el.style.width = j < idx || (j === idx && rm) ? "100%" : "0%";
    });
    if (bar.current) bar.current.style.width = "0%";
  }, [idx, rm, n]);

  useEffect(() => {
    if (paused) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += now - last;
      last = now;
      const p = Math.min(1, elapsed.current / HERO_AUTOPLAY_MS);
      if (!rm) {
        const w = `${p * 100}%`;
        const seg = segs.current[idx];
        if (seg) seg.style.width = w;
        if (bar.current) bar.current.style.width = w;
      }
      if (p >= 1) return go(idx + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, idx, rm, go]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") go(idx + 1);
    else if (e.key === "ArrowLeft") go(idx - 1);
  }

  const ink = slides[idx]?.tone === "light";
  const toggle = () => setUserPlay(!autoplay);
  const PauseIcon = autoplay ? Pause : Play;
  const toggleLabel = autoplay ? "Pause slideshow" : "Play slideshow";

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      tabIndex={0}
      className={cx("hero-sq relative touch-pan-y outline-offset-[3px]", className)}
      onKeyDown={onKeyDown}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHover(false)}
      onFocus={(e) => e.target.matches(":focus-visible") && setFocused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocused(false)}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        swipeStart.current = e.clientX;
        setTouching(true);
      }}
      onPointerUp={(e) => {
        setTouching(false);
        if (swipeStart.current === null) return;
        const dx = e.clientX - swipeStart.current;
        swipeStart.current = null;
        if (dx < -40) go(idx + 1);
        else if (dx > 40) go(idx - 1);
      }}
      onPointerCancel={() => {
        swipeStart.current = null;
        setTouching(false);
      }}
    >
      <div className="hero-stack h-full">
        {slides.map((s, i) => (
          <div
            key={s.key}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${n}: ${s.label}`}
            aria-hidden={i === idx ? undefined : true}
            inert={i === idx ? undefined : true}
            className={cx("layer", i === idx ? "is-on" : "is-off")}
          >
            {s.node}
          </div>
        ))}
      </div>

      {n > 1 && (
        <>
          {/* Phones: story segments at the top, pause at the top right. */}
          <div className={cx("progress-seg hero-seg absolute left-3.5 right-[58px] top-[-6px] z-[3] lg:hidden", ink && "ink")}>
            {slides.map((s, i) => (
              <button
                key={s.key}
                type="button"
                aria-label={`Go to slide ${i + 1}: ${s.label}`}
                aria-current={i === idx ? "true" : undefined}
                onClick={() => go(i)}
                className="hero-ctl flex h-11 items-center bg-transparent p-0"
              >
                <span className={cx("block w-full", i < idx && "done")}>
                  <i ref={(el) => void (segs.current[i] = el)} style={{ width: 0 }} />
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label={toggleLabel}
            onClick={toggle}
            className={cx(
              "hero-ctl absolute right-1.5 top-0.5 z-[3] flex h-11 w-11 items-center justify-center rounded-none lg:hidden",
              ink ? "text-[#0D0D0C]" : "text-white",
              !autoplay && "ring-2 ring-accent",
            )}
          >
            <PauseIcon aria-hidden className="ic ic-16" fill="currentColor" stroke="none" />
          </button>

          {/* Desktop: prev, dots, next and pause in a pill; a thin progress bar along the bottom. */}
          <div className="absolute bottom-3.5 right-3.5 z-[3] hidden items-center gap-1.5 rounded-none bg-white px-1.5 py-1 text-[#0D0D0C] shadow-raised lg:flex">
            <button type="button" aria-label="Previous slide" onClick={() => go(idx - 1)} className="iconbtn is-plain hero-ctl !h-11 !w-11 text-[#0D0D0C]">
              <ChevronLeft aria-hidden className="ic" strokeWidth={ICON_STROKE} />
            </button>
            <div className="dots" role="group" aria-label="Choose slide">
              {slides.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  aria-label={`Slide ${i + 1}: ${s.label}`}
                  aria-current={i === idx ? "true" : undefined}
                  onClick={() => go(i)}
                  className={cx("hero-ctl", i === idx && "is-on")}
                >
                  <span style={{ background: i === idx ? "#0D0D0C" : "#C9C7BF" }} />
                </button>
              ))}
            </div>
            <button type="button" aria-label="Next slide" onClick={() => go(idx + 1)} className="iconbtn is-plain hero-ctl !h-11 !w-11 text-[#0D0D0C]">
              <ChevronRight aria-hidden className="ic" strokeWidth={ICON_STROKE} />
            </button>
            <button type="button" aria-label={toggleLabel} onClick={toggle} className={cx("iconbtn is-plain hero-ctl !h-11 !w-11 text-[#0D0D0C]", !autoplay && "ring-2 ring-accent")}>
              <PauseIcon aria-hidden className="ic ic-16" fill="currentColor" stroke="none" />
            </button>
          </div>
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 z-[3] hidden h-[3px] overflow-hidden lg:block">
            <i ref={(el) => void (bar.current = el)} className="block h-[3px] bg-accent" style={{ width: 0 }} />
          </span>
        </>
      )}

      <p className="sr-only" aria-live="polite">
        {paused ? `Slide ${idx + 1} of ${n}: ${slides[idx]?.label ?? ""}` : ""}
      </p>
    </section>
  );
}
