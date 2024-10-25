import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as FileSystem from 'expo-file-system';
import * as jpeg from 'jpeg-js';
import * as ImageManipulator from 'expo-image-manipulator';
import { logMemoryUsage } from './memoryUtils';

export class TFHandler {
  private model: mobilenet.MobileNet | null = null;
  private isModelReady: boolean = false;

  constructor() {
    // Initialization is handled externally
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
   * @returns Tensor3D of the preprocessed image and its base64 representation.
   */
  private async preprocessImage(imageUri: string): Promise<{ preprocessedImage: tf.Tensor, base64: string }> {
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

      // Wrap tensor operations in tf.tidy to automatically clean up intermediate tensors
      const preprocessedImage = tf.tidy(() => {
        const imgTensor = tf.tensor3d(data, [height, width, 4]);
        const slicedTensor = imgTensor.slice([0, 0, 0], [-1, -1, 3]);
        const resizedTensor = tf.image.resizeBilinear(slicedTensor, [224, 224]);
        return resizedTensor.toFloat().div(tf.scalar(127)).sub(tf.scalar(1));
      });

      return { preprocessedImage, base64: imgB64 };
    } catch (error) {
      console.error('Error preprocessing image:', error);
      throw error;
    }
  }

  /**
   * Extract features from a single image.
   * @param imageUri URI of the image.
   * @returns Flattened tensor of extracted features and the image's base64 string.
   */
  public async extractFeatures(imageUri: string): Promise<{ features: tf.Tensor | null, base64: string | null }> {
    if (!this.isModelReady || !this.model) {
      console.warn('Model is not ready yet.');
      return { features: null, base64: null };
    }

    try {
      const { preprocessedImage, base64 } = await this.preprocessImage(imageUri);
      console.log('Preprocessed image shape:', preprocessedImage.shape);
      
      // Wrap the inference in tf.tidy to automatically clean up intermediate tensors
      const features = tf.tidy(() => {
        const extracted = this.model!.infer(preprocessedImage, true) as tf.Tensor;
        return extracted.clone(); // Clone to preserve the features outside of tidy
      });
      
      // Dispose of the preprocessed image immediately
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
   * @returns Array of feature tensors along with base64 and URI.
   */
  public async extractFeaturesBatch(
    imageUris: string[],
    batchSize: number = 2
  ): Promise<{ features: number[], base64: string, uri: string }[]> {
    if (!this.isModelReady || !this.model) {
      console.warn('Model is not ready yet.');
      return [];
    }

    const results: { features: number[], base64: string, uri: string }[] = [];
    const totalImages = imageUris.length;

    try {
      for (let i = 0; i < totalImages; i += batchSize) {
        const batchUris = imageUris.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1} (${batchUris.length} images)`);

        // Log memory usage every 5 batches
        if (i % (batchSize * 5) === 0) {
          console.log(`\nMemory status after ${i} images:`);
          logMemoryUsage();
          console.log(`TensorFlow.js memory:`, tf.memory());
        }

        // Process each image in the batch
        const preprocessedResults = await Promise.all(
          batchUris.map(async (uri) => {
            try {
              const result = await this.preprocessImage(uri);
              return { ...result, uri, success: true };
            } catch (error) {
              console.error(`Failed to preprocess image ${uri}:`, error);
              return { success: false, uri };
            }
          })
        );

        // Extract features and immediately convert to regular arrays
        for (const result of preprocessedResults) {
          if ('preprocessedImage' in result) {
            const features = tf.tidy(() => {
              const extracted = this.model!.infer(result.preprocessedImage, true) as tf.Tensor;
              return extracted.dataSync(); // Convert to regular array immediately
            });
            
            results.push({
              features: Array.from(features),
              base64: result.base64,
              uri: result.uri
            });
            
            // Dispose of the preprocessed image immediately
            result.preprocessedImage.dispose();
          }
        }

        // Force garbage collection between batches
        tf.engine().startScope();
        tf.engine().endScope();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Log memory after garbage collection
        if (i % (batchSize * 5) === 0) {
          console.log(`\nMemory status after GC:`);
          logMemoryUsage();
          console.log(`TensorFlow.js tensors:`, tf.memory().numTensors);
        }
      }
    } finally {
      tf.engine().endScope();
    }

    return results;
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
