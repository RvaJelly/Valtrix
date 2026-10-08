import { useEffect, useEffectEvent, useImperativeHandle, useRef, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import { CALL_PAGE_HTML, type CallCommand, type CallPageEvent } from '@/lib/call-page';

export type CallViewHandle = { send: (command: CallCommand) => void };

// On the web the call page runs in an iframe that may use the camera and microphone.
export function CallView({ onEvent, ref }: { onEvent: (event: CallPageEvent) => void; ref?: Ref<CallViewHandle> }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const handle = useEffectEvent(onEvent);

  useImperativeHandle(
    ref,
    () => ({
      send: (command) => frame.current?.contentWindow?.postMessage({ voltrixCommand: JSON.stringify(command) }, '*'),
    }),
    [],
  );

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== frame.current?.contentWindow || typeof e.data?.voltrixCall !== 'string') return;
      try {
        handle(JSON.parse(e.data.voltrixCall) as CallPageEvent);
      } catch {
        // Not one of ours.
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <View style={StyleSheet.absoluteFill}>
      <iframe
        ref={frame}
        title="Call"
        srcDoc={CALL_PAGE_HTML}
        allow="camera; microphone; autoplay"
        style={{ border: 0, width: '100%', height: '100%', background: '#000000' }}
      />
    </View>
  );
}
