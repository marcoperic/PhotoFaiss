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
        print(f"Received file: {file.filename}")
        if not file.filename.endswith('.zip'):
            return JSONResponse(
                status_code=400,
                content={"message": "Only ZIP files are accepted"}
            )

        # Create a unique ID for this batch of images
        batch_id = str(uuid.uuid4())
        print(f"Created batch ID: {batch_id}")
        
        # Create a temporary directory to extract files
        with tempfile.TemporaryDirectory() as temp_dir:
            print(f"Created temporary directory: {temp_dir}")
            
            # Save the uploaded zip file
            zip_path = os.path.join(temp_dir, "upload.zip")
            print(f"Saving zip file to: {zip_path}")
            with open(zip_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Create storage for this batch
            image_storage[batch_id] = {}
            print("Starting to extract files from zip...")
            
            # Extract and store images
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                file_list = zip_ref.namelist()
                print(f"\nFiles found in archive:")
                for filename in file_list:
                    print(f"- {filename}")
                
                print("\nProcessing files...")
                for filename in file_list:
                    # Skip directories and hidden files
                    if filename.endswith('/') or filename.startswith('.'): 
                        print(f"Skipping {filename} (directory or hidden file)")
                        continue
                    
                    # Only process image files
                    if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                        print(f"Processing image: {filename}")
                        with zip_ref.open(filename) as image_file:
                            image_data = image_file.read()
                            image_storage[batch_id][filename] = image_data
                            print(f"✓ Stored {filename} ({len(image_data)} bytes)")
                    else:
                        print(f"Skipping {filename} (not an image file)")

        print(f"\nUpload complete! Processed {len(image_storage[batch_id])} images")
        return JSONResponse(
            status_code=200,
            content={
                "message": "Images uploaded successfully",
                "batch_id": batch_id,
                "image_count": len(image_storage[batch_id]),
                "processed_files": list(image_storage[batch_id].keys())
            }
        )

    except Exception as e:
        print(f"Error occurred: {str(e)}")
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
