import React, { useState } from 'react';
import { Button, StyleSheet, Image, Dimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

const { width } = Dimensions.get('window');
const imageSize = width * 0.8; // 80% of screen width

export default function HomeScreen() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Photo Gallery</ThemedText>
      <Button title="Select Photo" onPress={pickImage} />
      {selectedImage && (
        <Image source={{ uri: selectedImage }} style={styles.image} />
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
});
