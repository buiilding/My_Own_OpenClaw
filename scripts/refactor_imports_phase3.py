import os

root_dir = "backend"
replacements = {
    "backend.shared": "backend.src.shared",
}

for root, dirs, files in os.walk(root_dir):
    for file in files:
        if file.endswith(".py") and file != "refactor_imports_phase3.py":
            path = os.path.join(root, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            
            new_content = content
            for old, new in replacements.items():
                new_content = new_content.replace(old, new)
            
            if new_content != content:
                print(f"Updating {path}")
                with open(path, "w", encoding="utf-8") as f:
                    f.write(new_content)

