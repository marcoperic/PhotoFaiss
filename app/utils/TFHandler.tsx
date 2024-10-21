import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import { decodeJpeg } from '@tensorflow/tfjs-react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as mobilenet from '@tensorflow-models/mobilenet';

/**
 * TFHandler is responsible for initializing TensorFlow.js,
 * loading the MobileNet model, and extracting features from images.
 */
class TFHandler {
  private model: mobilenet.MobileNet | null;

  constructor() {
    this.model = null;
  }

  /**
   * Initializes TensorFlow.js and loads the MobileNet model.
   */
  async init() {
    try {
      // Wait for TensorFlow.js to be ready
      await tf.ready();
      console.log('TensorFlow.js is ready.');

      // Load the MobileNet model
      this.model = await mobilenet.load();
      console.log('MobileNet model loaded successfully.');
    } catch (error) {
      console.error('Error loading MobileNet model:', error);
      throw error;
    }
  }

  /**
   * Preprocesses the image by resizing and normalizing.
   * @param uri - The URI of the image to preprocess.
   * @returns A tensor suitable for MobileNet input.
   */
  private async preprocessImage(uri: string): Promise<tf.Tensor> {
    let normalized: tf.Tensor | null = null;
    let imageTensor: tf.Tensor | null = null;
    try {
      // Resize the image to 224x224 pixels
      const { uri: resizedUri } = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 224, height: 224 } }]
      );

      // Read the resized image as a base64 string
      const imgB64 = await FileSystem.readAsStringAsync(resizedUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 string to a Uint8Array
      const imgBuffer = tf.util.encodeString(imgB64, 'base64').buffer;
      const raw = new Uint8Array(imgBuffer);

      // Decode the JPEG image to a tensor
      imageTensor = decodeJpeg(raw);

      // Normalize the image tensor
      normalized = tf.div(tf.sub(imageTensor, 127.5), 127.5);

      // Expand dimensions to match MobileNet's expected input shape
      return normalized.expandDims(0);
    } catch (error) {
      console.error('Error in preprocessImage:', error);
      throw error;
    } finally {
      // Dispose intermediate tensors
      if (imageTensor) {
        imageTensor.dispose();
      }
      if (normalized) {
        normalized.dispose();
      }
    }
  }

  /**
   * Extracts features from an image using the MobileNet model.
   * @param uri - The URI of the image.
   * @returns A promise that resolves to an array of feature numbers.
   */
  async extract_features(uri: string): Promise<number[]> {
    if (!this.model) {
      throw new Error('Model not initialized. Call init() first.');
    }

    let preprocessedImage: tf.Tensor | null = null;
    let activation: tf.Tensor | null = null;
    try {
      // Preprocess the image
      preprocessedImage = await this.preprocessImage(uri);

      // Extract features using MobileNet's default embedding
      activation = this.model.infer(preprocessedImage, false) as tf.Tensor;

      // Convert tensor to array
      const features = Array.from(activation.dataSync());

      console.info(`Extracted features for image: ${uri}`);
      return features;
    } catch (error) {
      console.error(`Error extracting features from ${uri}:`, error);
      throw error;
    } finally {
      // Dispose tensors to free memory
      if (preprocessedImage) {
        preprocessedImage.dispose();
      }
      if (activation) {
        activation.dispose();
      }
    }
  }
}

export default TFHandler;
