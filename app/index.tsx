import React, { useState, useEffect, useCallback } from 'react';
import { Button, StyleSheet, Image, Dimensions, View, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import PhotoLoader from './utils/PhotoLoader';

const { width } = Dimensions.get('window');
const imageSize = width * 0.8; // 80% of screen width

export default function HomeScreen() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [photoLoader, setPhotoLoader] = useState<PhotoLoader | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isWeb, setIsWeb] = useState(false);

  useEffect(() => {
    const initializePhotoLoader = async () => {
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
        await loader.initialize();
        setLoadingProgress(1);
      } catch (error) {
        console.error('Error initializing PhotoLoader:', error);
        if (Platform.OS !== 'web') {
          setPermissionDenied(true);
        }
      }
    };

    initializePhotoLoader();
  }, []);

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
    }
  }, []);

  const renderContent = () => (
    <>
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBar, { width: `${loadingProgress * 100}%` }]} />
      </View>
      <ThemedText>
        {loadingProgress < 1 ? 'Loading photos...' : 'Photos loaded!'}
      </ThemedText>
      <Button title="Select Photo" onPress={pickImage} disabled={loadingProgress < 1} />
      {selectedImage && (
        <Image source={{ uri: selectedImage }} style={styles.image} />
      )}
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
    justifyContent: 'center',
    padding: 20,
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
  progressBarContainer: {
    width: '100%',
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4caf50',
    borderRadius: 5,
  },
});
