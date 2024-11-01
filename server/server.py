from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from typing import Dict, List
import shutil
import zipfile
import os

os.environ['KMP_DUPLICATE_LIB_OK'] = 'True'

import tempfile
import uuid
import torch
import torchvision.models as models
import torchvision.transforms as transforms
from PIL import Image
import numpy as np
import faiss
import secrets
import time
import json

app = FastAPI()

# Load the ResNet model (moved outside of function for efficiency)
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model = models.resnet101(pretrained=True)
model = torch.nn.Sequential(*list(model.children())[:-1])
model.to(device)
model.eval()

# Define transforms
transform = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

def extract_features(image):
    image = transform(image).unsqueeze(0).to(device)
    with torch.no_grad():
        features = model(image)
        features = features.squeeze()  # Keep on GPU
    return features.cpu().numpy().flatten()  # Only move to CPU at the final step

# In-memory storage for uploaded images
image_storage: Dict[str, Dict[str, bytes]] = {}

# Store just the index and paths as global variables
faiss_index = None
image_paths = []

@app.post("/imgUpload")
async def upload_images(file: UploadFile = File(...)):
    global faiss_index, image_paths
    
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
            
            # Extract the zip file
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
                print("Extraction complete.")

            # Load the manifest.json
            manifest_path = os.path.join(temp_dir, "manifest.json")
            if not os.path.exists(manifest_path):
                return JSONResponse(
                    status_code=400,
                    content={"message": "manifest.json not found in the ZIP file"}
                )
            
            with open(manifest_path, 'r') as f:
                manifest = json.load(f)
                print(f"Loaded manifest with {len(manifest)} entries.")

            # Lists to store features and original uris
            image_features = []
            valid_image_paths_local = []

            print("\nProcessing images...")
            
            # Start timing the feature extraction
            feature_extraction_start_time = time.time()
            
            for processed_filename, original_uri in manifest.items():
                processed_file_path = os.path.join(temp_dir, processed_filename)
                
                if not os.path.exists(processed_file_path):
                    print(f"Processed file {processed_filename} not found. Skipping.")
                    continue

                try:
                    print(f"Processing image: {processed_filename} mapped to {original_uri}")
                    image = Image.open(processed_file_path).convert('RGB')
                    
                    # Extract features
                    features = extract_features(image)
                    print(f"Features extracted for {processed_filename}: {features.shape}")
                    image_features.append(features)
                    valid_image_paths_local.append(original_uri)  # Use original URI
                    print(f"✓ Successfully added features for {processed_filename}")

                except Exception as e:
                    print(f"Error processing {processed_filename}: {str(e)}")
                    print(f"Error type: {type(e)}")

            # End timing the feature extraction
            feature_extraction_time = time.time() - feature_extraction_start_time
            print(f"Feature extraction completed in {feature_extraction_time:.2f} seconds")
            
            print(f"\nTotal features collected: {len(image_features)}")

        # Create FAISS index
        if image_features:
            print("\nCreating FAISS index...")
            start_time = time.time()
            
            image_features = np.array(image_features).astype('float32')
            dimension = image_features.shape[1]
            faiss_index = faiss.IndexFlatL2(dimension)
            faiss_index.add(image_features)  # Vectors are stored at indices 0, 1, 2, ...
            image_paths = valid_image_paths_local  # Store original URIs in the same order as vectors
            
            build_time = time.time() - start_time
            print(f"FAISS index built in {build_time:.2f} seconds")
            
            # Generate token
            token = secrets.token_hex(8)  # 16 characters
            
            print(f"\nIndex creation complete! Processed {len(valid_image_paths_local)} images")
            return JSONResponse(
                status_code=200,
                content={
                    "message": "Images processed and index created successfully",
                    "token": token,
                    "image_count": len(valid_image_paths_local),
                    "processed_files": valid_image_paths_local
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

@app.post("/search")
async def search_similar_images(file: UploadFile = File(...), k: int = 5):
    try:
        if faiss_index is None:
            return JSONResponse(
                status_code=500,
                content={"message": "FAISS index is not initialized. Please upload images first."}
            )
        
        # Save the uploaded image to a temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = os.path.join(temp_dir, file.filename)
            with open(image_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            print(f"Saved query image to: {image_path}")

            # Open and preprocess the image
            image = Image.open(image_path).convert('RGB')
            features = extract_features(image)
            print(f"Extracted features from query image: {features.shape}")

        # Convert features to the correct format
        query_vector = np.array(features).astype('float32').reshape(1, -1)

        # Perform FAISS search
        distances, indices = faiss_index.search(query_vector, k)
        print(f"Search results - indices: {indices[0]}, distances: {distances[0]}")

        # Map indices to original URIs
        similar_uris = [image_paths[idx] for idx in indices[0]]
        print(f"Returning similar URIs: {similar_uris}")

        return {"similar_images": similar_uris, "distances": distances[0].tolist()}

    except Exception as e:
        print(f"Error during search: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"message": f"An error occurred during search: {str(e)}"}
        )

@app.get("/query")
async def query_images(uri: str):
    try:
        print(f"\nReceived query request for URI: {uri}")
        print(f"Current image_paths length: {len(image_paths)}")
        print(f"Looking for exact match in paths...")
        
        # Check if the URI exists in image_paths
        if uri not in image_paths:
            print("URI not found in the index.")
            return {"error": "URI not found"}

        query_idx = image_paths.index(uri)
        
        # Get the corresponding vector from FAISS
        query_vector = faiss_index.reconstruct(query_idx).reshape(1, -1)
        print(f"Retrieved vector shape: {query_vector.shape}")
        
        # Search for similar vectors
        k = 5
        distances, indices = faiss_index.search(query_vector, k)
        print(f"Search results - indices: {indices[0]}, distances: {distances[0]}")
        
        # Map the returned indices back to ORIGINAL URIs
        similar_uris = [image_paths[idx] for idx in indices[0]]
        print(f"Returning similar URIs: {similar_uris}")
        
        return {"similar_images": similar_uris, "distances": distances[0].tolist()}
    except ValueError as e:
        print(f"ValueError occurred: {str(e)}")
        return {"error": "URI not found"}
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return {"error": f"An error occurred: {str(e)}"}

@app.get("/")
async def root():
    return {"message": "Image Upload Server is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
