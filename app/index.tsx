import React, { useState, useCallback, useMemo } from 'react';
import { Button, StyleSheet, FlatList, Image, Dimensions } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

const { width } = Dimensions.get('window');
const numColumns = 3;
const imageSize = (width - 40) / numColumns; // 40 is the total horizontal padding

const PHOTOS_PER_PAGE = 100;

const MemoizedPhoto = React.memo(({ uri }: { uri: string }) => (
  <Image
    source={{ uri }}
    style={styles.image}
  />
));

export default function HomeScreen() {
  const [photos, setPhotos] = useState<{ id: string; uri: string }[]>([]);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const getPhotos = useCallback(async () => {
    if (isLoading || !hasNextPage) return;

    setIsLoading(true);
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      alert('Sorry, we need camera roll permissions to make this work!');
      setIsLoading(false);
      return;
    }

    const media = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      first: PHOTOS_PER_PAGE,
      after: photos.length > 0 ? photos[photos.length - 1].id : undefined,
    });

    const photoData = await Promise.all(
      media.assets.map(async (asset) => {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
        return { id: asset.id, uri: assetInfo.localUri || asset.uri };
      })
    );

    setPhotos((prevPhotos) => [...prevPhotos, ...photoData]);
    setHasNextPage(media.hasNextPage);
    setIsLoading(false);
  }, [photos, isLoading, hasNextPage]);

  const renderPhoto = useCallback(({ item }: { item: { id: string; uri: string } }) => (
    <MemoizedPhoto uri={item.uri} />
  ), []);

  const keyExtractor = useCallback((item: { id: string; uri: string }) => item.id, []);

  const getItemLayout = useCallback((data: any, index: number) => ({
    length: imageSize,
    offset: imageSize * Math.floor(index / numColumns),
    index,
  }), []);

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Photo Gallery</ThemedText>
      <Button title="Load Photos" onPress={getPhotos} disabled={isLoading} />
      <FlatList
        data={photos}
        renderItem={renderPhoto}
        keyExtractor={keyExtractor}
        numColumns={numColumns}
        contentContainerStyle={styles.photoList}
        onEndReached={getPhotos}
        onEndReachedThreshold={0.5}
        getItemLayout={getItemLayout}
        removeClippedSubviews={true}
        windowSize={5}
        maxToRenderPerBatch={15}
        updateCellsBatchingPeriod={50}
      />
      {isLoading && <ThemedText>Loading...</ThemedText>}
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
  photoList: {
    paddingTop: 20,
  },
  image: {
    width: imageSize,
    height: imageSize,
    margin: 2,
    borderRadius: 8,
  },
});
