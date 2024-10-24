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
    // this.init();
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
   * @returns Array of feature tensors.
   */
  public async extractFeaturesBatch(
    imageUris: string[],
    batchSize: number = 2
  ): Promise<{ features: tf.Tensor, base64: string, uri: string }[]> {
    if (!this.isModelReady || !this.model) {
      console.warn('Model is not ready yet.');
      return [];
    }

    const results: { features: tf.Tensor, base64: string, uri: string }[] = [];
    const totalImages = imageUris.length;

    for (let i = 0; i < totalImages; i += batchSize) {
      const batchUris = imageUris.slice(i, i + batchSize);
      console.log(`Processing batch ${i / batchSize + 1} (${batchUris.length} images)`);

      try {
        // Process each image in the batch
        const preprocessedResults = await Promise.allSettled(
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
        
        // Filter out failed preprocessed images
        const successfulResults = preprocessedResults
          .filter((result): result is PromiseFulfilledResult<{ preprocessedImage: tf.Tensor3D, base64: string, uri: string, success: true }> => 
            result.status === 'fulfilled' && result.value.success
          )
          .map(result => result.value);

        if (successfulResults.length < batchSize) {
          console.log('No images successfully preprocessed in this batch');
          continue;
        }

        // Extract just the tensors for stacking
        const tensors = successfulResults.map(result => result.preprocessedImage);
        
        try {
          // Use tf.tidy to automatically clean up intermediate tensors
          const batchFeatures = tf.tidy(() => {
            const batchedImages = tf.stack(tensors);
            const features = this.model!.infer(batchedImages, true) as tf.Tensor;
            // Split the features back into individual tensors
            return tf.split(features, features.shape[0]);
          });

          // Create results array with features and base64 data
          for (let j = 0; j < successfulResults.length; j++) {
            results.push({
              features: batchFeatures[j],
              base64: successfulResults[j].base64,
              uri: successfulResults[j].uri
            });
          }
        } catch (error) {
          console.error('Error processing batch features:', error);
        } finally {
          // Clean up preprocessed image tensors
          tensors.forEach(tensor => tensor.dispose());
        }

        // Add a small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error processing batch starting at index ${i}:`, error);
      }
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
