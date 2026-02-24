import logging
from types import SimpleNamespace

from tests.sidecar.browser_use_test_utils import ensure_local_browser_use_path

ensure_local_browser_use_path()

from browser_use.utils import _resolve_execution_logger


def test_resolve_execution_logger_prefers_self_logger():
	self_logger = logging.getLogger('test.browser_use.utils.self')
	agent_logger = logging.getLogger('test.browser_use.utils.agent')
	args = (SimpleNamespace(logger=self_logger),)
	kwargs = {'agent': SimpleNamespace(logger=agent_logger)}

	assert _resolve_execution_logger(args=args, kwargs=kwargs) is self_logger


def test_resolve_execution_logger_uses_agent_logger():
	agent_logger = logging.getLogger('test.browser_use.utils.agent')
	args = tuple()
	kwargs = {'agent': SimpleNamespace(logger=agent_logger)}

	assert _resolve_execution_logger(args=args, kwargs=kwargs) is agent_logger


def test_resolve_execution_logger_uses_browser_session_logger_before_module_default():
	browser_logger = logging.getLogger('test.browser_use.utils.browser_session')
	args = tuple()
	kwargs = {'browser_session': SimpleNamespace(logger=browser_logger)}

	assert _resolve_execution_logger(args=args, kwargs=kwargs) is browser_logger
