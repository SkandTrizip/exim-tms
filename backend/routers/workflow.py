from fastapi import APIRouter

router = APIRouter()

@router.get("/status")
async def get_workflow_status():
    return {"status": "Workflow engine is active"}
