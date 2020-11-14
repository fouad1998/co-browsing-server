import * as React from 'react';
import { rebuildDOM, snapshot } from './cobrowsing/serialization';

const socket = new WebSocket('ws://localhost:8080');

socket.addEventListener('message', (event) => {
  const content = JSON.parse(event.data);
  switch (content.type) {
    case 'snapshot': {
      const virtualDOM = content.data;
      const wrapper = document.createElement('div');
      wrapper.classList.add('wrapper');
      document.body.append(wrapper);
      var iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.classList.add('iframe-cobrowsing');
      iframe.style.border = 'none';
      wrapper.style.backgroundColor = 'red';
      wrapper.append(iframe);
      var iframeDoc = iframe.contentDocument || iframe.contentWindow;
      iframeDoc.getElementsByTagName('body')[0].remove();
      iframeDoc.getElementsByTagName('head')[0].remove();
      iframeDoc.getElementsByTagName('html')[0].remove();
      rebuildDOM(virtualDOM, iframeDoc);
      break;
    }
  }
});

export const App = () => {
  const [allow, setAllow] = React.useState(true);
  return (
    <div>
      <button
        onClick={() => {
          if (!allow) return;
          const dom = snapshot();
          socket.send(JSON.stringify({ type: 'snapshot', href: window.location.href, data: JSON.parse(dom) }));
          setAllow(false);
        }}
      >
        Start CO-Browsing
      </button>
    </div>
  );
};
