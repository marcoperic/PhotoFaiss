from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import shutil
import zipfile
import os
from typing import Dict
import tempfile
import uuid

app = FastAPI()

# In-memory storage for uploaded images
image_storage: Dict[str, Dict[str, bytes]] = {}

@app.post("/imgUpload")
async def upload_images(file: UploadFile = File(...)):
    try:
        # Verify if the uploaded file is a zip
        if not file.filename.endswith('.zip'):
            return JSONResponse(
                status_code=400,
                content={"message": "Only ZIP files are accepted"}
            )

        # Create a unique ID for this batch of images
        batch_id = str(uuid.uuid4())
        
        # Create a temporary directory to extract files
        with tempfile.TemporaryDirectory() as temp_dir:
            # Save the uploaded zip file
            zip_path = os.path.join(temp_dir, "upload.zip")
            with open(zip_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Create storage for this batch
            image_storage[batch_id] = {}
            
            # Extract and store images
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                for filename in zip_ref.namelist():
                    # Skip directories and hidden files
                    if filename.endswith('/') or filename.startswith('.'): 
                        continue
                    
                    # Only process image files
                    if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                        with zip_ref.open(filename) as image_file:
                            image_data = image_file.read()
                            image_storage[batch_id][filename] = image_data

        return JSONResponse(
            status_code=200,
            content={
                "message": "Images uploaded successfully",
                "batch_id": batch_id,
                "image_count": len(image_storage[batch_id])
            }
        )

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"An error occurred: {str(e)}"}
        )

@app.get("/")
async def root():
    return {"message": "Image Upload Server is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
