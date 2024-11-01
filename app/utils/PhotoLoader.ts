import * as MediaLibrary from 'expo-media-library';

class PhotoLoader {
  private photoURIs: string[];
  private totalPhotos: number;
  private loadedPhotos: number;
  private MAX_IMAGES = -1; // Maximum number of images to load

  constructor() {
    this.photoURIs = [];
    this.totalPhotos = 0;
    this.loadedPhotos = 0;
  }

  /**
   * Initializes and loads all photos up to MAX_IMAGES.
   * @param onProgress - Callback to update loading progress.
   */
  async initialize(onProgress?: (progress: number) => void) {
    await this.loadAllPhotos(onProgress);
  }

  /**
   * Loads photos with optional progress updates, up to MAX_IMAGES.
   * @param onProgress - Callback to update loading progress.
   */
  async loadAllPhotos(onProgress?: (progress: number) => void) {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Permission to access media library was denied');
    }

    let hasMorePhotos = true;
    let endCursor: string | undefined = undefined;
    while (hasMorePhotos && (this.MAX_IMAGES === -1 || this.loadedPhotos < this.MAX_IMAGES)) {
      const remaining = this.MAX_IMAGES === -1 ? 1000 : this.MAX_IMAGES - this.loadedPhotos;
      const fetchCount = remaining >= 1000 ? 1000 : remaining;

      const { assets, endCursor: newEndCursor, hasNextPage, totalCount } = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        after: endCursor,
        first: fetchCount,
      });

      this.photoURIs = [...this.photoURIs, ...assets.map(asset => asset.uri)];
      this.loadedPhotos += assets.length;
      this.totalPhotos = this.MAX_IMAGES === -1 ? totalCount : Math.min(totalCount, this.MAX_IMAGES);
      console.log(`Loaded ${this.loadedPhotos} photos out of ${this.totalPhotos}`);

      if (onProgress) {
        onProgress(this.getProgress());
      }

      endCursor = newEndCursor;
      hasMorePhotos = hasNextPage && (this.MAX_IMAGES === -1 || this.loadedPhotos < this.MAX_IMAGES);
    }

    // Modified log message to handle unlimited case
    if (this.loadedPhotos >= this.MAX_IMAGES && this.MAX_IMAGES !== -1) {
      console.log(`Reached the maximum limit of ${this.MAX_IMAGES} images.`);
    }
  }

  /**
   * Gets the loading progress as a value between 0 and 1.
   * @returns Progress value.
   */
  private getProgress(): number {
    if (this.totalPhotos === 0) return 0;
    return this.loadedPhotos / this.totalPhotos;
  }

  /**
   * Returns the loaded photo URIs.
   * @returns Array of photo URIs.
   */
  getPhotoURIs(): string[] {
    return this.photoURIs;
  }
}

export default PhotoLoader;
