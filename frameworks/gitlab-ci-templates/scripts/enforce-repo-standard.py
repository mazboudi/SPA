from pathlib import Path

required = ["README.md", "app.json", ".gitlab-ci.yml"]
missing = [p for p in required if not Path(p).exists()]
if missing:
    raise SystemExit(f"Missing required files: {', '.join(missing)}")
print("Repo standard check passed")
