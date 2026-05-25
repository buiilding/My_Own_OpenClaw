def test_session_package_exports_public_runtime_classes() -> None:
    import backend.src.agent.session as session_package
    from backend.src.agent.session import AgentSession, SessionManager
    from backend.src.agent.session.manager import SessionManager as ManagerModuleExport
    from backend.src.agent.session.session import AgentSession as SessionModuleExport

    assert session_package.AgentSession is SessionModuleExport
    assert session_package.SessionManager is ManagerModuleExport
    assert AgentSession is SessionModuleExport
    assert SessionManager is ManagerModuleExport
