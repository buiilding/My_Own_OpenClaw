if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.src.simulation.main:app", host="0.0.0.0", port=8765)
