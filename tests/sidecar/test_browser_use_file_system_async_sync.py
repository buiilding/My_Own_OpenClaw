from pathlib import Path

import pytest

from tests.sidecar.browser_use_test_utils import ensure_local_browser_use_path

ensure_local_browser_use_path()

from browser_use.filesystem.file_system import BaseFile, MarkdownFile


class _CustomSyncFile(BaseFile):
	sync_calls: int = 0

	@property
	def extension(self) -> str:
		return 'txt'

	def sync_to_disk_sync(self, path: Path) -> None:
		self.sync_calls += 1
		(path / self.full_name).write_text(f'custom:{self.content}')


@pytest.mark.asyncio
async def test_sync_to_disk_uses_sync_to_disk_sync_override(tmp_path: Path):
	file = _CustomSyncFile(name='notes', content='hello')
	await file.sync_to_disk(tmp_path)

	assert file.sync_calls == 1
	assert (tmp_path / 'notes.txt').read_text() == 'custom:hello'


@pytest.mark.asyncio
async def test_markdown_file_sync_to_disk_writes_content(tmp_path: Path):
	file = MarkdownFile(name='readme', content='# hi')
	await file.sync_to_disk(tmp_path)

	assert (tmp_path / 'readme.md').read_text() == '# hi'
