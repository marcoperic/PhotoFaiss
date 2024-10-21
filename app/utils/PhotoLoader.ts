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

  async initialize() {
    await this.loadAllPhotos();
  }

  async loadAllPhotos() {
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
        first: 1000, // Fetch in batches of 1000
      });
      this.photoURIs = [...this.photoURIs, ...assets.map(asset => asset.uri)];
      this.loadedPhotos += assets.length;
      this.totalPhotos = totalCount;
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
