import * as MediaLibrary from 'expo-media-library';

class PhotoLoader {
  private photoURIs: string[];
  private totalPhotos: number;
  private loadedPhotos: number;

  constructor() {
    this.photoURIs = [];
    this.totalPhotos = 0;
    this.loadedPhotos = 0;
  }

  /**
   * Initializes and loads all photos.
   * @param onProgress - Callback to update loading progress.
   */
  async initialize(onProgress?: (progress: number) => void) {
    await this.loadAllPhotos(onProgress);
  }

  /**
   * Loads all photos with optional progress updates.
   * @param onProgress - Callback to update loading progress.
   */
  async loadAllPhotos(onProgress?: (progress: number) => void) {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Permission to access media library was denied');
    }

    let hasMorePhotos = true;
    let endCursor: string | undefined = undefined;
    while (hasMorePhotos) {
      const { assets, endCursor: newEndCursor, hasNextPage, totalCount } = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        after: endCursor,
        first: 250, // Fetch in batches of 1000
      });
      this.photoURIs = [...this.photoURIs, ...assets.map(asset => asset.uri)];
      this.loadedPhotos += assets.length;
      this.totalPhotos = totalCount;
      console.log(`Loaded ${this.loadedPhotos} photos out of ${this.totalPhotos}`);

      if (onProgress) {
        onProgress(this.getProgress());
      }

      endCursor = newEndCursor;
      hasMorePhotos = hasNextPage;
    }
  }

  getPhotoURIs(): string[] {
    return this.photoURIs;
  }

  getProgress(): number {
    return this.totalPhotos > 0 ? this.loadedPhotos / this.totalPhotos : 0;
  }
}

export default PhotoLoader;
