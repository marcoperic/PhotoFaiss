import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  StyleSheet,
  Image,
  Dimensions,
  View,
  Platform,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import PhotoLoader from './utils/PhotoLoader';
import { TFHandler } from './utils/TFHandler';
import { logMemoryUsage } from './utils/memoryUtils';

const { width } = Dimensions.get('window');
const imageSize = width * 0.8;

export default function HomeScreen() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [photoLoader, setPhotoLoader] = useState<PhotoLoader | null>(null);
  const [tfHandler, setTfHandler] = useState<TFHandler | null>(null);
  const [photoLoadingProgress, setPhotoLoadingProgress] = useState(0);
  const [featureLoadingProgress, setFeatureLoadingProgress] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isWeb, setIsWeb] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [features, setFeatures] = useState<number[][]>([]);
  const [recentImages, setRecentImages] = useState<{ uri: string; base64: string }[]>([]);
  const [similarImages, setSimilarImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const initializeHandlers = async () => {
      setIsWeb(Platform.OS === 'web');

      if (Platform.OS !== 'web') {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          setPermissionDenied(true);
          return;
        }
      }

      const loader = new PhotoLoader();
      setPhotoLoader(loader);
      const tf = new TFHandler();
      setTfHandler(tf);

      try {
        // Initialize PhotoLoader and wait for TFHandler to load the model
        await Promise.all([
          loader.initialize((progress: number) => setPhotoLoadingProgress(progress)),
          tf.init().then(() => {
            setModelLoaded(true);
          }),
        ]);

        // After initializing, extract features for all photos
        await extractAllFeatures(loader.getPhotoURIs());
      } catch (error) {
        console.error('Error initializing:', error);
        if (Platform.OS !== 'web') {
          setPermissionDenied(true);
        }
      }
    };

    initializeHandlers();

    // Cleanup on unmount
    return () => {
      tfHandler?.dispose();
    };
  }, []);

  /**
   * Extract features for all photos and store them in the state.
   * @param photoURIs Array of photo URIs.
   */
  const extractAllFeatures = async (photoURIs: string[]) => {
    if (!tfHandler || !modelLoaded) return;

    try {
      console.log('\nInitial memory status:');
      logMemoryUsage();

      const batchSize = 2;
      const results = await tfHandler.extractFeaturesBatch(photoURIs, batchSize);
      setFeatures(prevFeatures => [...prevFeatures, ...results.map(r => r.features)]);
      
      console.log('\nFinal memory status:');
      logMemoryUsage();
      
      console.log(`Extracted features for ${results.length} additional images.`);
    } catch (error) {
      console.error('Error extracting all features:', error);
    }
  };

  /**
   * Calculate Euclidean distance between two vectors.
   * @param a First vector.
   * @param b Second vector.
   * @returns Euclidean distance.
   */
  const calculateEuclideanDistance = (a: number[], b: number[]): number => {
    if (a.length !== b.length) {
      console.warn('Vectors have different lengths.');
      return Infinity;
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  };

  /**
   * Find the 5 most similar images based on feature vectors.
   * @param imageUri URI of the selected image.
   */
  const findSimilarImages = async (imageUri: string) => {
    if (!tfHandler || !modelLoaded || features.length === 0) return;

    setIsProcessing(true);
    try {
      const { features: selectedFeatures, base64 } = await tfHandler.extractFeatures(imageUri);
      if (!selectedFeatures) {
        console.error('Failed to extract features for the selected image.');
        setIsProcessing(false);
        return;
      }

      const selectedFeatureArray = Array.from(await selectedFeatures.data());

      const distances: { uri: string; distance: number }[] = features.map((feat, index) => {
        const distance = calculateEuclideanDistance(selectedFeatureArray, feat);
        return { uri: photoLoader!.getPhotoURIs()[index], distance };
      });

      // Sort by distance ascending
      distances.sort((a, b) => a.distance - b.distance);

      // Get top 5 similar images excluding the selected image itself
      const top5 = distances.filter((d) => d.uri !== imageUri).slice(0, 5);

      setSimilarImages(top5.map((d) => d.uri));
      setIsProcessing(false);
    } catch (error) {
      console.error('Error finding similar images:', error);
      setIsProcessing(false);
    }
  };

  const extractFeatures = useCallback(async () => {
    if (!photoLoader || !tfHandler || !modelLoaded) return;

    const uriList = photoLoader.getPhotoURIs();
    const total = uriList.length;
    const extractedFeatures: number[][] = [];
    const recentProcessed: { uri: string; base64: string }[] = [];

    setFeatureLoadingProgress(0);

    try {
      const BATCH_SIZE = 2;
      const batchResults = await tfHandler.extractFeaturesBatch(uriList, BATCH_SIZE);

      for (let i = 0; i < batchResults.length; i++) {
        const { features: featureTensor, base64, uri } = batchResults[i];
        if (featureTensor) {
          const featureArray = Array.from(await featureTensor.data());
          extractedFeatures.push(featureArray);

          // Update recent images
          recentProcessed.unshift({ uri, base64 });
          if (recentProcessed.length > 2) {
            recentProcessed.pop();
          }
          setRecentImages(recentProcessed);
        }

        // Update progress based on total images, not just successful ones
        setFeatureLoadingProgress((i + 1) / total);
      }

      setFeatures(extractedFeatures);
      console.log(
        `Feature extraction completed. Successfully processed ${extractedFeatures.length} out of ${total} images.`
      );
    } catch (error) {
      console.error('Error in batch processing:', error);
    }
  }, [photoLoader, tfHandler, modelLoaded]);

  const renderSimilarImages = () => {
    if (similarImages.length === 0) return null;

    return (
      <View style={styles.similarImagesContainer}>
        <ThemedText style={styles.sectionTitle}>Top 5 Similar Images</ThemedText>
        <View style={styles.similarImagesGrid}>
          {similarImages.map((uri, index) => (
            <Image
              key={index}
              source={{ uri }}
              style={styles.similarImage}
              resizeMode="cover"
            />
          ))}
        </View>
      </View>
    );
  };

  const renderContent = () => (
    <>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.progressContainer}>
          <ThemedText style={styles.sectionTitle}>Photo Loading Progress</ThemedText>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${photoLoadingProgress * 100}%` }]} />
          </View>
          <ThemedText>
            {photoLoadingProgress < 1
              ? `Loading Photos: ${(photoLoadingProgress * 100).toFixed(0)}%`
              : 'Photos Loaded'}
          </ThemedText>
        </View>
        <View style={styles.progressContainer}>
          <ThemedText style={styles.sectionTitle}>Feature Extraction Progress</ThemedText>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${featureLoadingProgress * 100}%`, backgroundColor: '#2196f3' },
              ]}
            />
          </View>
          <ThemedText>
            {featureLoadingProgress > 0 && featureLoadingProgress < 1
              ? `Extracting Features: ${(featureLoadingProgress * 100).toFixed(0)}%`
              : featureLoadingProgress === 1
              ? 'Feature Extraction Completed'
              : ''}
          </ThemedText>
        </View>
        <View style={styles.modelIndicator}>
          <Ionicons
            name={modelLoaded ? 'checkmark-circle' : 'ellipsis-horizontal-circle'}
            size={24}
            color={modelLoaded ? '#4caf50' : '#ffa000'}
          />
          <ThemedText>{modelLoaded ? 'Model Loaded' : 'Loading Model'}</ThemedText>
        </View>
        <Button
          title="Extract Features"
          onPress={extractFeatures}
          disabled={!modelLoaded || (featureLoadingProgress > 0 && featureLoadingProgress < 1)}
        />
        {features.length > 0 && (
          <ThemedText style={styles.featuresText}>
            Extracted features for {features.length} images.
          </ThemedText>
        )}
        {recentImages.length > 0 && (
          <View style={styles.recentImagesContainer}>
            <ThemedText style={styles.sectionTitle}>Recently Processed Images</ThemedText>
            <View style={styles.recentImagesGrid}>
              {recentImages.map((img, index) => (
                <View key={index} style={styles.imageContainer}>
                  <Image
                    source={{ uri: img.uri }}
                    style={styles.recentImage}
                    resizeMode="cover"
                  />
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${img.base64}` }}
                    style={styles.recentImage}
                    resizeMode="cover"
                  />
                </View>
              ))}
            </View>
          </View>
        )}
        <View style={styles.selectButtonContainer}>
          <TouchableOpacity style={styles.selectButton} onPress={pickImage}>
            <Ionicons name="images" size={24} color="#fff" />
            <ThemedText style={styles.selectButtonText}>
              Select Image for Similarity Search
            </ThemedText>
          </TouchableOpacity>
        </View>
        {isProcessing && (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color="#2196f3" />
            <ThemedText>Processing...</ThemedText>
          </View>
        )}
        {renderSimilarImages()}
      </ScrollView>
    </>
  );

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setSelectedImage(uri);
      await findSimilarImages(uri);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Photo Gallery</ThemedText>
      {permissionDenied && !isWeb ? (
        <ThemedText>Permission to access media library was denied.</ThemedText>
      ) : (
        renderContent()
      )}
      {selectedImage && (
        <View style={styles.selectedImageContainer}>
          <ThemedText style={styles.sectionTitle}>Selected Image</ThemedText>
          <Image
            source={{ uri: selectedImage }}
            style={styles.selectedImage}
            resizeMode="cover"
          />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
  },
  scrollContainer: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  image: {
    width: imageSize,
    height: imageSize,
    marginTop: 20,
    borderRadius: 10,
  },
  progressContainer: {
    width: '100%',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: 5,
    fontWeight: '600',
  },
  progressBarContainer: {
    width: '100%',
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    marginBottom: 5,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4caf50',
    borderRadius: 5,
  },
  modelIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  featuresText: {
    marginTop: 10,
    fontStyle: 'italic',
  },
  recentImagesContainer: {
    width: '100%',
    marginTop: 20,
  },
  recentImagesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    flexWrap: 'wrap',
  },
  recentImage: {
    width: width * 0.4,
    height: width * 0.4,
    borderRadius: 8,
    margin: 5,
  },
  imageContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 10,
  },
  selectButtonContainer: {
    marginTop: 30,
    width: '100%',
    alignItems: 'center',
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196f3',
    padding: 15,
    borderRadius: 10,
  },
  selectButtonText: {
    color: '#fff',
    marginLeft: 10,
    fontSize: 16,
  },
  similarImagesContainer: {
    width: '100%',
    marginTop: 20,
  },
  similarImagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  similarImage: {
    width: width * 0.3,
    height: width * 0.3,
    borderRadius: 8,
    margin: 5,
  },
  selectedImageContainer: {
    width: '100%',
    marginTop: 20,
    alignItems: 'center',
  },
  selectedImage: {
    width: width * 0.5,
    height: width * 0.5,
    borderRadius: 10,
    marginTop: 10,
  },
  processingContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
});
