import * as React from 'react';
import { CoBrowsing } from './cobrowsing/serialization';

const socket = new WebSocket('ws://localhost:8080');
let browsing = null;
export const App = () => {
  const [allow, setAllow] = React.useState(true);
  return (
    <div>
      <button
        onClick={() => {
          if (!allow) return;
          browsing = new CoBrowsing({
            coBrowsingExec: true,
            root: document.body,
            socket: socket,
          });
          browsing.snapshot();
          setAllow(false);
        }}
      >
        Start CO-Browsing
      </button>
    </div>
  );
};
