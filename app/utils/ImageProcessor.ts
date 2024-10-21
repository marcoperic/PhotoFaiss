import * as tf from '@tensorflow/tfjs';
import { bundleResourceIO, decodeJpeg } from '@tensorflow/tfjs-react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as mobilenet from '@tensorflow-models/mobilenet';

class ImageProcessor {
  private model: mobilenet.MobileNet | null;
  private images: MediaLibrary.Asset[];
  private features: number[][];

  constructor() {
    this.model = null;
    this.images = [];
    this.features = [];
  }

  async initialize() {
    await tf.ready();
    this.model = await this.loadModel();
    await this.loadAllImages();
  }

  async loadModel() {
    return await mobilenet.load();
  }

  async loadAllImages() {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Permission to access media library was denied');
    }

    let hasMoreImages = true;
    let endCursor: string | undefined = undefined;
    while (hasMoreImages) {
      const { assets, endCursor: newEndCursor, hasNextPage } = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        after: endCursor,
        first: 1000, // Fetch in batches of 1000
      });
      this.images = [...this.images, ...assets];
      endCursor = newEndCursor;
      hasMoreImages = hasNextPage;
    }
  }

  async preprocessImage(uri: string): Promise<tf.Tensor> {
    let normalized: tf.Tensor | null = null;
    let imageTensor: tf.Tensor | null = null;
    try {
      const { uri: resizedUri } = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 224, height: 224 } }],
        { format: ImageManipulator.SaveFormat.JPEG }
      );

      const imgB64 = await FileSystem.readAsStringAsync(resizedUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const imgBuffer = tf.util.encodeString(imgB64, 'base64').buffer;
      const raw = new Uint8Array(imgBuffer);
      imageTensor = decodeJpeg(raw);

      normalized = tf.div(tf.sub(imageTensor, 127.5), 127.5);
      return normalized.expandDims(0);
    } catch (error) {
      console.error('Error in preprocessImage:', error);
      throw error;
    } finally {
      if (imageTensor) {
        imageTensor.dispose();
      }
      if (normalized) {
        normalized.dispose();
      }
    }
  }

  async extractFeatures(imageTensor: tf.Tensor): Promise<number[]> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    let featuresTensor: tf.Tensor | null = null;
    try {
      featuresTensor = this.model.infer(imageTensor, true) as tf.Tensor;
      return Array.from(featuresTensor.dataSync());
    } catch (error) {
      console.error('Error in extractFeatures:', error);
      throw error;
    } finally {
      if (featuresTensor) {
        featuresTensor.dispose();
      }
    }
  }

  async processAllImages() {
    this.features = [];
    for (const image of this.images) {
      const preprocessed = await this.preprocessImage(image.uri);
      const imageFeatures = await this.extractFeatures(preprocessed);
      this.features.push(imageFeatures);
      preprocessed.dispose(); // Dispose preprocessed tensor
    }
  }

  findSimilarImages(queryIndex: number, k = 10) {
    if (this.features.length === 0) return [];

    const queryFeatures = this.features[queryIndex];
    const distances = this.features.map((f, i) => ({
      index: i,
      distance: this.euclideanDistance(queryFeatures, f),
    }));

    distances.sort((a, b) => a.distance - b.distance);
    return distances.slice(1, k + 1).map(d => this.images[d.index]);
  }

  euclideanDistance(a: number[], b: number[]) {
    return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
  }

  getFeatures(): number[][] {
    return this.features;
  }
}

export default ImageProcessor;
