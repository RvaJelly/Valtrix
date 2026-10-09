// The small web page that runs a call. On phones it runs in a WebView (which has
// WebRTC built in, so calls work in Expo Go); on the web it runs in an iframe.
// The app passes it commands and gets events back; it never talks to Supabase.
//
// Commands (app -> page): start {role, video, iceServers, previewTop}, signal {data},
//   offer, mute {on}, camera {on}, flip, stop.
// Events (page -> app): loaded, media {ok, error}, signal {data}, state {state},
//   remote {video}, flip {ok}.

export type CallCommand =
  | {
      type: 'start';
      role: 'caller' | 'callee';
      video: boolean;
      iceServers: RTCIceServer[];
      previewTop: number;
    }
  | { type: 'signal'; data: CallSignal }
  | { type: 'offer' }
  | { type: 'mute'; on: boolean }
  | { type: 'camera'; on: boolean }
  | { type: 'flip' }
  | { type: 'stop' };

export type CallSignal = {
  description?: { type: 'offer' | 'answer'; sdp: string };
  candidate?: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };
};

export type CallPageEvent =
  | { type: 'loaded' }
  | { type: 'media'; ok: boolean; error?: string }
  | { type: 'signal'; data: CallSignal }
  | { type: 'state'; state: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed' }
  | { type: 'remote'; video: boolean }
  | { type: 'flip'; ok: boolean };

export const CALL_PAGE_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html, body { margin: 0; height: 100%; background: #0B0F1A; overflow: hidden; }
  video { position: absolute; background: #000; object-fit: cover; }
  #remote { inset: 0; width: 100%; height: 100%; opacity: 0; transition: opacity .3s; }
  #local { right: 16px; width: 104px; height: 148px; border-radius: 14px; opacity: 0; transition: all .3s; z-index: 2; }
  body.local-full #local { inset: 0; right: 0; width: 100%; height: 100%; border-radius: 0; }
  body.has-local #local { opacity: 1; }
  body.has-remote #remote { opacity: 1; }
  #local.mirror { transform: scaleX(-1); }
</style>
</head>
<body class="local-full">
<video id="remote" autoplay playsinline></video>
<video id="local" class="mirror" autoplay playsinline muted></video>
<script>
(function () {
  var remoteVideo = document.getElementById('remote');
  var localVideo = document.getElementById('local');
  var pc = null, local = null, role = 'caller', wantVideo = false, iceServers = [];
  var pendingIce = [], remoteSet = false, facing = 'user', stopped = false, flipping = false;

  function send(event) {
    var text = JSON.stringify(event);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
    else if (window.parent !== window) window.parent.postMessage({ voltrixCall: text }, '*');
  }

  function describe(error) {
    return (error && (error.name || error.message)) || String(error);
  }

  function getMedia() {
    var constraints = {
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: wantVideo ? { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } } : false
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  function makeConnection() {
    pc = new RTCPeerConnection({ iceServers: iceServers });
    local.getTracks().forEach(function (track) { pc.addTrack(track, local); });
    pc.onicecandidate = function (e) {
      if (e.candidate) send({ type: 'signal', data: { candidate: e.candidate.toJSON ? e.candidate.toJSON() : {
        candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex } } });
    };
    pc.ontrack = function (e) {
      var stream = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
      if (remoteVideo.srcObject !== stream) remoteVideo.srcObject = stream;
      var playing = remoteVideo.play();
      if (playing && playing.catch) playing.catch(function () {});
      if (e.track.kind === 'video') {
        document.body.classList.add('has-remote');
        document.body.classList.remove('local-full');
        send({ type: 'remote', video: true });
      }
    };
    var report = function () {
      var state = pc.connectionState;
      if (!state) {
        // Older WebViews only have the ICE state.
        var ice = pc.iceConnectionState;
        state = ice === 'checking' ? 'connecting' : ice === 'completed' ? 'connected' : ice;
      }
      send({ type: 'state', state: state });
    };
    pc.onconnectionstatechange = report;
    pc.oniceconnectionstatechange = report;
  }

  function flushIce() {
    var list = pendingIce; pendingIce = [];
    list.forEach(function (c) { pc.addIceCandidate(c).catch(function () {}); });
  }

  function sendDescription() {
    var d = pc.localDescription;
    send({ type: 'signal', data: { description: { type: d.type, sdp: d.sdp } } });
  }

  async function start(command) {
    role = command.role; wantVideo = !!command.video; iceServers = command.iceServers || [];
    localVideo.style.top = (command.previewTop || 16) + 'px';
    if (!wantVideo) document.body.classList.remove('local-full');
    try {
      local = await getMedia();
    } catch (error) {
      send({ type: 'media', ok: false, error: describe(error) });
      return;
    }
    if (stopped) { local.getTracks().forEach(function (t) { t.stop(); }); return; }
    if (wantVideo) {
      localVideo.srcObject = local;
      document.body.classList.add('has-local');
    }
    makeConnection();
    send({ type: 'media', ok: true });
  }

  // The caller makes the offer once the other phone says it is ready. If that
  // phone asks again (it missed the first one), the same offer is sent again.
  async function offer() {
    if (!pc || role !== 'caller') return;
    if (pc.localDescription && pc.localDescription.type === 'offer') { sendDescription(); return; }
    if (pc.signalingState !== 'stable') return;
    await pc.setLocalDescription(await pc.createOffer());
    sendDescription();
  }

  async function signal(data) {
    if (!pc) return;
    if (data.description) {
      var d = data.description;
      if (d.type === 'offer' && role === 'callee') {
        if (pc.remoteDescription) {
          if (pc.localDescription) sendDescription();
          return;
        }
        await pc.setRemoteDescription(d);
        remoteSet = true; flushIce();
        await pc.setLocalDescription(await pc.createAnswer());
        sendDescription();
      } else if (d.type === 'answer' && role === 'caller' && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(d);
        remoteSet = true; flushIce();
      }
    } else if (data.candidate) {
      if (remoteSet) pc.addIceCandidate(data.candidate).catch(function () {});
      else pendingIce.push(data.candidate);
    }
  }

  function openCamera(side) {
    return navigator.mediaDevices
      .getUserMedia({ video: { facingMode: side, width: { ideal: 640 }, height: { ideal: 480 } } })
      .then(function (stream) { return stream.getVideoTracks()[0] || null; })
      .catch(function () { return null; });
  }

  // Most Android phones can only have one camera open, so the one in use is let go
  // first. If the other camera won't open, the first one comes back.
  async function flip() {
    if (!local || !wantVideo || !pc || flipping) return;
    flipping = true;
    var old = local.getVideoTracks()[0];
    var enabled = old ? old.enabled : true;
    var sender = pc.getSenders().find(function (s) { return s.track && s.track.kind === 'video'; });
    if (old) { local.removeTrack(old); old.stop(); }
    var side = facing === 'user' ? 'environment' : 'user';
    var track = await openCamera(side);
    if (!track) {
      send({ type: 'flip', ok: false });
      side = facing;
      track = await openCamera(side);
    }
    flipping = false;
    if (stopped) { if (track) track.stop(); return; }
    if (!track) return;
    facing = side;
    track.enabled = enabled;
    if (sender) await sender.replaceTrack(track).catch(function () {});
    local.addTrack(track);
    localVideo.srcObject = local;
    localVideo.classList.toggle('mirror', facing === 'user');
  }

  function stop() {
    stopped = true;
    if (local) local.getTracks().forEach(function (t) { t.stop(); });
    if (pc) pc.close();
    pc = null;
  }

  function handle(command) {
    try {
      if (command.type === 'start') start(command);
      else if (command.type === 'signal') signal(command.data).catch(function () {});
      else if (command.type === 'offer') offer().catch(function () {});
      else if (command.type === 'mute' && local) local.getAudioTracks().forEach(function (t) { t.enabled = !command.on; });
      else if (command.type === 'camera' && local) local.getVideoTracks().forEach(function (t) { t.enabled = command.on; });
      else if (command.type === 'flip') flip();
      else if (command.type === 'stop') stop();
    } catch (error) {}
  }

  window.voltrixCall = handle;
  window.addEventListener('message', function (e) {
    if (e.data && e.data.voltrixCommand) handle(JSON.parse(e.data.voltrixCommand));
  });
  window.addEventListener('pagehide', stop);
  send({ type: 'loaded' });
})();
</script>
</body>
</html>`;
