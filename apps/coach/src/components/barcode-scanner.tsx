import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body, Button, EmptyState, ErrorText, IconButton, Text, TextField } from '@/components/ui';
import { BRAND, Colors, Fonts, Layout, Radius, Spacing, themed } from '@/constants/theme';
import { isBarcode } from '@/lib/food';

// Food packs use these barcodes. Leaving out QR codes and the rest keeps scanning quick.
const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e'];

type Props = {
  // Called with the barcode number, from the camera or typed in.
  onCode: (code: string) => void;
  // True while a code is being looked up: scanning waits.
  busy?: boolean;
  // A line to show, like a problem looking the code up.
  message?: string | null;
  onClose: () => void;
};

// Scans a food barcode with the camera (phones and browsers that can), and always lets
// people type the number under the barcode instead.
export function BarcodeScanner({ onCode, busy, message, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission, getPermission] = useCameraPermissions({ get: false });
  const [checked, setChecked] = useState(false);
  const [hasCamera, setHasCamera] = useState(true);
  const [failed, setFailed] = useState(false);
  const [typing, setTyping] = useState(false);
  const [torch, setTorch] = useState(false);
  const last = useRef({ code: '', at: 0 });

  useEffect(() => {
    let alive = true;
    // Browsers on computers often have no camera, or block it on sites that aren't secure.
    const camera = Platform.OS === 'web' ? CameraView.isAvailableAsync().catch(() => false) : Promise.resolve(true);
    Promise.all([getPermission().catch(() => null), camera]).then(([, available]) => {
      if (!alive) return;
      setHasCamera(available);
      setChecked(true);
    });
    // Coming back from the phone's Settings with the camera turned on.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') getPermission().catch(() => null);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [getPermission]);

  // After a look-up, wait a moment before the same barcode counts again, so a pack
  // still in front of the camera doesn't open again straight away.
  useEffect(() => {
    if (!busy) last.current.at = Date.now();
  }, [busy]);

  function scanned({ data }: BarcodeScanningResult) {
    const code = data.replace(/\D/g, '');
    if (!isBarcode(code)) return;
    const now = Date.now();
    if (code === last.current.code && now - last.current.at < 3000) return;
    last.current = { code, at: now };
    onCode(code);
  }

  async function turnOn() {
    setFailed(false);
    await requestPermission().catch(() => setFailed(true));
  }

  const blocked = permission?.status === 'denied' && (Platform.OS === 'web' || !permission.canAskAgain);
  const live = checked && hasCamera && !failed && !typing && !!permission?.granted;

  if (live) {
    return (
      <View style={styles.camera}>
        <StatusBar style="light" />
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
          onBarcodeScanned={busy ? undefined : scanned}
          enableTorch={torch}
          onMountError={() => setFailed(true)}
        />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.shade} />
          <View style={{ flexDirection: 'row' }}>
            <View style={styles.shade} />
            <View style={styles.frame} />
            <View style={styles.shade} />
          </View>
          <View style={[styles.shade, { alignItems: 'center', paddingTop: Spacing.four }]}>
            <Text variant="callout" style={styles.hint}>
              Line up the barcode inside the box
            </Text>
          </View>
        </View>
        <View style={[styles.cameraBar, { paddingTop: insets.top + Spacing.two }]}>
          <RoundButton icon="close" label="Close" onPress={onClose} />
          <Text variant="headline" style={styles.onCamera}>
            Scan a barcode
          </Text>
          {Platform.OS !== 'web' ? (
            <RoundButton
              icon={torch ? 'flashlight' : 'flashlight-outline'}
              label={torch ? 'Turn the light off' : 'Turn the light on'}
              onPress={() => setTorch((t) => !t)}
            />
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>
        <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + Spacing.four }]}>
          {busy || message ? (
            <View style={styles.pill} accessibilityLiveRegion="polite">
              {busy ? <ActivityIndicator color={BRAND.white} /> : null}
              <Text variant="callout" style={[styles.onCamera, { flexShrink: 1 }]}>
                {busy ? 'Looking it up…' : message}
              </Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => setTyping(true)}
            style={({ pressed }) => [styles.typeButton, pressed && { opacity: 0.7 }]}>
            <Ionicons name="keypad-outline" size={20} color={BRAND.white} />
            <Text variant="button" style={styles.onCamera}>
              Type the barcode number
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  let body;
  if (!checked) {
    // Asking the phone takes a moment; nothing shows rather than a spinner.
    body = null;
  } else if (typing || !hasCamera) {
    body = (
      <TypeBarcode
        onCode={onCode}
        busy={busy}
        message={message}
        note={hasCamera ? null : 'No camera here. Type the number under the barcode instead.'}
        onCamera={hasCamera ? () => setTyping(false) : null}
      />
    );
  } else if (failed) {
    body = (
      <Explain
        icon="videocam-off-outline"
        title="The camera didn't start"
        text="Close any other app using the camera and try again, or type the number under the barcode.">
        <Button title="Try again" onPress={turnOn} />
        <Button title="Type the barcode number" variant="secondary" onPress={() => setTyping(true)} />
      </Explain>
    );
  } else if (blocked) {
    body = (
      <Explain
        icon="videocam-off-outline"
        title="Your camera is off"
        text={
          Platform.OS === 'web'
            ? 'This browser is not letting Voltrix use the camera. Allow the camera for this site in your browser settings, or type the number under the barcode.'
            : 'Voltrix is not allowed to use your camera. Turn it on in your phone’s Settings, or type the number under the barcode.'
        }>
        {Platform.OS !== 'web' ? <Button title="Open Settings" onPress={() => Linking.openSettings()} /> : null}
        <Button
          title="Type the barcode number"
          variant={Platform.OS === 'web' ? 'primary' : 'secondary'}
          onPress={() => setTyping(true)}
        />
      </Explain>
    );
  } else {
    body = (
      <Explain
        icon="barcode-outline"
        title="Scan food barcodes"
        text="Point your camera at the barcode on the pack to see its calories. Voltrix only uses the camera while this screen is open.">
        <Button title="Turn on camera" onPress={turnOn} />
        <Button title="Type the barcode number" variant="secondary" onPress={() => setTyping(true)} />
      </Explain>
    );
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <IconButton icon="close" label="Close" onPress={onClose} />
        <Text variant="headline">{typing || !hasCamera ? 'Type a barcode' : 'Scan a barcode'}</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.pageContent, { paddingBottom: insets.bottom + Spacing.four }]}
        keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.round, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={24} color={BRAND.white} />
    </Pressable>
  );
}

function Explain({
  icon,
  title,
  text,
  children,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      message={text}
      action={<View style={{ gap: Spacing.two, alignSelf: 'stretch' }}>{children}</View>}
    />
  );
}

function TypeBarcode({
  onCode,
  busy,
  message,
  note,
  onCamera,
}: {
  onCode: (code: string) => void;
  busy?: boolean;
  message?: string | null;
  note: string | null;
  onCamera: (() => void) | null;
}) {
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    const digits = code.replace(/\D/g, '');
    if (!isBarcode(digits)) {
      setProblem('Barcodes have 8 to 14 numbers. Check the number and try again.');
      return;
    }
    setProblem(null);
    onCode(digits);
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <Body secondary>{note ?? 'Type the row of numbers printed under the bars.'}</Body>
      <TextField
        label="Barcode number"
        value={code}
        onChangeText={(t) => setCode(t.replace(/[^0-9 ]/g, ''))}
        keyboardType="number-pad"
        inputMode="numeric"
        autoFocus
        maxLength={18}
        placeholder="For example 6001234567890"
        returnKeyType="search"
        onSubmitEditing={submit}
      />
      <ErrorText>{problem ?? (busy ? null : message)}</ErrorText>
      <Button title="Look it up" onPress={submit} loading={busy} />
      {onCamera ? <Button title="Use the camera" variant="ghost" onPress={onCamera} /> : null}
    </View>
  );
}

const FRAME_WIDTH = 280;

const styles = themed(() => ({
  camera: {
    flex: 1,
    backgroundColor: '#000000',
  },
  shade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  frame: {
    width: FRAME_WIDTH,
    height: 170,
    borderRadius: Radius.large,
    borderWidth: 3,
    borderColor: BRAND.white,
  },
  hint: {
    color: BRAND.white,
    fontFamily: Fonts.textSemi,
    textAlign: 'center',
  },
  onCamera: {
    color: BRAND.white,
  },
  cameraBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cameraBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    maxWidth: '100%',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.large,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.four,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  page: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.tight,
    minHeight: 52,
  },
  pageContent: {
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: Layout.maxForm,
    alignSelf: 'center',
  },
}));
