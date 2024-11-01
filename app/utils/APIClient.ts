import * as FileSystem from 'expo-file-system';

class APIClient {
  public baseUrl: string;

  constructor() {
    this.baseUrl = 'http://10.5.1.254:8000'; // Replace with your machine's IP
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
}

export default APIClient;
