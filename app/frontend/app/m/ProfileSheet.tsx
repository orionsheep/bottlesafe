"use client";

import { useEffect, useState } from "react";
import { useLang } from "../i18n";
import {
  PROFILE_KEYS,
  PROFILE_LABELS,
  emptyProfile,
  emptyStorage,
  loadProfile,
  loadStorage,
  saveProfile,
  saveStorage,
  selectedLabels,
  type HouseholdProfile,
  type StorageContext,
} from "../profile";

const STORAGE_OPTS: { key: keyof StorageContext; zh: string; en: string }[] = [
  { key: "child_accessible", zh: "儿童可触及", en: "Child-reachable" },
  { key: "near_food", zh: "靠近食品", en: "Near food" },
  { key: "original_container", zh: "保留原包装", en: "Original packaging" },
];

export default function ProfileSheet({ compact = false }: { compact?: boolean }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<HouseholdProfile>(emptyProfile);
  const [storage, setStorage] = useState<StorageContext>(emptyStorage);

  useEffect(() => {
    const sync = () => { setProfile(loadProfile()); setStorage(loadStorage()); };
    sync();
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

  const cycleStorage = (k: keyof StorageContext) => {
    const cur = storage[k];
    const next = cur === true ? false : cur === false ? null : true;
    const nextAll = { ...storage, [k]: next };
    setStorage(nextAll);
    saveStorage(nextAll);
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

            <div className="profile-storage">
              <h4>{lang === "zh" ? "这瓶/这些当前怎么放" : "How it's stored now"}</h4>
              <p className="profile-storage-hint">{lang === "zh" ? "点按切换：是 / 否 / 未填。储存会改变结论（如「儿童可触及」+ 有儿童 → 风险升级）。" : "Tap to cycle yes/no/unset. Storage changes the verdict."}</p>
              <div className="profile-chips">
                {STORAGE_OPTS.map((s) => {
                  const v = storage[s.key];
                  const state = v === true ? "yes" : v === false ? "no" : "unset";
                  return (
                    <button
                      key={s.key}
                      type="button"
                      className={`profile-chip storage-chip is-${state}`}
                      onClick={() => cycleStorage(s.key)}
                    >
                      {s[lang]}
                      <span className="storage-state">{v === true ? (lang === "zh" ? "是" : "Y") : v === false ? (lang === "zh" ? "否" : "N") : "—"}</span>
                    </button>
                  );
                })}
              </div>
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
