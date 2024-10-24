import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import * as mobilenet from '@tensorflow-models/mobilenet';
import { bundleResourceIO } from '@tensorflow/tfjs-react-native';
import * as FileSystem from 'expo-file-system';
import * as jpeg from 'jpeg-js';
import * as ImageManipulator from 'expo-image-manipulator';

export class TFHandler {
  private model: mobilenet.MobileNet | null = null;
  private isModelReady: boolean = false;

  constructor() {
    this.init();
  }

  /**
   * Initialize TensorFlow.js and load the MobileNet model.
   */
  public async init() {
    await tf.ready();
    console.log('TensorFlow.js is ready.');

    // Load the MobileNet model from the mobilenet package
    this.model = await mobilenet.load({
      version: 2,
      alpha: 1.0, // You can choose version and alpha based on your requirements
    });

    this.isModelReady = true;
    console.log('MobileNet model loaded.');
  }

  /**
   * Preprocess a single image.
   * @param imageUri URI of the image to preprocess.
   * @returns Tensor3D of the preprocessed image.
   */
  private async preprocessImage(imageUri: string): Promise<{ preprocessedImage: tf.Tensor3D, base64: string }> {
    try {
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 224, height: 224 } }],
        { format: ImageManipulator.SaveFormat.JPEG }
      );

      const imgB64 = await FileSystem.readAsStringAsync(manipulatedImage.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const imgBuffer = tf.util.encodeString(imgB64, 'base64').buffer;
      const raw = new Uint8Array(imgBuffer);
      const { width, height, data } = jpeg.decode(raw, { useTArray: true });

      let imgTensor = tf.tensor3d(data, [height, width, 4]);
      imgTensor = imgTensor.slice([0, 0, 0], [-1, -1, 3]);
      imgTensor = tf.image.resizeBilinear(imgTensor, [224, 224]);
      imgTensor = imgTensor.toFloat().div(tf.scalar(127)).sub(tf.scalar(1));

      return { preprocessedImage: imgTensor, base64: imgB64 };
    } catch (error) {
      console.error('Error preprocessing image:', error);
      throw error;
    }
  }

  /**
   * Extract features from a single image.
   * @param imageUri URI of the image.
   * @returns Tensor of extracted features.
   */
  public async extractFeatures(imageUri: string): Promise<{ features: tf.Tensor | null, base64: string | null }> {
    if (!this.isModelReady || !this.model) {
      console.warn('Model is not ready yet.');
      return { features: null, base64: null };
    }

    try {
      const { preprocessedImage, base64 } = await this.preprocessImage(imageUri);
      console.log('Preprocessed image shape:', preprocessedImage.shape);
      
      const features = this.model.infer(preprocessedImage, true) as tf.Tensor;
      console.log('Extracted features shape:', features.shape);
      
      // Get the actual size of the first dimension
      const [firstDim] = features.shape;
      // Take min between 5 and actual size
      const sampleSize = Math.min(5, firstDim);
      
      const sampleValues = await features.slice([0], [sampleSize]).data();
      console.log('Sample feature values:', Array.from(sampleValues));
      
      preprocessedImage.dispose();
      return { features: features.flatten(), base64 };
    } catch (error) {
      console.error('Error extracting features:', error);
      return { features: null, base64: null };
    }
  }

  /**
   * Extract features from multiple images in batches.
   * @param imageUris Array of image URIs.
   * @param batchSize Number of images to process per batch.
   * @returns Array of feature tensors.
   */
  public async extractFeaturesBatch(
    imageUris: string[],
    batchSize: number = 2
  ): Promise<tf.Tensor[]> {
    if (!this.isModelReady || !this.model) {
      console.warn('Model is not ready yet.');
      return [];
    }

    const features: tf.Tensor[] = [];
    const totalImages = imageUris.length;

    for (let i = 0; i < totalImages; i += batchSize) {
      const batchUris = imageUris.slice(i, i + batchSize);
      console.log(`Processing batch ${i / batchSize + 1} (${batchUris.length} images)`);

      const preprocessedImagesPromises = batchUris.map((uri) => this.preprocessImage(uri));
      const preprocessedImages = await Promise.all(preprocessedImagesPromises);
      const batchedImages = tf.stack(preprocessedImages);

      const batchFeatures = this.model.infer(batchedImages, true) as tf.Tensor;
      features.push(batchFeatures);

      // Dispose tensors to free memory
      batchedImages.dispose();
      preprocessedImages.forEach((tensor) => tensor.dispose());
    }

    return features;
  }

  /**
   * Dispose the model and tensors to free up memory.
   */
  public dispose() {
    if (this.model) {
      this.model = null;
    }
    tf.disposeVariables();
    console.log('Disposed TensorFlow model and variables.');
  }
}
