// // import { record, Replayer } from 'rrweb';

// // const events = [];

// // record({
// //   emit(event) {
// //     console.log(event);
// //     events.push(event);
// //   },
// // });

// // const button = document.createElement('button');
// // button.innerHTML = 'Click on me';
// // document.body.append(button);

// // button.addEventListener('click', function () {
// //   const root = document.getElementById('root');
// //   const DOMString = JSON.stringify(events);
// //   console.log(DOMString);
// //   new Replayer(JSON.parse(DOMString), {
// //     root,
// //   }).play();
// // });
// import { rebuildDOM, snapshot } from './cobrowsing/serialization';
// const dom = snapshot();

// const wrapper = document.createElement('div');
// wrapper.classList.add('wrapper');
// document.body.append(wrapper);
// var iframe = document.createElement('iframe');
// /// iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
// iframe.classList.add('iframe-cobrowsing');
// iframe.style.border = 'none';
// wrapper.style.backgroundColor = 'red';
// wrapper.append(iframe);
// var iframeDoc = iframe.contentDocument || iframe.contentWindow;
// iframeDoc.getElementsByTagName('body')[0].remove();
// iframeDoc.getElementsByTagName('head')[0].remove();
// iframeDoc.getElementsByTagName('html')[0].remove();
// rebuildDOM(dom, iframeDoc);

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { App } from './App';

const index = () => {
  return <App />;
};

ReactDOM.render(index(), document.getElementById('root'));
