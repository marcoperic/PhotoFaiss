import React, { useState, useEffect, useCallback } from 'react';
import { Button, StyleSheet, Dimensions, View, ScrollView, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import PhotoLoader from './utils/PhotoLoader';
import ImageProcessor from './utils/ImageProcessor';
import APIClient from './utils/APIClient';
import TFHandler from './utils/TFHandler';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const [photoLoader, setPhotoLoader] = useState<PhotoLoader | null>(null);
  const [photoLoadingProgress, setPhotoLoadingProgress] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isWeb, setIsWeb] = useState(false);
  const [queryImage, setQueryImage] = useState<string | null>(null);
  const [similarImages, setSimilarImages] = useState<string[]>([]);
  const [tfHandler, setTfHandler] = useState<TFHandler | null>(null);
  const [isSearching, setIsSearching] = useState(false);

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

      try {
        await loader.initialize((progress: number) => setPhotoLoadingProgress(progress));
      } catch (error) {
        console.error('Error initializing:', error);
        if (Platform.OS !== 'web') {
          setPermissionDenied(true);
        }
      }

      const tf = new TFHandler();
      await tf.init();
      setTfHandler(tf);
    };

    initializeHandlers();
  }, []);

  const processImages = useCallback(async () => {
    if (!photoLoader) return;

    const uriList = photoLoader.getPhotoURIs();
    const total = uriList.length;
    let processed = 0;

    setProcessingProgress(0);
    console.log('Starting image preprocessing...');

    try {
      const imageProcessor = new ImageProcessor();
      const apiClient = new APIClient();

      console.log(`Processing ${total} images...`);
      const { uri: zipUri, size: zipSize } = await imageProcessor.createImageZip(uriList);
      console.log(`Created zip file of size: ${(zipSize / (1024 * 1024)).toFixed(2)} MB`);
      
      const response = await apiClient.uploadImages(zipUri);
      const result = await response.json();
      
      console.log('Upload completed:', result);
      setProcessingProgress(1);

      await FileSystem.deleteAsync(zipUri);

    } catch (error) {
      console.error('Error processing images:', error);
      setProcessingProgress(0);
    }
  }, [photoLoader]);

  const selectQueryImage = useCallback(async () => {
    if (!tfHandler) {
      console.error('TFHandler is not initialized.');
      return;
    }

    // Request permission if not granted
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      alert('Permission to access media library is required!');
      return;
    }

    // Launch image picker to select an image
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (!result.canceled && result.assets.length > 0) {
      const selectedUri = result.assets[0].uri;
      setQueryImage(selectedUri);
      setSimilarImages([]);
      setIsSearching(true);

      try {
        // Preprocess the selected image (resize and compress)
        const processedImage = await ImageManipulator.manipulateAsync(
          selectedUri,
          [{ resize: { width: 224, height: 224 } }],
          { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );

        // Upload the preprocessed image to the server for searching
        const apiClient = new APIClient();
        const searchResult = await apiClient.searchSimilarImages(processedImage.uri, 5);
        console.log('Search results:', searchResult);

        setSimilarImages(searchResult.similar_images);
      } catch (error) {
        console.error('Error during similarity search:', error);
      } finally {
        setIsSearching(false);
      }
    }
  }, [tfHandler]);

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
          <ThemedText style={styles.sectionTitle}>Processing Progress</ThemedText>
          <View style={styles.progressBarContainer}>
            <View style={[
              styles.progressBar, 
              { 
                width: `${processingProgress * 100}%`, 
                backgroundColor: processingProgress < 1 ? '#2196f3' : '#4caf50' 
              }]} 
            />
          </View>
          <ThemedText>
            {processingProgress > 0 && processingProgress < 1
              ? `Processing Images: ${(processingProgress * 100).toFixed(0)}%`
              : processingProgress === 1
              ? 'Processing Completed'
              : ''}
          </ThemedText>
        </View>
        <Button 
          title="Process Images" 
          onPress={processImages} 
          disabled={processingProgress > 0 && processingProgress < 1} 
        />
        <ThemedText style={styles.note}>
          Processing a maximum of 500 images.
        </ThemedText>

        {/* New Section for Similarity Search */}
        <View style={styles.searchContainer}>
          <Button 
            title="Search Similar Photos" 
            onPress={selectQueryImage} 
            disabled={processingProgress < 1 || isSearching}
          />
          {isSearching && (
            <ActivityIndicator size="large" color="#0000ff" style={styles.loader} />
          )}
          {queryImage && (
            <View style={styles.queryImageContainer}>
              <ThemedText style={styles.sectionTitle}>Query Image:</ThemedText>
              <Image source={{ uri: queryImage }} style={styles.queryImage} />
            </View>
          )}
          {similarImages.length > 0 && (
            <View style={styles.resultsContainer}>
              <ThemedText style={styles.sectionTitle}>Similar Images:</ThemedText>
              <ScrollView horizontal>
                {similarImages.map((uri, index) => (
                  <Image key={index} source={{ uri }} style={styles.similarImage} />
                ))}
              </ScrollView>
            </View>
          )}
        </View>
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
  note: {
    marginTop: 10,
    fontSize: 14,
    color: '#555',
  },
  searchContainer: {
    width: '100%',
    marginTop: 30,
    alignItems: 'center',
  },
  queryImageContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  queryImage: {
    width: 150,
    height: 150,
    borderRadius: 10,
    marginTop: 10,
  },
  resultsContainer: {
    marginTop: 20,
    width: '100%',
  },
  similarImage: {
    width: 100,
    height: 100,
    borderRadius: 10,
    marginRight: 10,
  },
  loader: {
    marginTop: 10,
  },
});
