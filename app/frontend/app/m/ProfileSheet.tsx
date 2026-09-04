"use client";

import { useEffect, useState } from "react";
import { useLang } from "../i18n";
import {
  ARRAY_DIMS,
  CUSTOM_TAG_LEN,
  CUSTOM_TAG_MAX,
  DIM_META,
  PROFILE_KEYS,
  PROFILE_LABELS,
  emptyProfile,
  emptyStorage,
  loadProfile,
  loadStorage,
  saveProfile,
  saveStorage,
  selectedLabels,
  type ArrayDim,
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
  const [custom, setCustom] = useState<Record<ArrayDim, string>>({ doctor_flags: "", allergens: "", diet: "", fitness: "" });

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

  const toggleTag = (dim: ArrayDim, tag: string) => {
    const cur = profile[dim];
    const next = { ...profile, [dim]: cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag] };
    setProfile(next);
    saveProfile(next);
  };

  const customCount = (dim: ArrayDim) => profile[dim].filter((t) => !DIM_META[dim].presets.includes(t)).length;

  const addCustom = (dim: ArrayDim) => {
    const tag = custom[dim].trim().slice(0, CUSTOM_TAG_LEN);
    if (!tag || profile[dim].includes(tag) || customCount(dim) >= CUSTOM_TAG_MAX) return;
    const next = { ...profile, [dim]: [...profile[dim], tag] };
    setProfile(next);
    saveProfile(next);
    setCustom({ ...custom, [dim]: "" });
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
  const totalSelected = PROFILE_KEYS.filter((k) => profile[k]).length
    + ARRAY_DIMS.reduce((n, d) => n + profile[d].length, 0);
  const peopleCount = PROFILE_KEYS.filter((k) => profile[k]).length;

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
                <p className="profile-autosave">
                  {lang === "zh" ? `✓ 改动将自动保存 · 共 ${totalSelected} 项已选` : `✓ Auto-saved · ${totalSelected} selected`}
                </p>
              </div>
              <button type="button" className="profile-x" onClick={() => setOpen(false)} aria-label="close">✕</button>
            </header>

            {/* 维度一：人群（默认展开） */}
            <details className="profile-dim" open>
              <summary>
                <span className="profile-dim-icon">👪</span>
                <span className="profile-dim-name">{lang === "zh" ? "人群" : "People"}</span>
                <span className="profile-dim-sub">{lang === "zh" ? "常住成员与宠物" : "Members & pets"}</span>
                <span className="profile-dim-badge">{peopleCount}</span>
              </summary>
              <div className="profile-dim-body">
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
              </div>
            </details>

            {/* 维度二~五：数组维度（预设 + 自定义标签） */}
            {ARRAY_DIMS.map((dim) => {
              const meta = DIM_META[dim];
              const customs = profile[dim].filter((t) => !meta.presets.includes(t));
              return (
                <details className="profile-dim" key={dim}>
                  <summary>
                    <span className="profile-dim-icon">{meta.icon}</span>
                    <span className="profile-dim-name">{lang === "zh" ? meta.zh : meta.en}</span>
                    <span className="profile-dim-sub">{lang === "zh" ? meta.sub_zh : meta.sub_en}</span>
                    <span className="profile-dim-badge">{profile[dim].length}</span>
                  </summary>
                  <div className="profile-dim-body">
                    <div className="profile-chips">
                      {meta.presets.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className={`profile-chip${profile[dim].includes(tag) ? " is-on" : ""}`}
                          onClick={() => toggleTag(dim, tag)}
                          aria-pressed={profile[dim].includes(tag)}
                        >
                          {tag}
                        </button>
                      ))}
                      {customs.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="profile-chip is-on is-custom"
                          onClick={() => toggleTag(dim, tag)}
                          title={lang === "zh" ? "再点一次移除" : "Tap again to remove"}
                        >
                          {tag} ✕
                        </button>
                      ))}
                    </div>
                    <div className="profile-custom-row">
                      <input
                        type="text"
                        value={custom[dim]}
                        maxLength={CUSTOM_TAG_LEN}
                        placeholder={lang === "zh" ? `添加自定义标签（最多 ${CUSTOM_TAG_LEN} 字）` : `Custom tag (max ${CUSTOM_TAG_LEN} chars)`}
                        onChange={(e) => setCustom({ ...custom, [dim]: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(dim); } }}
                      />
                      <button type="button" onClick={() => addCustom(dim)} disabled={!custom[dim].trim() || customCount(dim) >= CUSTOM_TAG_MAX}>
                        {lang === "zh" ? "添加" : "Add"}
                      </button>
                    </div>
                    <p className="profile-custom-hint">
                      {lang === "zh" ? `自定义标签每维度最多 ${CUSTOM_TAG_MAX} 个 ${customCount(dim)}/${CUSTOM_TAG_MAX}` : `Up to ${CUSTOM_TAG_MAX} custom tags per dimension ${customCount(dim)}/${CUSTOM_TAG_MAX}`}
                    </p>
                  </div>
                </details>
              );
            })}

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
