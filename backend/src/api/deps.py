from typing import Annotated
from fastapi import Depends, HTTPException

from backend.src.core.container import Container
from backend.src.brain.session_manager import SessionManager

# Global state holder
class AppState:
    container: Container | None = None
    session_manager: SessionManager | None = None

_app_state = AppState()

def get_app_state() -> AppState:
    return _app_state

async def get_container() -> Container:
    if _app_state.container is None:
        raise HTTPException(status_code=503, detail="Application not initialized")
    return _app_state.container

async def get_session_manager() -> SessionManager:
    if _app_state.session_manager is None:
        raise HTTPException(status_code=503, detail="Application not initialized")
    return _app_state.session_manager

SessionManagerDep = Annotated[SessionManager, Depends(get_session_manager)]
ContainerDep = Annotated[Container, Depends(get_container)]

