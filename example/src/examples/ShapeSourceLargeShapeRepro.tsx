import { useEffect, useRef, useState } from 'react';
import { Camera, CircleLayer, MapView, ShapeSource } from '@rnmapbox/maps';
import { type FeatureCollection, type Point } from 'geojson';
import { Animated, Button, Easing, StyleSheet, Text, View } from 'react-native';

// Reproducer for the iOS ShapeSource `shape` setter decoding GeoJSON on the main thread.
// Pushes a fresh FeatureCollection through setNativeProps, the way a live-tracking app
// re-uploads moving points, and shows a native-driver spinner that freezes while the main
// thread is blocked. The Swift side logs the setter's main-thread time per push.

const CENTER: [number, number] = [-74.00597, 40.71427];
const SPREAD_DEG = 0.2;
const PUSH_INTERVAL_MS = 1000;
const COUNTS = [1_000, 5_000, 20_000];

const styles = StyleSheet.create({
  map: { flex: 1 },
  controls: { padding: 12, gap: 8, backgroundColor: 'white' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  spinner: {
    width: 24,
    height: 24,
    borderWidth: 3,
    borderColor: '#333',
    borderTopColor: 'transparent',
    borderRadius: 12,
  },
});

const pseudoRandom = (n: number) => {
  const x = Math.sin(n) * 10000;
  return x - Math.floor(x);
};

const makeFeatures = (count: number, seed: number): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: Array.from({ length: count }, (_, i) => ({
    type: 'Feature',
    id: `f-${i}`,
    properties: {
      index: i,
      seed,
      name: `Feature ${i}`,
      group: `group-${i % 40}`,
      status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'paused' : 'idle',
      heading: (i * 7 + seed) % 360,
      updatedAt: seed,
      label: `${i}:${seed}`,
    },
    geometry: {
      type: 'Point',
      coordinates: [
        CENTER[0] + (pseudoRandom(i * 2 + seed) - 0.5) * SPREAD_DEG,
        CENTER[1] + (pseudoRandom(i * 2 + 1 + seed) - 0.5) * SPREAD_DEG,
      ],
    },
  })),
});

const ShapeSourceLargeShapeRepro = () => {
  const shapeSourceRef = useRef<ShapeSource>(null);
  const [count, setCount] = useState(COUNTS[1]);
  const [running, setRunning] = useState(false);
  const [pushes, setPushes] = useState(0);
  const [lastBytes, setLastBytes] = useState(0);
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const push = () => {
    const seed = Date.now() % 100_000;
    const collection = makeFeatures(count, seed);
    setLastBytes(JSON.stringify(collection).length);
    shapeSourceRef.current?.setNativeProps({ shape: collection });
    setPushes((n) => n + 1);
  };

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(push, PUSH_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, count]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <>
      <MapView style={styles.map}>
        <Camera defaultSettings={{ centerCoordinate: CENTER, zoomLevel: 10 }} />
        <ShapeSource
          ref={shapeSourceRef}
          id="large-shape-source"
          shape={makeFeatures(0, 0)}
        >
          <CircleLayer
            id="large-shape-circles"
            style={{ circleRadius: 3, circleColor: '#ff0000' }}
          />
        </ShapeSource>
      </MapView>
      <View style={styles.controls}>
        <View style={styles.row}>
          <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]} />
          <Text>
            {count.toLocaleString()} features · {pushes} pushes · last {Math.round(lastBytes / 1024)} KB
          </Text>
        </View>
        <View style={styles.row}>
          {COUNTS.map((n) => (
            <Button
              key={n}
              title={n.toLocaleString()}
              onPress={() => setCount(n)}
              disabled={n === count}
            />
          ))}
        </View>
        <View style={styles.row}>
          <Button title="Push once" onPress={push} />
          <Button
            title={running ? 'Stop auto-push' : 'Start auto-push (1/s)'}
            onPress={() => setRunning((r) => !r)}
          />
        </View>
      </View>
    </>
  );
};

export default ShapeSourceLargeShapeRepro;
