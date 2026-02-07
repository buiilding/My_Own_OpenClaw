if __name__ == "__main__":
    import os
    import uvicorn
    access_log = os.getenv("WINDIEOS_LOG_PROFILE", "important").lower() == "verbose"
    uvicorn.run(
        "backend.src.simulation.main:app",
        host="0.0.0.0",
        port=8765,
        access_log=access_log,
    )
