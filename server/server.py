from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import shutil
import zipfile
import os
from typing import Dict
import tempfile
import uuid
import torch
import torchvision.models as models
import torchvision.transforms as transforms
from PIL import Image
import numpy as np
import faiss
import base64
import io
import secrets
import time

app = FastAPI()

# Load the ResNet model (moved outside of function for efficiency)
model = models.resnet101(pretrained=True)
model = torch.nn.Sequential(*list(model.children())[:-1])
model.eval()

# Define transforms
transform = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

def extract_features(image):
    image = transform(image).unsqueeze(0)
    with torch.no_grad():
        features = model(image).squeeze().numpy()
    return features.flatten()

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
            
            print("Starting to extract files from zip...")
            
            # Lists to store features and paths
            image_features = []
            valid_image_paths = []
            
            # Extract and process images
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                file_list = zip_ref.namelist()
                print(f"\nFiles found in archive: {len(file_list)}")
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
                        try:
                            with zip_ref.open(filename) as image_file:
                                # Read image and convert to PIL
                                image_data = image_file.read()
                                print(f"Read {len(image_data)} bytes for {filename}")
                                image = Image.open(io.BytesIO(image_data)).convert('RGB')
                                
                                # Extract features
                                features = extract_features(image)
                                print(f"Features shape for {filename}: {features.shape}")
                                image_features.append(features)
                                valid_image_paths.append(filename)
                                print(f"✓ Successfully added features for {filename}")
                        except Exception as e:
                            print(f"Error processing {filename}: {str(e)}")
                            print(f"Error type: {type(e)}")
                    else:
                        print(f"Skipping {filename} (not an image file)")

            print(f"\nTotal features collected: {len(image_features)}")

        # Create FAISS index
        if image_features:
            print("\nCreating FAISS index...")
            start_time = time.time()
            
            image_features = np.array(image_features).astype('float32')
            dimension = image_features.shape[1]
            index = faiss.IndexFlatL2(dimension)
            index.add(image_features)
            
            build_time = time.time() - start_time
            print(f"FAISS index built in {build_time:.2f} seconds")
            
            # Serialize the index
            # print("Serializing FAISS index...")
            # index_buffer = io.BytesIO()
            # faiss.write_index(index, index_buffer)
            # index_bytes = index_buffer.getvalue()
            # index_base64 = base64.b64encode(index_bytes).decode('utf-8')
            
            # Generate token
            token = secrets.token_hex(8)  # 16 characters
            
            print(f"\nIndex creation complete! Processed {len(valid_image_paths)} images")
            return JSONResponse(
                status_code=200,
                content={
                    "message": "Images processed and index created successfully",
                    "token": token,
                    "image_count": len(valid_image_paths),
                    "processed_files": valid_image_paths
                }
            )
        else:
            return JSONResponse(
                status_code=400,
                content={"message": "No valid images found in the ZIP file"}
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
