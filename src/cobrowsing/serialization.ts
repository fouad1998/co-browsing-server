enum EVENTS_TYPE {
    INPUT,
    MOUSE,
    DOM_CHANGE,
    REMOVED_ELEMENT_FROM_DOM,
    ATTRIBUTE_CHANGE,
    SNAPSHOT,
    WINDOW
}
enum INPUT_EVENTS_TYPE {
    INPUT = 0,
    CHANGE,
    KEYPRESS,
    KEYDOWN,
    KEYUP,
}
enum MOUSE_EVENTS_TYPE {
    CLICK = 0,
    HOVER,
    POSITION
}
enum WINDOW_EVENTS_TYPE {
    RESIZE = 0,
    SCROLL,
}
interface CoBrowsingInterface {
    root: HTMLElement;
    remotePeer: boolean // If the co-browser is used to execute remote event
    socket: WebSocket// the websocket connection, it can be other thing if we want like (RTC, XHR...)
}
interface HTMLElementSerialization {
    id: number;
    type: number;
    tag?: string;
    content?: string;
    attributes?: {};
    children?: Array<HTMLElementSerialization>;
}
// When the HTML element has lost number of children
interface HTMLElementRemovedEvent {
    chidlrenId: Array<number>
    id: number
}
// mouse click event
interface mouseCoordonate {
    clientX: number,
    clientY: number,
    ctrl?: boolean,
    alt?: boolean,
    shift?: boolean,
    movementX?: number,
    movementY?: number,
    offsetX?: number,
    pageY?: number,
    pageX?: number,
    screenX?: number,
    screenY?: number,
    x?: number,
    y?: number
}
//Scroll event
interface Scroll {
    x: number;
    y: number;
}
// Resize event
interface Resize {
    width: number;
    height: number;
}
// input change the value
interface inputEvent {
    id: number;
    content: string;
    eventType: number;
    ctl?: boolean;
    alt?: boolean;
    shift?: boolean;
    code?: string;
    keyCode?: number;
    which?: number;
}
// DOM Event, kind of element change all his chidlren or add new children to the list
interface DOMEvent {
    id: number;
    content: HTMLElementSerialization
}
// Attriute of an element has changed attributes
interface AttributeEvent {
    id: number;
    content: {}
}
// The first kind of event can be sent to the remote peer,
interface SnapShotEvent {
    href: string
    content: HTMLElementSerialization
}
// Mouse Events 
interface MouseEvent {
    id: number;
    type: number;
    content: mouseCoordonate;
}
// Window Event
interface WindowEvent {
    type: number
    content: Resize | Scroll
}
// The whole objec who contains all kind of event that can be cought
interface HTMLEvent {
    type: number;
    data: inputEvent | DOMEvent | AttributeEvent | SnapShotEvent | HTMLElementRemovedEvent | HTMLElementSerialization | WindowEvent | MouseEvent
}


const map = new Map<number, HTMLElement>()

export class CoBrowsing {
    _id = -1;
    map: Map<number, HTMLElement | Document>
    iframe: HTMLIFrameElement | null = null
    mouse: HTMLDivElement | null = null
    iframeWrapper: HTMLDivElement | null = null
    wrapper: HTMLDivElement | null = null
    root: HTMLElement
    config: Partial<CoBrowsingInterface> = {}
    socket: WebSocket
    allowToSendEvent: boolean = true

    constructor(props: CoBrowsingInterface) {
        if (!props.socket) {
            throw Error("Not enough of params received. Websocket connection is missing")
        }
        this.map = new Map<number, HTMLElement>()
        this.root = props.root
        this.config = props
        this.socket = props.socket
        this.socket.onmessage = this.executeEvent
        // bind
        this.snapshot = this.snapshot.bind(this)
        this.buildElementNode = this.buildElementNode.bind(this)
        this.executeEvent = this.executeEvent.bind(this)
        this.rebuildDOM = this.rebuildDOM.bind(this)
        this.serializeDOMElement = this.serializeDOMElement.bind(this)
        this.startMutationObserver = this.startMutationObserver.bind(this)
        this.setup = this.setup.bind(this)
        this.mutationObserverHandler = this.mutationObserverHandler.bind(this)
        this.setConfig = this.setConfig.bind(this)
        this.buildDOM = this.buildDOM.bind(this)
        this.executeEvent = this.executeEvent.bind(this)
        this.startFieldChangeEventListener = this.startFieldChangeEventListener.bind(this)
    }

    setConfig(config: CoBrowsingInterface) {
        this.config = config
    }

    /**
     * Transform the current document to a string representation, in order to rebuild it after
     */
    snapshot(): HTMLElementSerialization | undefined {
        // The remote (Agent in our case) peer doesn't need to create snapshot of his webpage
        if (this.config.remotePeer) return undefined
        // Create serialization of the Document
        const DOMVirual = this.serializeDOMElement(document)
        // Create the event content
        const event: SnapShotEvent = {
            href: window.location.href,
            content: DOMVirual as HTMLElementSerialization
        }
        // The event to send who contains the type of the event and event data (event content)
        const eventSend: HTMLEvent = {
            data: event,
            type: EVENTS_TYPE.SNAPSHOT,
        }
        // Send the content through the socket
        this.socket.send(JSON.stringify(eventSend))
        // Listen  to the DOM changement
        this.startMutationObserver(document)
        // Listen to some event on each node
        this.startFieldChangeEventListener(document)
        // Listen to window event
        this.listenToWindowResize()
        // Make virtual cursor 
        const mouseCursor = document.createElement("img")
        this.mouse = document.createElement("div")
        mouseCursor.src = "https://tl.vhv.rs/dpng/s/407-4077994_mouse-pointer-png-png-download-mac-mouse-pointer.png"
        mouseCursor.style.width = "100%"
        mouseCursor.style.height = "100%"
        this.mouse.style.position = "fixed"
        this.mouse.style.left = "0px"
        this.mouse.style.top = "0px"
        this.mouse.style.width = "20px"
        this.mouse.style.height = "20px"
        this.mouse.style.zIndex = "1000000"
        this.mouse.append(mouseCursor)
        document.body.append(this.mouse)
    }

    /**
     * Listen to window size and throw the event using socket to the other side
     * 
     * NOTE: THE CLIENT SIDE WHO FOLLOW, NOT THE AGENCY SIDE
     */
    private listenToWindowResize() {
        const resizeHandler = () => {
            const { innerWidth, innerHeight } = window
            // Window event content
            const event: WindowEvent = {
                type: WINDOW_EVENTS_TYPE.RESIZE,
                content: {
                    height: innerHeight,
                    width: innerWidth,
                }
            }
            // Generate an event to send
            const eventToSend: HTMLEvent = {
                type: EVENTS_TYPE.WINDOW,
                data: event
            }
            // Send the event 
            this.socket.send(JSON.stringify(eventToSend))
        }
        window.addEventListener("resize", resizeHandler)
        // Send the first set of dimension
        resizeHandler()
    }

    private listenToWindowEventRemotePeer() {
        // Change the wrapper scale in order to keep the same forme of the dom in both sides
        const resizeHandler = () => {
            const { innerHeight, innerWidth } = window
            // Get needed data from iframe
            const width = this.iframeWrapper!.style.width.replace(/(^[0-9]+).+/, "$1")
            const height = this.iframeWrapper!.style.height.replace(/(^[0-9]+).+/, "$1")
            console.log({ width, height })
            // Make the scale
            const xScale = !width ? 1 : innerWidth / +width
            const yScale = !height ? 1 : innerHeight / +height
            // Set the Scale
            this.wrapper!.style.transform = `scaleX(${xScale}) scaleY(${yScale})`
        }

        // Scroll event
        const scrollHandler = () => {
            const { scrollY, scrollX } = this.iframe!.contentWindow as Window
            console.log("Scroll event used.... ", scrollY, scrollX)
            if (!isNaN(scrollX) && !isNaN(scrollY)) {
                const event: WindowEvent = {
                    type: WINDOW_EVENTS_TYPE.SCROLL,
                    content: {
                        x: scrollX,
                        y: scrollY
                    }
                }
                const eventSend: HTMLEvent = {
                    type: EVENTS_TYPE.WINDOW,
                    data: event
                }
                this.socket.send(JSON.stringify(eventSend))
            }
        }
        window.addEventListener("resize", resizeHandler)
        this.iframe!.contentWindow!.addEventListener("scroll", scrollHandler)
    }

    private listenToMousePosition(document: Document) {
        document.body.addEventListener("mouseover", (event) => {
            console.log("Mouse Position.............")
            // get the mouse position
            const { clientX, clientY } = event
            // Create the event content
            const eventContent: MouseEvent = {
                id: 0,
                type: MOUSE_EVENTS_TYPE.POSITION,
                content: {
                    clientX,
                    clientY,
                }
            }
            // Event to send
            const eventSend: HTMLEvent = {
                type: EVENTS_TYPE.MOUSE,
                data: eventContent
            }
            this.socket.send(JSON.stringify(eventSend))
        })
    }

    private mutationObserverHandler(events: Array<any>) {
        events.forEach(event => {
            switch (event.type) {
                case "attributes": {
                    const attributeName = event.attributeName
                    const oldValueOfAttribute = event.oldValue
                    const target = event.target
                    const newValueOfAttribute = target.getAttribute(attributeName)
                    if (oldValueOfAttribute !== newValueOfAttribute) {
                        const id = target.__emploriumId
                        const event: AttributeEvent = {
                            content: { [attributeName]: newValueOfAttribute },
                            id
                        }
                        const eventSend: HTMLEvent = {
                            type: EVENTS_TYPE.ATTRIBUTE_CHANGE,
                            data: event
                        }
                        this.socket.send(JSON.stringify(eventSend))
                    }
                    break
                }

                case "childList": {
                    const { addedNodes, removedNodes, target } = event
                    if (Array.from(addedNodes).length === 0) {
                        // there is no element removed, too strange, it shouldn't be the case
                        if (Array.from(removedNodes).length === 0) return
                        // The id of elements got remove from the DOM
                        const nodeRemovedId: Array<number> = []
                        for (const node of removedNodes) {
                            nodeRemovedId.push(node.__emploriumId)
                        }
                        const event: HTMLElementRemovedEvent = {
                            chidlrenId: nodeRemovedId,
                            id: target.__emploriumId
                        }
                        const eventSend: HTMLEvent = {
                            data: event,
                            type: EVENTS_TYPE.REMOVED_ELEMENT_FROM_DOM,
                        }
                        this.socket.send(JSON.stringify(eventSend))
                    } else {
                        // IN this case the element can be added as can be removed
                        const serialize = this.serializeDOMElement(target) as HTMLElementSerialization
                        const event: DOMEvent = {
                            content: serialize,
                            id: target.__emploriumId,
                        }
                        const eventSend: HTMLEvent = {
                            data: event,
                            type: EVENTS_TYPE.DOM_CHANGE
                        }
                        this.socket.send(JSON.stringify(eventSend))
                    }
                    break
                }
            }
        });
    }

    private startMutationObserver(document: Document) {
        const mutation = new MutationObserver(this.mutationObserverHandler)
        mutation.observe(document.body as HTMLElement, {
            attributeOldValue: true,
            attributes: true,
            subtree: true,
            childList: true,
        })
    }

    private startFieldChangeEventListener(document: Document) {
        if (document && 'getElementsByTagName' in document) {
            const fields = ['input', 'select', 'textarea']
            const eventsLookingForward = ['onchange', 'oninput', 'onkeypress', 'onkeydown', 'onkeyup']
            const emploriumHandler = (event: any, eventType: string) => {
                if (!this.allowToSendEvent) return void 0
                setTimeout(() => this.allowToSendEvent = true, 1000 / 24);
                console.log('new event ', event)
                switch (eventType) {
                    case "onchange": {
                        console.log("input change event ....")
                        const target = event.target;
                        console.log(event, target)
                        const value = target.value;
                        const inputEvent: inputEvent = {
                            id: target.__emploriumId,
                            content: value,
                            eventType: INPUT_EVENTS_TYPE.CHANGE,
                        }
                        const eventSend: HTMLEvent = {
                            type: EVENTS_TYPE.INPUT,
                            data: inputEvent
                        }
                        this.socket.send(JSON.stringify(eventSend))
                        break
                    }

                    case "oninput": {
                        console.log("input event ....")
                        const target = event.target;
                        const value = target.value;
                        const inputEvent: inputEvent = {
                            id: target.__emploriumId,
                            content: value,
                            eventType: INPUT_EVENTS_TYPE.INPUT,
                        }
                        const eventSend: HTMLEvent = {
                            type: EVENTS_TYPE.INPUT,
                            data: inputEvent
                        }
                        this.socket.send(JSON.stringify(eventSend))
                        break
                    }

                    case "onkeypress": {
                        console.log("input keypress ....")
                        const target = event.target;
                        const value = target.value;
                        const { ctrlKey, code, altKey, keyCode, which, shiftKey } = event;
                        const inputEvent: inputEvent = {
                            id: target.__emploriumId,
                            content: value,
                            eventType: INPUT_EVENTS_TYPE.KEYPRESS,
                            alt: altKey,
                            code: code,
                            ctl: ctrlKey,
                            keyCode,
                            which: which,
                            shift: shiftKey
                        }
                        const eventSend: HTMLEvent = {
                            type: EVENTS_TYPE.INPUT,
                            data: inputEvent
                        }
                        this.socket.send(JSON.stringify(eventSend))
                        break
                    }

                    case "onkeydown": {
                        console.log("input key down event ....")
                        const target = event.target;
                        const value = target.value;
                        const { ctrlKey, code, altKey, keyCode, which, shiftKey } = event;
                        const inputEvent: inputEvent = {
                            id: target.__emploriumId,
                            content: value,
                            eventType: INPUT_EVENTS_TYPE.KEYDOWN,
                            alt: altKey,
                            code: code,
                            ctl: ctrlKey,
                            keyCode,
                            which: which,
                            shift: shiftKey
                        }
                        const eventSend: HTMLEvent = {
                            type: EVENTS_TYPE.INPUT,
                            data: inputEvent
                        }
                        this.socket.send(JSON.stringify(eventSend))
                        break
                    }

                    case "onkeyup": {
                        console.log("input keyup event ....")
                        const target = event.target;
                        const value = target.value;
                        const { ctrlKey, code, altKey, keyCode, which, shiftKey } = event;
                        const inputEvent: inputEvent = {
                            id: target.__emploriumId,
                            content: value,
                            eventType: INPUT_EVENTS_TYPE.KEYUP,
                            alt: altKey,
                            code: code,
                            ctl: ctrlKey,
                            keyCode,
                            which: which,
                            shift: shiftKey
                        }
                        const eventSend: HTMLEvent = {
                            type: EVENTS_TYPE.INPUT,
                            data: inputEvent
                        }
                        this.socket.send(JSON.stringify(eventSend))
                        break
                    }
                }
            }

            for (const field of fields) {
                const nodes = document.getElementsByTagName(field);
                console.log(nodes, field)
                Array.from(nodes).forEach((node) => {
                    console.log(node, field)
                    node = node as HTMLInputElement
                    for (const eventType of eventsLookingForward) {
                        console.log(eventType.substr(2))
                        node.addEventListener(eventType.substr(2), (event: any) => {
                            event.stopPropagation()
                            emploriumHandler(event, eventType)
                        })
                    }
                })
            }
        }
    }

    private buildDOM(DOMString: string | HTMLElementSerialization): void {
        const DOM = typeof DOMString === "string" ? JSON.parse(DOMString) as HTMLElementSerialization : DOMString
        this.rebuildDOM(DOM, this.iframe?.contentDocument as Document, true)
        this.startMutationObserver(this.iframe?.contentDocument as Document)
        this.startFieldChangeEventListener(this.iframe?.contentDocument as Document)
    }

    private executeEvent = (event: MessageEvent): void => {
        // Try to execute an event using received event structure
        try {
            const eventString = event.data
            const parsedEvent = JSON.parse(eventString) as HTMLEvent
            console.log("Trying to Execute event......", this.config.remotePeer)
            // the object in this case is not used to execute commande not, because we are in the remote pair 
            if (this.config.remotePeer && parsedEvent.type !== EVENTS_TYPE.SNAPSHOT && parsedEvent.type !== EVENTS_TYPE.DOM_CHANGE && parsedEvent.type !== EVENTS_TYPE.WINDOW) return undefined
            console.log("Execute event......")
            // type is the type of event we received to execute, if the type doesn't exist so it should not be executed
            switch (parsedEvent.type) {
                case EVENTS_TYPE.INPUT: {
                    const eventContent = parsedEvent.data as inputEvent
                    const node = this.map.get(eventContent.id) as HTMLInputElement
                    console.log("INPUT EVENT")
                    switch (eventContent.eventType) {
                        case INPUT_EVENTS_TYPE.CHANGE: {
                            console.log("input change ....", eventContent)
                            const { content } = eventContent
                            node.value = content
                            if (node?.onchange) {
                                //@ts-ignore
                                node.onchange({ isTrusted: true, target: node, stopPropagation: () => { } })
                            }
                            break;
                        }

                        case INPUT_EVENTS_TYPE.INPUT: {
                            console.log("input  ....", eventContent)
                            const { content } = eventContent
                            node.value = content
                            if (node?.onchange) {
                                //@ts-ignore
                                node.onchange({ isTrusted: true, target: node, stopPropagation: () => { } })
                            }
                            break
                        }

                        case INPUT_EVENTS_TYPE.KEYPRESS: {
                            console.log("input keypress ....", eventContent)
                            // Grap all needed fields for this event
                            const { content, alt, code, ctl, keyCode, shift, which } = eventContent
                            node.value = content
                            if (node?.onkeypress) {
                                //@ts-ignore
                                node.onkeypress({
                                    isTrusted: true,
                                    target: node,
                                    stopPropagation: () => { },
                                    ctrlKey: ctl as boolean,
                                    code: code as string,
                                    altKey: alt as boolean,
                                    keyCode: keyCode as number,
                                    which: which as number,
                                    shiftKey: shift as boolean
                                })
                            }
                            break
                        }

                        case INPUT_EVENTS_TYPE.KEYDOWN: {
                            // Execute the key dom
                            const { content, alt, code, ctl, keyCode, shift, which } = eventContent
                            node.value = content
                            if (node?.onkeydown) {
                                //@ts-ignore
                                node.onkeydown({
                                    isTrusted: true,
                                    target: node,
                                    stopPropagation: () => { },
                                    ctrlKey: ctl as boolean,
                                    code: code as string,
                                    altKey: alt as boolean,
                                    keyCode: keyCode as number,
                                    which: which as number,
                                    shiftKey: shift as boolean
                                })
                            }
                            break;
                        }

                        case INPUT_EVENTS_TYPE.KEYUP: {
                            // Execute the keyup event
                            const { content, alt, code, ctl, keyCode, shift, which } = eventContent
                            node.value = content
                            if (node?.onkeyup) {
                                //@ts-ignore
                                node.onkeyup({
                                    isTrusted: true,
                                    target: node,
                                    stopPropagation: () => { },
                                    ctrlKey: ctl as boolean,
                                    code: code as string,
                                    altKey: alt as boolean,
                                    keyCode: keyCode as number,
                                    which: which as number,
                                    shiftKey: shift as boolean
                                })
                            }
                            break
                        }
                    }
                    break
                }

                case EVENTS_TYPE.MOUSE: {
                    console.log("Mouse event to execute....")
                    const eventContent = parsedEvent.data as MouseEvent
                    const {
                        clientX,
                        clientY,
                        ctrl: ctrlKey,
                        alt: altKey,
                        shift: shiftKey,
                        movementX,
                        movementY,
                        offsetX,
                        pageY,
                        pageX,
                        screenX,
                        screenY,
                        x,
                        y
                    } = eventContent.content
                    const node = this.map.get(eventContent.id)
                    switch (eventContent.type) {
                        case MOUSE_EVENTS_TYPE.CLICK: {
                            // The click event can be used by Native API in javascript by using the 
                            // MouseEvent Object. https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/MouseEvent
                            const mouseEvent = new MouseEvent("click", {
                                screenX,
                                screenY,
                                clientX,
                                clientY,
                                ctrlKey,
                                shiftKey,
                                altKey,
                            })
                            node?.dispatchEvent(mouseEvent)
                            break
                        }

                        case MOUSE_EVENTS_TYPE.HOVER: {
                            break
                        }

                        case MOUSE_EVENTS_TYPE.POSITION: {
                            this.mouse!.style.left = clientX + "px";
                            this.mouse!.style.top = clientY + "px";
                            break
                        }
                    }
                    break
                }

                case EVENTS_TYPE.ATTRIBUTE_CHANGE: {
                    const eventContent = parsedEvent.data as AttributeEvent
                    const node = map.get(eventContent.id)
                    //@ts-ignore
                    Object.keys(eventContent.content).forEach(key => node?.setAttribute(key, eventContent.content[key]))
                    break
                }

                case EVENTS_TYPE.DOM_CHANGE: {
                    const eventContent = parsedEvent.data as DOMEvent
                    const node = map.get(eventContent.id)

                    const removeIDs = (child: HTMLElement) => {
                        //@ts-ignore
                        const id = child.__emploriumId
                        map.delete(id)
                        child.childNodes.forEach(child => removeIDs(child as HTMLElement))
                    }
                    node?.childNodes.forEach(child => {
                        removeIDs(child as HTMLElement)
                        child.remove()
                    })

                    const builded = this.buildElementNode(eventContent.content as HTMLElementSerialization);
                    builded?.childNodes.forEach(child => node?.append(child))
                    break;
                }

                case EVENTS_TYPE.REMOVED_ELEMENT_FROM_DOM: {
                    const eventContent = parsedEvent.data as HTMLElementRemovedEvent
                    const node = map.get(eventContent.id)
                    const idToRemove = eventContent.chidlrenId

                    const removeIDs = (child: HTMLElement) => {
                        //@ts-ignore
                        const id = child.__emploriumId
                        map.delete(id)
                        child.childNodes.forEach(child => removeIDs(child as HTMLElement))
                    }
                    node?.childNodes.forEach(child => {
                        //@ts-ignore
                        if (idToRemove.findIndex(childId => childId === child.__emploriumId) !== -1) {
                            removeIDs(child as HTMLElement)
                            child.remove()
                        }
                    })
                    break;
                }

                case EVENTS_TYPE.WINDOW: {
                    // subtract the event
                    const eventContent = parsedEvent.data as WindowEvent
                    switch (eventContent.type) {
                        case WINDOW_EVENTS_TYPE.RESIZE: {
                            console.log("Resize received.....")
                            // subtract the event content
                            const { width, height } = eventContent.content as Resize;
                            // subtract innerHeight and innerWidth
                            const { innerWidth, innerHeight } = window
                            // Calculate the corresponding scale for each Axis
                            const xScale = innerWidth / width;
                            const yScale = innerHeight / height;
                            // Set the width and height of corresponding iframe element
                            this.iframeWrapper!.style.width = `${width}px`
                            this.iframeWrapper!.style.height = `${height}px`
                            // Set a scale on container
                            this.wrapper!.style.transform = `scaleX(${xScale}) scaleY(${yScale})`
                            break
                        }

                        case WINDOW_EVENTS_TYPE.SCROLL: {
                            console.log("Scroll event received....")
                            const { x, y } = eventContent.content as Scroll
                            window.scrollTo(x, y)
                            break
                        }
                    }
                    break
                }

                case EVENTS_TYPE.SNAPSHOT: {
                    // substract the event
                    const eventContent = parsedEvent.data as SnapShotEvent
                    // substract the DOM content
                    const DOM = eventContent.content
                    // Setup the wrapper and iframe to heberge the new received dom
                    this.setup()
                    // Start building the DOM
                    this.buildDOM(DOM)
                    // Listen to some events on The window  
                    this.listenToWindowEventRemotePeer()
                    // Listen to the mouse postion over the body component
                    this.listenToMousePosition(this.iframe!.contentDocument as Document)
                    break;
                }
            }
        } catch {
            console.error("Couldn't parse the received event !")
        }
    }

    private rebuildDOM(serialization: string | HTMLElementSerialization, dom: Document, isIframe: boolean) {
        if (typeof serialization === "string") {
            serialization = JSON.parse(serialization)
        }

        return (this.buildElementNode(serialization as HTMLElementSerialization, dom, isIframe));
    }

    private setup() {
        // Remove the previous container
        if (this.wrapper) this.wrapper.remove()
        // Create elements
        const mouseCursor = document.createElement("img")
        this.iframe = document.createElement("iframe")
        this.iframeWrapper = document.createElement("div")
        this.mouse = document.createElement("div")
        this.wrapper = document.createElement("div")
        // Add some properties
        mouseCursor.src = "https://tl.vhv.rs/dpng/s/407-4077994_mouse-pointer-png-png-download-mac-mouse-pointer.png"
        mouseCursor.style.width = "100%"
        mouseCursor.style.height = "100%"
        this.mouse.style.position = "absolute"
        this.mouse.style.left = "0px"
        this.mouse.style.top = "0px"
        this.mouse.style.width = "20px"
        this.mouse.style.height = "20px"
        this.mouse.style.zIndex = "1000000"
        this.iframe.classList.add("__emplorium-iframe")
        this.wrapper.classList.add("__emplorium-wrapper")
        this.iframe.style.width = "100%";
        this.iframe.style.height = "100%";
        this.iframeWrapper.style.width = "100%";
        this.iframeWrapper.style.height = "100%";
        this.wrapper.style.transformOrigin = " 0 0 0";
        this.wrapper.style.width = "100vw";
        this.wrapper.style.height = "100vh";
        this.wrapper.style.maxWidth = "100vw";
        this.wrapper.style.maxHeight = "100vh";
        this.wrapper.style.minWidth = "100vw";
        this.wrapper.style.minHeight = "100vh";
        this.wrapper.style.position = "relative";
        // Append them by each other
        this.mouse.append(mouseCursor)
        this.iframeWrapper.append(this.iframe)
        this.wrapper.append(this.iframeWrapper)
        this.wrapper.append(this.mouse)
        this.root.append(this.wrapper)
    }

    private serializeDOMElement(element: HTMLElement | Document): HTMLElementSerialization | undefined {
        switch (element.nodeType) {
            case document.ELEMENT_NODE:
                element = element as HTMLElement
                if (element.tagName === "SCRIPT") return void 0
                //@ts-ignore
                element.__emploriumId = this._id + 1;
                this.map.set(this._id + 1, element)
                return {
                    id: ++this._id,
                    tag: element.tagName.toLocaleLowerCase(),
                    type: document.ELEMENT_NODE,
                    children: Array.from(element.childNodes).map(child => this.serializeDOMElement(child as HTMLElement)).filter(serialize => serialize !== void 0) as HTMLElementSerialization[],
                    attributes: Array.from(element.attributes).map(attribute => {
                        if (attribute.value === "" || attribute.value === null || attribute.value === void 0) {
                            return {}
                        }
                        const protocol = window.location.protocol
                        const hostname = window.location.hostname
                        const port = window.location.port === "80" || window.location.port === "443" ? '' : ":" + window.location.port
                        let value = attribute.value
                        if ((attribute.name === "href" || attribute.name === "src") && !/^(https|http):\/\//.test(attribute.value)) {
                            value = value[0] !== "/" ? "/" + value : value;
                            value = `${protocol}//${hostname}${port}${value}`
                        }
                        return ({ [attribute.name]: value })
                    }).reduce((acc, v) => ({ ...acc, ...v }), {})
                }
            case document.TEXT_NODE:
                element = element as HTMLElement
                if (element.textContent === null) {
                    return undefined
                }
                //@ts-ignore
                element.__emploriumId = this._id + 1;
                this.map.set(this._id + 1, element)
                return {
                    id: ++this._id,
                    type: document.TEXT_NODE,
                    content: element.textContent as string,
                }
            case document.DOCUMENT_NODE: {
                element = element as Document
                //@ts-ignore
                element.__emploriumId = this._id + 1;
                this.map.set(this._id + 1, element)
                return {
                    id: ++this._id,
                    type: document.DOCUMENT_NODE,
                    children: [element.head, element.body].map(element => this.serializeDOMElement(element)).filter(serialize => serialize !== void 0) as HTMLElementSerialization[]
                }
            }

        }
        return undefined;
    }

    private buildElementNode(element: HTMLElementSerialization, virtualDocument?: Document, isIframe?: boolean): HTMLElement | Document | Text | undefined {
        if (element.tag === "input") console.log(element.id)
        switch (element.type) {
            case document.DOCUMENT_NODE: {
                const doc = virtualDocument!.implementation.createDocument(null, null, null)
                const children = element.children?.map(child => this.buildElementNode(child, isIframe ? virtualDocument : doc)) || []
                const HTMLNode = document.createElement("html")
                //@ts-ignore
                doc.__emploriumId = element.id;
                children.map(child => HTMLNode.appendChild(child as HTMLElement))
                if (isIframe) {
                    virtualDocument?.getElementsByTagName('html')[0].remove()
                    virtualDocument?.append(HTMLNode)
                } else {
                    virtualDocument!.append(HTMLNode)
                }
                return virtualDocument
            }
            case document.ELEMENT_NODE: {
                const node = virtualDocument?.createElement(element.tag as string) as HTMLElement
                const attributes = element.attributes as {} || {}
                const children = element.children?.map(child => this.buildElementNode(child, virtualDocument)) || []
                //@ts-ignore
                node!.__emploriumId = element.id
                //@ts-ignore
                Object.keys(attributes).map(key => node?.setAttribute(key, attributes[key]))
                children.map(child => node.appendChild(child as HTMLElement))
                //@ts-ignore
                map.set(node.__emploriumId, node)
                return node
            }
            case document.TEXT_NODE: {
                const textNode = virtualDocument?.createTextNode(element.content as string) as Text
                ///@ts-ignore
                textNode.__emploriumId = element.id;
                return textNode
            }

        }
        return undefined
    }
}