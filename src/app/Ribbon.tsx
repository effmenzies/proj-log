import { useEffect, useState, type RefObject } from "react";

const steps = 384;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
export function ribbonCenterline(progress: number) {
  const amount = clamp(progress);
  // Turn the loop out of its original plane before applying tension. Unlike
  // interpolated poses, rotation preserves the separation of crossing strands.
  const rotation = Math.PI * smooth(amount / .65);
  const tension = smooth((amount - .4) / .6);
  const remaining = 1 - tension;
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const angle = t * Math.PI * 2;
    const loopY = 170 * (Math.cos(angle) - 1) * remaining;
    const loopZ = 145 * Math.sin(angle) * remaining;
    return {
      x: 1400 * t + 400 * Math.sin(angle) * remaining,
      y: 450 + 16 * Math.sin(t * Math.PI) + loopY * Math.cos(rotation) - loopZ * Math.sin(rotation),
      z: (loopY * Math.sin(rotation) + loopZ * Math.cos(rotation)) || 0,
    };
  });
}

export function ribbonGeometry(progress: number) {
  const points = ribbonCenterline(progress);
  const edges = points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(steps, index + 1)];
    const length = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
    const nx = -(next.y - previous.y) / length * 28;
    const ny = (next.x - previous.x) / length * 28;
    return {
      left: `${point.x + nx},${point.y + ny}`,
      right: `${point.x - nx},${point.y - ny}`,
    };
  });
  return points.slice(0, -1).map((point, index) => ({
    index,
    depth: (point.z + points[index + 1].z) / 2,
    // Tiny overlaps hide antialiasing cracks without outlining each section.
    polygon: `${edges[Math.max(0, index - 1)].left} ${edges[index + 1].left} ${edges[index + 1].right} ${edges[Math.max(0, index - 1)].right}`,
    edge: `${edges[index].left} ${edges[index + 1].left}`,
    shadeStart: edges[index + 1].left.split(","),
    shadeEnd: edges[index + 1].right.split(","),
  })).sort((a, b) => a.depth - b.depth);
}

export function Ribbon({ page }: { page: RefObject<HTMLElement> }) {
  const [progress, setProgress] = useState(0);
  const segments = ribbonGeometry(progress);
  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const update = () => {
      frame = 0;
      const element = page.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      const finish = element.querySelector(".landing-finish") as HTMLElement | null;
      const distance = finish
        ? finish.offsetTop - window.innerHeight * .75
        : bounds.height - window.innerHeight;
      setProgress(preference?.matches ? 1 : clamp(-bounds.top / Math.max(1, distance)));
    };
    const schedule = () => {
      if (!preference?.matches && !frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    preference?.addEventListener("change", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      preference?.removeEventListener("change", update);
    };
  }, [page]);

  return (
    <div className="landing-art" aria-hidden="true">
      <svg viewBox="0 0 1400 900" preserveAspectRatio="none" focusable="false">
        <defs>
          <filter id="rope-shadow" filterUnits="userSpaceOnUse" x="-100" y="-300" width="1600" height="1600" colorInterpolationFilters="sRGB">
            <feDropShadow dx="5" dy="14" stdDeviation="10" floodColor="#000000" floodOpacity=".65" />
          </filter>
          {segments.map((segment) => (
            <linearGradient key={segment.index} id={`rope-shade-${segment.index}`} gradientUnits="userSpaceOnUse"
              x1={segment.shadeStart[0]} y1={segment.shadeStart[1]}
              x2={segment.shadeEnd[0]} y2={segment.shadeEnd[1]}>
              <stop stopColor="#3e5947" />
              <stop offset=".25" stopColor="#bdcfb4" />
              <stop offset=".5" stopColor="#8fa98b" />
              <stop offset=".8" stopColor="#526f53" />
              <stop offset="1" stopColor="#233c2b" />
            </linearGradient>
          ))}
        </defs>
        <g filter="url(#rope-shadow)">
          {segments.map((segment) => (
            <g key={segment.index}>
              <polygon points={segment.polygon} fill={`url(#rope-shade-${segment.index})`} />
              <polygon points={segment.polygon} fill="#07140c" opacity={clamp(.12 - segment.depth / 1000)} />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
