"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { css } from "@/styled-system/css";
import type { ReviveZone } from "./zones";

const box = css({ position: "relative", width: "100%", mx: "auto", overflow: "hidden" });
const frame = css({ position: "absolute", top: 0, left: 0, transformOrigin: "top left" });

export default function ReviveAdSlot({ zone }: { zone: ReviveZone }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / zone.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [zone.width]);

  return (
    <div ref={ref} className={box} style={{ maxWidth: `${zone.width}px`, aspectRatio: `${zone.width} / ${zone.height}` }}>
      <div className={frame} style={{ width: zone.width, height: zone.height, transform: `scale(${scale})` }}>
        <ins
          data-revive-zoneid={zone.zoneId}
          data-revive-id={zone.id}
          aria-label={zone.title}
          style={{ display: "block", width: zone.width, height: zone.height }}
        />
      </div>
      <Script id="revive-async-js" async src="//ads.ams.com.kh/www/delivery/asyncjs.php" strategy="afterInteractive" />
    </div>
  );
}
