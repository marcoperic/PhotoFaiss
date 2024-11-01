import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import JSZip from 'jszip';

/**
 * A utility class for processing and zipping images efficiently.
 */
class ImageProcessor {
  // Maximum number of concurrent image processing tasks
  private readonly MAX_CONCURRENT = 4;

  /**
   * Preprocesses a single image by resizing and compressing.
   * @param uri - The URI of the image.
   * @returns The URI of the preprocessed image.
   */
  async preprocessImage(uri: string): Promise<string> {
    console.log(`Preprocessing image: ${uri}`);
    const { uri: resizedUri } = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 224, height: 224 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );
    console.log(`Finished preprocessing: ${uri}`);
    return resizedUri;
  }

  /**
   * Creates a zip archive of preprocessed images with parallel processing.
   * Includes a manifest.json mapping processed filenames to original URIs.
   * @param imageUris - An array of image URIs to process and zip.
   * @returns An object containing the URI and size of the created zip file.
   */
  async createImageZip(imageUris: string[]): Promise<{ uri: string; size: number }> {
    const zip = new JSZip();
    const total = imageUris.length;
    const manifest: Record<string, string> = {};

    console.log(`Starting to process ${total} images...`);

    /**
     * Processes a batch of images concurrently.
     * @param batch - An array of image URIs in the current batch.
     * @param batchIndex - The index of the current batch.
     */
    const processBatch = async (batch: string[], batchIndex: number) => {
      const promises = batch.map(async (uri, index) => {
        const currentIndex = batchIndex * this.MAX_CONCURRENT + index;
        const processedFilename = `image_${currentIndex}.jpg`;
        console.log(`Processing image ${currentIndex + 1}/${total}`);
        try {
          const preprocessedUri = await this.preprocessImage(uri);
          const imageData = await FileSystem.readAsStringAsync(preprocessedUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          zip.file(processedFilename, imageData, { base64: true });

          // Add to manifest
          manifest[processedFilename] = uri;

          // Clean up preprocessed image
          await FileSystem.deleteAsync(preprocessedUri, { idempotent: true });
        } catch (error) {
          console.error(`Error processing image ${currentIndex + 1}:`, error);
        }
      });
      await Promise.all(promises);
    };

    // Split image URIs into batches based on MAX_CONCURRENT
    const batches: string[][] = [];
    for (let i = 0; i < imageUris.length; i += this.MAX_CONCURRENT) {
      batches.push(imageUris.slice(i, i + this.MAX_CONCURRENT));
    }

    // Process all batches sequentially
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      await processBatch(batch, batchIndex);
      console.log(`Completed batch ${batchIndex + 1}/${batches.length}`);
    }

    console.log('All images processed, generating zip file...');

    // Add manifest.json to the zip
    zip.file('manifest.json', JSON.stringify(manifest));

    // Generate zip file
    const zipContent = await zip.generateAsync({ type: 'base64' });
    const zipUri = FileSystem.documentDirectory + 'images.zip';
    await FileSystem.writeAsStringAsync(zipUri, zipContent, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log('Zip file generated, checking size...');

    // Get zip file info and calculate size
    const fileInfo = await FileSystem.getInfoAsync(zipUri, { size: true });
    if (!fileInfo.exists || fileInfo.size === undefined) {
      throw new Error('Failed to retrieve zip file information.');
    }
    const sizeInMB = fileInfo.size / (1024 * 1024);

    console.log(`Zip file created successfully. Size: ${sizeInMB.toFixed(2)} MB`);

    return {
      uri: zipUri,
      size: fileInfo.size,
    };
  }
}

export default ImageProcessor;
