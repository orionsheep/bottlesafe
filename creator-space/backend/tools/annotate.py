from __future__ import annotations

import json
import sys
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk

from PIL import Image, ImageTk

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.schema import ChemicalAnalysis  # noqa: E402


class Annotator:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("家庭化学品安全数据标注")
        self.root.geometry("1320x820")
        self.manifest_path = ROOT / "data/inbox/manifest.jsonl"
        self.output_path = ROOT / "data/raw/all.jsonl"
        self.rows = self._load_manifest()
        self.done = self._load_done()
        self.pending = [r for r in self.rows if r["sha256"] not in self.done]
        self.index = 0
        self.photo = None
        self.vars: dict[str, tk.StringVar] = {}
        self.hazards: dict[str, tk.BooleanVar] = {}
        self._build()
        self._show()

    def _load_manifest(self):
        if not self.manifest_path.exists():
            messagebox.showerror("缺少图片", "请先运行 tools/import_images.py")
            return []
        return [json.loads(x) for x in self.manifest_path.read_text(encoding="utf-8").splitlines() if x.strip()]

    def _load_done(self):
        done = {}
        if self.output_path.exists():
            for line in self.output_path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    row = json.loads(line)
                    if row.get("sha256"):
                        done[row["sha256"]] = row
        return done

    def _build(self):
        left = ttk.Frame(self.root, padding=10)
        left.pack(side="left", fill="both", expand=True)
        right = ttk.Frame(self.root, padding=10, width=520)
        right.pack(side="right", fill="y")
        self.image_label = ttk.Label(left, anchor="center")
        self.image_label.pack(fill="both", expand=True)
        self.progress = ttk.Label(left)
        self.progress.pack(fill="x")

        fields = [
            ("name", "产品名称*"), ("brand", "品牌"), ("category", "类别"),
            ("barcode", "条码"), ("manufacturer", "生产商"),
            ("ingredients", "标签成分（逗号分隔）"), ("signal_words", "警示词（逗号分隔）"),
            ("evidence", "可见证据*"), ("storage", "安全储存建议*"),
            ("do_not_mix", "禁止混用（逗号分隔）"), ("uncertainties", "不确定项"),
            ("more_images", "还需补拍"), ("summary", "简要结论*"),
        ]
        form = ttk.Frame(right)
        form.pack(fill="both", expand=True)
        for i, (key, label) in enumerate(fields):
            ttk.Label(form, text=label).grid(row=i, column=0, sticky="nw", padx=3, pady=3)
            self.vars[key] = tk.StringVar()
            ttk.Entry(form, textvariable=self.vars[key], width=48).grid(row=i, column=1, sticky="ew", pady=3)

        row = len(fields)
        ttk.Label(form, text="风险类型").grid(row=row, column=0, sticky="nw")
        hazard_frame = ttk.Frame(form)
        hazard_frame.grid(row=row, column=1, sticky="w")
        for hazard in ["flammable", "corrosive", "toxic", "irritant", "oxidizer", "environmental", "pressurized"]:
            self.hazards[hazard] = tk.BooleanVar()
            ttk.Checkbutton(hazard_frame, text=hazard, variable=self.hazards[hazard]).pack(side="left")
        row += 1
        ttk.Label(form, text="风险等级*").grid(row=row, column=0, sticky="w")
        self.vars["risk_level"] = tk.StringVar(value="unknown")
        ttk.Combobox(form, textvariable=self.vars["risk_level"], values=["unknown", "low", "medium", "high", "critical"], state="readonly").grid(row=row, column=1, sticky="ew")
        row += 1
        ttk.Label(form, text="风险证据").grid(row=row, column=0, sticky="w")
        self.vars["hazard_evidence"] = tk.StringVar()
        ttk.Entry(form, textvariable=self.vars["hazard_evidence"], width=48).grid(row=row, column=1, sticky="ew")
        row += 1
        buttons = ttk.Frame(form)
        buttons.grid(row=row, column=0, columnspan=2, pady=12)
        ttk.Button(buttons, text="保存并下一张", command=self.save).pack(side="left", padx=5)
        ttk.Button(buttons, text="跳过", command=self.skip).pack(side="left", padx=5)
        ttk.Button(buttons, text="标记非化学品", command=self.negative).pack(side="left", padx=5)
        form.columnconfigure(1, weight=1)

    @staticmethod
    def _split(value: str):
        return [x.strip() for x in value.replace("，", ",").split(",") if x.strip()]

    def _show(self):
        if not self.pending or self.index >= len(self.pending):
            self.image_label.configure(image="", text="本批次已完成")
            self.progress.configure(text=f"已标注 {len(self.done)} 张")
            return
        row = self.pending[self.index]
        image_path = Path(row["image"])
        if not image_path.is_absolute():
            image_path = ROOT / image_path
        image = Image.open(image_path).convert("RGB")
        image.thumbnail((760, 730))
        self.photo = ImageTk.PhotoImage(image)
        self.image_label.configure(image=self.photo, text="")
        self.progress.configure(text=f"待标注 {self.index + 1}/{len(self.pending)} | SKU: {row['group_id']} | {image_path.name}")

    def _base_row(self, answer):
        row = self.pending[self.index]
        image = Path(row["image"])
        try:
            image = image.resolve().relative_to(self.output_path.parent.resolve())
        except ValueError:
            image = image.resolve()
        return {"image": str(image), "group_id": row["group_id"], "sha256": row["sha256"], "answer": answer}

    def save(self):
        required = ["name", "evidence", "storage", "summary"]
        if any(not self.vars[k].get().strip() for k in required):
            messagebox.showwarning("缺少字段", "请填写所有带 * 的字段")
            return
        level = self.vars["risk_level"].get()
        hazards = [{
            "type": name, "severity": level if level != "unknown" else "medium",
            "evidence": self.vars["hazard_evidence"].get().strip() or self.vars["evidence"].get().strip(),
            "confidence": 0.9,
        } for name, var in self.hazards.items() if var.get()]
        answer = {
            "product": {k: self.vars[k].get().strip() or None for k in ["name", "brand", "category", "barcode", "manufacturer"]},
            "visual_evidence": self._split(self.vars["evidence"].get()), "hazards": hazards,
            "ingredients": [{"name": x, "source": "label", "confidence": 0.95} for x in self._split(self.vars["ingredients"].get())],
            "signal_words": self._split(self.vars["signal_words"].get()),
            "safe_storage": self._split(self.vars["storage"].get()),
            "do_not_mix_with": self._split(self.vars["do_not_mix"].get()),
            "first_aid": {}, "uncertainties": self._split(self.vars["uncertainties"].get()),
            "needs_more_images": self._split(self.vars["more_images"].get()),
            "risk_level": level, "summary": self.vars["summary"].get().strip(),
        }
        validated = ChemicalAnalysis.model_validate(answer).model_dump()
        row = self._base_row(validated)
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        with self.output_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        self.done[row["sha256"]] = row
        self._next()

    def negative(self):
        answer = ChemicalAnalysis.model_validate({
            "product": {"name": None, "category": "非家庭化学品"},
            "visual_evidence": ["人工标记为非家庭化学品"], "risk_level": "unknown",
            "uncertainties": [], "summary": "图片中不是家庭化学品。",
        }).model_dump()
        row = self._base_row(answer)
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        with self.output_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        self.done[row["sha256"]] = row
        self._next()

    def skip(self):
        self._next()

    def _next(self):
        for var in self.vars.values():
            var.set("")
        self.vars["risk_level"].set("unknown")
        for var in self.hazards.values():
            var.set(False)
        self.index += 1
        self._show()


if __name__ == "__main__":
    window = tk.Tk()
    Annotator(window)
    window.mainloop()
