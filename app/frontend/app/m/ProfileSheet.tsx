"use client";

import { useEffect, useState } from "react";
import { useLang } from "../i18n";
import {
  PROFILE_KEYS,
  PROFILE_LABELS,
  loadProfile,
  saveProfile,
  selectedLabels,
  type HouseholdProfile,
} from "../profile";

export default function ProfileSheet({ compact = false }: { compact?: boolean }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<HouseholdProfile>(loadProfile);

  useEffect(() => {
    const sync = () => setProfile(loadProfile());
    window.addEventListener("bottlesafe-profile", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("bottlesafe-profile", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = (k: (typeof PROFILE_KEYS)[number]) => {
    const next = { ...profile, [k]: !profile[k] };
    setProfile(next);
    saveProfile(next);
  };

  const labels = selectedLabels(profile, lang);
  const summary = labels.length
    ? labels.join(" · ")
    : lang === "zh" ? "未设置 · 结论按普通家庭" : "Not set · generic household";

  return (
    <div className={`profile-wrap${compact ? " is-compact" : ""}`} data-tour="profile">
      <button type="button" className="profile-bar" onClick={() => setOpen(true)}>
        <span className="profile-bar-k">{lang === "zh" ? "家庭画像" : "Household"}</span>
        <span className="profile-bar-v">{summary}</span>
        <span className="profile-bar-edit">{lang === "zh" ? "修改" : "Edit"}</span>
      </button>
      {open && (
        <div className="profile-mask" onClick={() => setOpen(false)}>
          <div className="profile-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={lang === "zh" ? "家庭画像" : "Household profile"}>
            <header>
              <div>
                <h3>{lang === "zh" ? "这户人家里有谁" : "Who lives here"}</h3>
                <p>{lang === "zh" ? "存在这台手机本地，不上传、不注册。画像会改写提示文案，并驱动规则引擎（儿童/猫/孕妇）。" : "Stored on this phone only. Drives copy and the child/cat/pregnancy rules."}</p>
              </div>
              <button type="button" className="profile-x" onClick={() => setOpen(false)} aria-label="close">✕</button>
            </header>
            <div className="profile-chips">
              {PROFILE_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`profile-chip${profile[k] ? " is-on" : ""}`}
                  data-key={k}
                  onClick={() => toggle(k)}
                  aria-pressed={profile[k]}
                >
                  {PROFILE_LABELS[k][lang]}
                </button>
              ))}
            </div>
            <p className="profile-foot">{lang === "zh" ? "安全判定仍走规则库。未知一律「暂无法判断」，不是安全。" : "Safety calls still come from the rule engine. UNKNOWN ≠ safe."}</p>
            <button type="button" className="profile-done" onClick={() => setOpen(false)}>
              {lang === "zh" ? "好" : "Done"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
