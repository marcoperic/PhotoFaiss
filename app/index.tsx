import React, { useState } from 'react';
import { Button, StyleSheet, ScrollView } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

export default function HomeScreen() {
  const [photoNames, setPhotoNames] = useState<string[]>([]);

  const getPhotos = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      alert('Sorry, we need camera roll permissions to make this work!');
      return;
    }

    const media = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      first: 1000, // Limit to 100 photos for performance
    });

    const names = media.assets.map(asset => asset.filename);
    setPhotoNames(names);
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Photo Gallery</ThemedText>
      <Button title="Get Photos" onPress={getPhotos} />
      <ScrollView style={styles.scrollView}>
        {photoNames.map((name, index) => (
          <ThemedText key={index} style={styles.photoName}>{name}</ThemedText>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    marginTop: 40,
  },
  scrollView: {
    marginTop: 20,
    width: '100%',
  },
  photoName: {
    fontSize: 16,
    marginBottom: 5,
  },
});
