from fastapi import FastAPI

from app.routers.videos import router as videos_router

app = FastAPI(title="Amber Light Stories")
app.include_router(videos_router)


@app.get("/health")
def health():
    return {"status": "ok"}
