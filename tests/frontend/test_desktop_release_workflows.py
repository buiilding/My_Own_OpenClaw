from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_private_desktop_release_workflow_runs_from_frontend_subtree() -> None:
    workflow = (REPO_ROOT / ".github/workflows/desktop-release.yml").read_text()

    assert 'name: Desktop Release Artifacts' in workflow
    assert 'cache-dependency-path: frontend/package-lock.json' in workflow
    assert 'working-directory: frontend' in workflow
    assert 'package_script: package:linux' in workflow
    assert 'package_script: package:win' in workflow
    assert 'package_script: package:mac' in workflow
    assert 'frontend/release/windieos_*_x86_64.AppImage' in workflow
    assert 'frontend/release/*.exe' in workflow
    assert 'frontend/release/*.dmg' in workflow
    assert "macOS published releases must be signed and notarized" in workflow
    assert "WINDIE_VALIDATE_DOWNLOADED_APP" in workflow
    assert ":bundled-python" not in workflow


def test_public_desktop_release_workflow_stays_split_repo_rooted() -> None:
    workflow = (REPO_ROOT / "frontend/.github/workflows/desktop-release.yml").read_text()

    assert 'cache-dependency-path: package-lock.json' in workflow
    assert 'release/windieos_*_x86_64.AppImage' in workflow
    assert 'release/*.exe' in workflow
    assert 'release/*.dmg' in workflow
    assert 'frontend/release' not in workflow
    assert 'frontend/package-lock.json' not in workflow
