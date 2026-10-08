import { useImperativeHandle, useRef, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import { CALL_PAGE_HTML, type CallCommand, type CallPageEvent } from '@/lib/call-page';

export type CallViewHandle = { send: (command: CallCommand) => void };

// Runs the call page in a WebView, which has WebRTC built in on iPhone and Android.
export function CallView({ onEvent, ref }: { onEvent: (event: CallPageEvent) => void; ref?: Ref<CallViewHandle> }) {
  const view = useRef<WebView>(null);

  useImperativeHandle(
    ref,
    () => ({
      send: (command) =>
        view.current?.injectJavaScript(`window.voltrixCall && window.voltrixCall(${JSON.stringify(command)}); true;`),
    }),
    [],
  );

  return (
    <WebView
      ref={view}
      // An https address makes the page a secure one, which browsers require for the camera and microphone.
      source={{ html: CALL_PAGE_HTML, baseUrl: 'https://localhost' }}
      originWhitelist={['*']}
      style={StyleSheet.absoluteFill}
      containerStyle={{ backgroundColor: '#000000' }}
      javaScriptEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      onMessage={(e) => {
        try {
          onEvent(JSON.parse(e.nativeEvent.data) as CallPageEvent);
        } catch {
          // Not one of ours.
        }
      }}
    />
  );
}
