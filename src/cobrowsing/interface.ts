export enum EVENTS_TYPE {
  INPUT = 0,
  MOUSE,
  DOM,
  SELECTION,
  STYLE,
  WINDOW,
}
export enum WINDOW_EVENTS_TYPE {
  RESIZE = 0,
  SCROLL,
  LOADED,
  CHANGE_URL,
  RELOAD,
}
export enum DOM_EVENTS_TYPE {
  DOM_CHANGE = 0,
  REMOVED_ELEMENT_FROM_DOM,
  ATTRIBUTE_CHANGE,
  SNAPSHOT,
}
export enum INPUT_EVENTS_TYPE {
  INPUT = 0,
  BLUR,
  CHANGE,
  KEYPRESS,
  KEYDOWN,
  KEYUP,
}
export enum MOUSE_EVENTS_TYPE {
  CLICK = 0,
  MOUSE_ENTER,
  MOUSE_OUT,
  MOUSE_OVER,
  MOUSE_MOVE,
  POSITION,
  OUT_OF_SCREEN,
}

// Window Events
//Scroll event
export interface Scroll {
  x: number;
  y: number;
}
// Resize event
export interface Resize {
  width: number;
  height: number;
}
// Window Event
export interface WindowEvent {
  type: WINDOW_EVENTS_TYPE;
  content: Resize | Scroll | string;
}

// DOM Events

//DOM serialization structure
export interface HTMLElementSerialization {
  id: number;
  type: number;
  tag?: string;
  content?: string;
  attributes?: {};
  children?: Array<HTMLElementSerialization>;
  listenEvents: Array<string>;
}
// When the HTML element has lost number of children
export interface HTMLElementRemovedEvent {
  chidlrenId: Array<number>;
  id: number;
}
// DOM Event, kind of element change all his chidlren or add new children to the list
export interface DOMEventChange {
  id: number;
  content: HTMLElementSerialization;
}
// Attriute of an element has changed attributes
export interface AttributeEvent {
  id: number;
  content: {};
}
// The first kind of event can be sent to the remote peer,
export interface SnapShotEvent {
  href: string;
  content: HTMLElementSerialization;
}
// DOM Event
export interface DOMEvent {
  type: DOM_EVENTS_TYPE;
  content: HTMLElementRemovedEvent | HTMLElementSerialization | AttributeEvent | SnapShotEvent | DOMEventChange;
}

// STyle event
export interface StyleEvent {
  id: number;
  content: Object;
}

// Mouse events

// mouse click event
export interface mouseCoordonate {
  clientX: number;
  clientY: number;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  movementX?: number;
  movementY?: number;
  offsetX?: number;
  pageY?: number;
  pageX?: number;
  screenX?: number;
  screenY?: number;
  x?: number;
  y?: number;
}

// Input events

// input change the value
export interface input {
  id: number;
  content: string;
  ctl?: boolean;
  alt?: boolean;
  shift?: boolean;
  code?: string;
  keyCode?: number;
  which?: number;
}

export interface InputEvent {
  type: INPUT_EVENTS_TYPE;
  content: input;
}

// Hightlighted event
export interface HightLightedEvent {
  startNodeId?: number;
  endNodeId?: number;
  startNodeOffset?: number;
  endNodeOffset?: number;
  clear?: boolean;
}
