function randomIPv6() {
  return Array.from({length:8}, () =>
    Math.floor(Math.random()*65536).toString(16).padStart(4,'0')
  ).join(':');
}

function humanClick(el) {
  if (!el) return;
  ['mouseover','mousedown','mouseup','click'].forEach(t =>
    el.dispatchEvent(new MouseEvent(t, {bubbles:true, cancelable:true}))
  );
}
