import * as FileSystem from 'expo-file-system';

class APIClient {
  public baseUrl: string;
  public userId: string;

  constructor() {
    this.baseUrl = 'http://100.27.49.240:8000'; // Replace with your server's IP
    this.userId = '1234'; // Hardcoded for testing
  }

  async checkExistingIndex(): Promise<{ exists: boolean; imageCount?: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/check_index/${this.userId}`);
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error checking index:', error);
      return { exists: false };
    }
  }

  async uploadImages(zipUri: string): Promise<Response> {
    const formData = new FormData();
    formData.append('file', {
      uri: zipUri,
      name: 'images.zip',
      type: 'application/zip'
    } as any);
    formData.append('user_id', this.userId);

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
    formData.append('user_id', this.userId);

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
