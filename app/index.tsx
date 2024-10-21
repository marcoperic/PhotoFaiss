import React, { useState, useEffect, useCallback } from 'react';
import { Button, StyleSheet, Image, Dimensions, View, Platform, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import PhotoLoader from './utils/PhotoLoader';
import TFHandler from './utils/TFHandler';

const { width } = Dimensions.get('window');
const imageSize = width * 0.8;

const App = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [photoLoader, setPhotoLoader] = useState<PhotoLoader | null>(null);
  const [tfHandler, setTfHandler] = useState<TFHandler | null>(null);
  const [photoLoadingProgress, setPhotoLoadingProgress] = useState(0);
  const [featureLoadingProgress, setFeatureLoadingProgress] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isWeb, setIsWeb] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [features, setFeatures] = useState<number[][]>([]);
  
  // New state variables for debugging
  const [currentProcessingUri, setCurrentProcessingUri] = useState<string | null>(null);
  const [currentFeatures, setCurrentFeatures] = useState<number[] | null>(null);

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
        // Initialize PhotoLoader and TFHandler concurrently
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
  }, []);

  const extractFeatures = useCallback(async () => {
    if (!photoLoader || !tfHandler || !modelLoaded) return;

    const uriList = photoLoader.getPhotoURIs();
    const total = uriList.length;
    let processed = 0;
    const extractedFeatures: number[][] = [];

    setFeatureLoadingProgress(0);

    for (const uri of uriList) {
      try {
        setCurrentProcessingUri(uri); // Set current processing URI
        const feature = await tfHandler.extract_features(uri);
        extractedFeatures.push(feature);
        setCurrentFeatures(feature); // Set current features
        console.info(`Extracted features for image: ${uri}`);
      } catch (error) {
        console.error(`Error extracting features from ${uri}:`, error);
      }
      processed += 1;
      setFeatureLoadingProgress(processed / total);
    }

    setFeatures(extractedFeatures);
    console.log('Feature extraction completed.');
    setCurrentProcessingUri(null);
    setCurrentFeatures(null);
  }, [photoLoader, tfHandler, modelLoaded]);

  const renderDebugView = () => {
    if (!currentProcessingUri) return null;

    return (
      <View style={styles.debugContainer}>
        <ThemedText style={styles.debugTitle}>Processing Image:</ThemedText>
        <Image source={{ uri: currentProcessingUri }} style={styles.debugImage} />
        {currentFeatures && (
          <ScrollView style={styles.featuresScroll}>
            <ThemedText style={styles.debugFeaturesTitle}>Extracted Features:</ThemedText>
            <ThemedText style={styles.debugFeaturesText}>
              {currentFeatures.slice(0, 100).join(', ')}...
            </ThemedText>
          </ScrollView>
        )}
      </View>
    );
  };

  const renderContent = () => (
    <>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Existing Progress Views */}
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
            name="checkmark-circle" 
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

        {/* Render Debug View */}
        {renderDebugView()}
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
};

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

  // Styles for Debug View
  debugContainer: {
    marginTop: 20,
    width: '100%',
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
  },
  debugTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  debugImage: {
    width: imageSize,
    height: imageSize,
    resizeMode: 'cover',
    borderRadius: 8,
    marginBottom: 10,
  },
  featuresScroll: {
    maxHeight: 150,
  },
  debugFeaturesTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  debugFeaturesText: {
    fontSize: 14,
    color: '#555',
  },
});

export default App;
