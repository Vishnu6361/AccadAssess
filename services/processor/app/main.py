from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="SmartFA Document Processing Worker",
    description="Asynchronous PDF rendering and document processing worker.",
    version="1.0.0"
)

# Standard middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    timestamp: str


@app.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    """Service health verification endpoint."""
    return HealthResponse(
        status="ok",
        service="smartfa-processor",
        version="1.0.0",
        timestamp=datetime.now(timezone.utc).isoformat()
    )


@app.get("/")
def get_root():
    """Root metadata endpoint."""
    return {
        "name": "SmartFA Document Processing Worker",
        "description": "PDF rendering and document processing",
        "version": "1.0.0",
        "status": "operational",
        "health": "/health"
    }


if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
