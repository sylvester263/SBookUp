// Thin light-teal strip with centred text. Messages, link, interval and
// visibility come from admin Settings; several messages rotate (paused on hover
// or keyboard focus). The first message is server-rendered.
import { useEffect, useState } from "react";
import { useSiteSettings } from "@/lib/site-settings";

export function AnnouncementBar() {
  const s = useSiteSettings();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const list = s.announcements;

  useEffect(() => {
    if (list.length < 2 || paused) return;
    const t = setInterval(() => setI((n) => (n + 1) % list.length), s.announcementInterval * 1000);
    return () => clearInterval(t);
  }, [list.length, paused, s.announcementInterval]);

  if (!s.announcementEnabled || !list.length) return null;
  const msg = list[i % list.length];
  const text = (
    <span
      key={i}
      className={`block truncate ${list.length > 1 ? "animate-in fade-in duration-500" : ""}`}
    >
      {msg.text}
    </span>
  );

  return (
    <div
      className="bg-store-soft text-store-soft-foreground"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="container mx-auto flex h-8 items-center justify-center px-4 text-center text-xs font-medium md:h-9 md:text-sm">
        {msg.href ? (
          <a href={msg.href} className="max-w-full hover:underline">
            {text}
          </a>
        ) : (
          text
        )}
      </div>
    </div>
  );
}
