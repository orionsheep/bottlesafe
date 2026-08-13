from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    p = argparse.ArgumentParser(description="导入家庭化学品图片到标注收件箱")
    p.add_argument("--source", type=Path, required=True)
    p.add_argument("--output", type=Path, default=Path("data/inbox"))
    args = p.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    if not source.is_dir():
        raise NotADirectoryError(source)
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / "manifest.jsonl"
    existing = {}
    if manifest_path.exists():
        for line in manifest_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                row = json.loads(line)
                existing[row["sha256"]] = row

    added = skipped = 0
    for image in sorted(p for p in source.rglob("*") if p.suffix.lower() in EXTENSIONS):
        digest = sha256(image)
        if digest in existing:
            skipped += 1
            continue
        relative = image.relative_to(source)
        group_id = relative.parts[0] if len(relative.parts) > 1 else image.stem
        target_dir = output / group_id
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"{digest[:12]}_{image.name}"
        shutil.copy2(image, target)
        existing[digest] = {
            "image": str(target), "group_id": group_id, "sha256": digest,
            "source": str(image), "status": "pending",
        }
        added += 1

    with manifest_path.open("w", encoding="utf-8") as f:
        for row in existing.values():
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"新增 {added} 张；跳过重复 {skipped} 张；清单: {manifest_path}")


if __name__ == "__main__":
    main()
