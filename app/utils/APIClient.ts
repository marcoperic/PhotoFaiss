import * as FileSystem from 'expo-file-system';

class APIClient {
  public baseUrl: string;

  constructor() {
    this.baseUrl = 'http://172.16.116.18:8000'; // Replace with your server's IP
  }

  async uploadImages(zipUri: string): Promise<Response> {
    const formData = new FormData();
    formData.append('file', {
      uri: zipUri,
      name: 'images.zip',
      type: 'application/zip'
    } as any);

    try {
      const response = await fetch(`${this.baseUrl}/imgUpload`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      console.error('Error uploading images:', error);
      throw error;
    }
  }

  async searchSimilarImages(imageUri: string, k: number = 5): Promise<{ similar_images: string[]; distances: number[] }> {
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      name: 'query.jpg',
      type: 'image/jpeg'
    } as any);
    formData.append('k', k.toString());

    try {
      console.log(`Sending search request to ${this.baseUrl}/search`);
      console.log('Image URI:', imageUri);
      
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('Response status:', response.status);
      const responseText = await response.text();
      console.log('Response text:', responseText);

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status} - ${responseText}`);
      }

      const result = JSON.parse(responseText);
      return result;
    } catch (error) {
      console.error('Error searching similar images:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

export default APIClient;
