const hookScript = document.createElement('script');
hookScript.src = chrome.runtime.getURL('/js/ws-hook.js');
hookScript.onload = () => { hookScript.remove(); };
(document.head || document.documentElement).appendChild(hookScript);


document.addEventListener('onDanmakuMsgPack', (event) => {
  const detail = (event as CustomEvent<{ roomid: number, json: string }>).detail;
  const data = JSON.parse(detail.json);
  const msg = {
    roomid: Number(detail.roomid),
    data,
  };
  if (msg.roomid && !Number.isNaN(msg.roomid)) {
    chrome.runtime.sendMessage({ type: 'danmaku', data: msg });
    console.debug(msg);
  }
});

