import React, { useState, useEffect, useCallback } from 'react';
import { Button, StyleSheet, Image, Dimensions, View, Platform, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import PhotoLoader from './utils/PhotoLoader';
import { TFHandler } from './utils/TFHandler';

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
  const [recentImages, setRecentImages] = useState<{ uri: string, base64: string }[]>([]);

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
          })
        ]);
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

  const extractFeatures = useCallback(async () => {
    if (!photoLoader || !tfHandler || !modelLoaded) return;

    const uriList = photoLoader.getPhotoURIs();
    const total = uriList.length;
    const extractedFeatures: number[][] = [];
    const recentProcessed: { uri: string, base64: string }[] = [];

    setFeatureLoadingProgress(0);

    try {
      const BATCH_SIZE = 2;
      const batchResults = await tfHandler.extractFeaturesBatch(uriList, BATCH_SIZE);

      for (let i = 0; i < batchResults.length; i++) {
        const { features: featureTensor, base64, uri } = batchResults[i];
        try {
          const featureArray = Array.from(await featureTensor.dataSync());
          extractedFeatures.push(featureArray);
          
          // Update recent images
          recentProcessed.unshift({ uri, base64 });
          if (recentProcessed.length > 2) {
            recentProcessed.pop();
          }
          setRecentImages(recentProcessed);
        } catch (error) {
          console.error(`Error processing feature tensor for ${uri}:`, error);
        } finally {
          // Clean up tensor
          featureTensor.dispose();
        }
        
        // Update progress based on total images, not just successful ones
        setFeatureLoadingProgress((i + 1) / total);
      }

      setFeatures(extractedFeatures);
      console.log(`Feature extraction completed. Successfully processed ${extractedFeatures.length} out of ${total} images.`);
    } catch (error) {
      console.error('Error in batch processing:', error);
    }
  }, [photoLoader, tfHandler, modelLoaded]);

  const renderContent = () => (
    <>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.progressContainer}>
          <ThemedText style={styles.sectionTitle}>Photo Loading Progress</ThemedText>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${photoLoadingProgress * 100}%` }]} />
          </View>
          <ThemedText>
            {photoLoadingProgress < 1 ? `Loading Photos: ${(photoLoadingProgress * 100).toFixed(0)}%` : 'Photos Loaded'}
          </ThemedText>
        </View>
        <View style={styles.progressContainer}>
          <ThemedText style={styles.sectionTitle}>Feature Extraction Progress</ThemedText>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${featureLoadingProgress * 100}%`, backgroundColor: '#2196f3' }]} />
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
            name={modelLoaded ? "checkmark-circle" : "ellipsis-horizontal-circle"} 
            size={24} 
            color={modelLoaded ? "#4caf50" : "#ffa000"} 
          />
          <ThemedText>{modelLoaded ? "Model Loaded" : "Loading Model"}</ThemedText>
        </View>
        <Button title="Extract Features" onPress={extractFeatures} disabled={!modelLoaded || (featureLoadingProgress > 0 && featureLoadingProgress < 1)} />
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
      </ScrollView>
    </>
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Photo Gallery</ThemedText>
      {permissionDenied && !isWeb ? (
        <ThemedText>Permission to access media library was denied.</ThemedText>
      ) : (
        renderContent()
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
  },
  recentImage: {
    width: width * 0.4,
    height: width * 0.4,
    borderRadius: 8,
    marginHorizontal: 5,
  },
  imageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
});
