import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, StyleSheet, Image, Dimensions, View, Platform, ScrollView, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import PhotoLoader from './utils/PhotoLoader';
import TFHandler from './utils/TFHandler';

const { width } = Dimensions.get('window');
const imageSize = width * 0.8;

// Approximate Nearest Neighbors Class using LSH
class ApproximateNearestNeighbors {
  private hashTables: Map<string, number[]>[];
  private numHashTables: number;
  private hashSize: number;
  private dimensionality: number;
  private randomVectors: number[][];

  constructor(dimensionality: number, numHashTables: number = 5, hashSize: number = 10) {
    this.dimensionality = dimensionality;
    this.numHashTables = numHashTables;
    this.hashSize = hashSize;
    this.hashTables = [];
    this.randomVectors = [];

    // Initialize hash tables and random vectors
    for (let i = 0; i < this.numHashTables; i++) {
      this.hashTables.push(new Map());
      this.randomVectors.push(this.generateRandomVector());
    }
  }

  // Generates a random vector with elements from a uniform distribution [-1, 1]
  private generateRandomVector(): number[] {
    return Array.from({ length: this.dimensionality }, () => Math.random() * 2 - 1);
  }

  // Computes the hash key for a given vector in a specific hash table
  private computeHash(vector: number[], tableIndex: number): string {
    const dotProducts = this.randomVectors[tableIndex].map((rv) => this.dotProduct(vector, rv));
    const hash = dotProducts.map((dp) => (dp >= 0 ? '1' : '0')).join('');
    return hash;
  }

  // Calculates the dot product of two vectors
  private dotProduct(vec1: number[], vec2: number[]): number {
    return vec1.reduce((sum, val, idx) => sum + val * vec2[idx], 0);
  }

  // Adds a vector to the ANN index
  addVector(vector: number[], index: number) {
    for (let i = 0; i < this.numHashTables; i++) {
      const hash = this.computeHash(vector, i);
      if (this.hashTables[i].has(hash)) {
        this.hashTables[i].get(hash)!.push(index);
      } else {
        this.hashTables[i].set(hash, [index]);
      }
    }
  }

  // Searches for the nearest neighbors of a query vector
  search(vector: number[], k: number = 5, features: number[][]): number[] {
    const candidates = new Set<number>();

    // Retrieve candidate indices from all hash tables
    for (let i = 0; i < this.numHashTables; i++) {
      const hash = this.computeHash(vector, i);
      const bucket = this.hashTables[i].get(hash);
      if (bucket) {
        bucket.forEach((idx) => candidates.add(idx));
      }
    }

    // Calculate distances to candidates
    const distances: { index: number; distance: number }[] = [];
    candidates.forEach((idx) => {
      const dist = this.euclideanDistance(vector, features[idx]);
      distances.push({ index: idx, distance: dist });
    });

    // Sort by distance and return top k indices
    distances.sort((a, b) => a.distance - b.distance);
    return distances.slice(0, k).map((item) => item.index);
  }

  // Computes Euclidean distance between two vectors
  private euclideanDistance(vec1: number[], vec2: number[]): number {
    return Math.sqrt(
      vec1.reduce((sum, val, idx) => sum + Math.pow(val - vec2[idx], 2), 0)
    );
  }
}

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
  const [searchImage, setSearchImage] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<number | null>(null);

  // Initialize ANN index using useRef to persist across renders
  const annIndexRef = useRef<ApproximateNearestNeighbors | null>(null);

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

  useEffect(() => {
    if (features.length > 0 && annIndexRef.current) {
      features.forEach((feature, idx) => {
        annIndexRef.current!.addVector(feature, idx);
      });
    }
  }, [features]);

  const extractFeatures = useCallback(async () => {
    if (!photoLoader || !tfHandler || !modelLoaded) return;

    const uriList = photoLoader.getPhotoURIs(); // .slice(0,20) Limit to first 20 images
    const total = uriList.length;
    let processed = 0;
    const extractedFeatures: number[][] = [];

    setFeatureLoadingProgress(0);

    for (const uri of uriList) {
      try {
        const feature = await tfHandler.extract_features(uri);
        extractedFeatures.push(feature);
        console.info(`Extracted features for image: ${uri}`);
      } catch (error) {
        console.error(`Error extracting features from ${uri}:`, error);
      }
      processed += 1;
      setFeatureLoadingProgress(processed / total);
    }

    setFeatures(extractedFeatures);
    console.log('Feature extraction completed.');

    // Initialize ANN index if not already initialized
    if (!annIndexRef.current) {
      annIndexRef.current = new ApproximateNearestNeighbors(1024);
      extractedFeatures.forEach((feature, idx) => {
        annIndexRef.current!.addVector(feature, idx);
      });
    } else {
      extractedFeatures.forEach((feature, idx) => {
        annIndexRef.current!.addVector(feature, idx);
      });
    }
  }, [photoLoader, tfHandler, modelLoaded]);

  // Function to handle image selection for search
  const selectImageForSearch = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Permission to access media library is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (!result.canceled && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      setSearchImage(uri);

      try {
        const feature = await tfHandler!.extract_features(uri);
        if (annIndexRef.current) {
          const nearestIndices = annIndexRef.current.search(feature, 1, features);

          if (nearestIndices.length > 0) {
            setSearchResult(nearestIndices[0]);
          } else {
            Alert.alert('No Results', 'No similar images found.');
          }
        } else {
          Alert.alert('Index Not Ready', 'The ANN index is not initialized yet.');
        }
      } catch (error) {
        console.error('Error extracting features for search image:', error);
        Alert.alert('Error', 'Failed to extract features from the selected image.');
      }
    }
  };

  // Function to render search results
  const renderSearchResults = () => {
    if (searchImage && searchResult !== null) {
      const nearestImageUri = photoLoader!.getPhotoURIs()[searchResult];
      return (
        <View style={styles.searchContainer}>
          <ThemedText style={styles.sectionTitle}>Selected Image</ThemedText>
          <Image source={{ uri: searchImage }} style={styles.selectedImage} />

          <ThemedText style={styles.sectionTitle}>Nearest Neighbor</ThemedText>
          <Image source={{ uri: nearestImageUri }} style={styles.nearestImage} />
        </View>
      );
    }
    return null;
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
        <Button 
          title="Extract Features" 
          onPress={extractFeatures} 
          disabled={!modelLoaded || (featureLoadingProgress > 0 && featureLoadingProgress < 1)} 
        />
        <Button 
          title="Select Image for Search" 
          onPress={selectImageForSearch} 
          disabled={!modelLoaded || features.length === 0}
        />
        {renderSearchResults()}

        {features.length > 0 && (
          <ThemedText style={styles.featuresText}>
            Extracted features for {features.length} images.
          </ThemedText>
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
  searchContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  selectedImage: {
    width: imageSize * 0.6,
    height: imageSize * 0.6,
    marginBottom: 10,
    borderRadius: 10,
  },
  nearestImage: {
    width: imageSize * 0.6,
    height: imageSize * 0.6,
    marginTop: 10,
    borderRadius: 10,
  },
});
