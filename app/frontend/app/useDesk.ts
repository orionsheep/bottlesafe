"use client";

import { useEffect, useState } from "react";

const QUERY = "(min-width: 1100px)";

/** 仅在档案页调用：宽屏时给 <html> 加上 desk，离开或变窄时摘掉。 */
export function useDesk(): boolean {
  const [desk, setDesk] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const apply = () => {
      const on = mq.matches;
      setDesk(on);
      document.documentElement.classList.toggle("desk", on);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      document.documentElement.classList.remove("desk");
    };
  }, []);

  return desk;
}
