import {
    AttributeEvent, DOMEvent, EVENTS_TYPE,
    HTMLElementSerialization, INPUT_EVENTS_TYPE,
    MOUSE_EVENTS_TYPE, SnapShotEvent,
    WINDOW_EVENTS_TYPE, WindowEvent, mouseCoordonate,
    DOMEventChange, DOM_EVENTS_TYPE,
    HTMLElementRemovedEvent, Scroll, Resize, InputEvent, input
} from './interface'


// Mouse Events 
export interface MouseEvent {
    id: number;
    type: MOUSE_EVENTS_TYPE;
    content: mouseCoordonate;
}

// The whole objec who contains all kind of event that can be caught
export interface HTMLEvent {
    type: EVENTS_TYPE;
    data: InputEvent | DOMEvent | WindowEvent | MouseEvent
}

export interface CoBrowsingInterface {
    root: HTMLElement;
    remotePeer: boolean // If the co-browser is used to execute remote event
    socket: WebSocket// the websocket connection, it can be other thing if we want like (RTC, XHR...)
}

export interface LastEventOccurred {
    throwFunc: boolean
    content: HTMLEvent | null
    allowedToSend: boolean
}

const map = new Map<number, HTMLElement>()

export class CoBrowsing {
    private _id = -1;
    private map: Map<number, HTMLElement | Document>
    private iframe: HTMLIFrameElement | null = null
    private mouse: HTMLDivElement | null = null
    private iframeWrapper: HTMLDivElement | null = null
    private wrapper: HTMLDivElement | null = null
    private stopDoing: HTMLDivElement | null = null
    private root: HTMLElement
    private config: Partial<CoBrowsingInterface> = {}
    private socket: WebSocket
    private lastEventOccurred: LastEventOccurred = { content: null, allowedToSend: true, throwFunc: true }
    private restrictionTime: number = 50 // 50ms
    private receivingScrollEvent: boolean = false
    private isMouseScroll: boolean = false
    private readonly eventsHandled = ['onmouseover', 'onmouseenter', 'onmouseout', "onmousemove", 'oninput', 'onchange', 'onkeypress', 'onkeydown']

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
        this.listenToWindowEvents = this.listenToWindowEvents.bind(this)
        this.listenToMousePosition = this.listenToMousePosition.bind(this)
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
        const domEvent: DOMEvent = {
            content: event,
            type: DOM_EVENTS_TYPE.SNAPSHOT
        }
        // The event to send who contains the type of the event and event data (event content)
        const eventSend: HTMLEvent = {
            data: domEvent,
            type: EVENTS_TYPE.DOM,
        }
        // Send the content through the socket
        this.sendEvent(eventSend)
        // Listen  to the DOM changement
        this.startMutationObserver(document)
        // Listen to window event
        this.listenToWindowEvents()
        // Listen to mouse position
        this.listenToMousePosition()
        // 
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
    private listenToWindowEvents() {
        const resizeHandler = () => {
            const { innerHeight, innerWidth } = window
            if (this.config.remotePeer) {
                // Get needed data from iframe
                const width = this.iframeWrapper!.style.width.replace(/(^[0-9]+).+/, "$1")
                const height = this.iframeWrapper!.style.height.replace(/(^[0-9]+).+/, "$1")
                console.log({ width, height })
                // Make the scale
                const xScale = !width ? 1 : innerWidth / +width
                const yScale = !height ? 1 : innerHeight / +height
                // Set the Scale
                this.wrapper!.style.transform = `scaleX(${xScale}) scaleY(${yScale})`
            } else {
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
                this.sendEvent(eventToSend)
            }
        }
        // Scroll event
        const scrollHandler = () => {
            const { scrollY, scrollX } = this.config.remotePeer ? this.iframe!.contentWindow as Window : window

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

                if (this.config.remotePeer) {
                    // We are receiving the event from the client side, 
                    if (this.receivingScrollEvent) {
                        this.stopDoing!.style.display = "flex"
                        setTimeout(() => this.stopDoing!.style.display = "none", 1500)
                        return void 0
                    }
                } else {
                    // this event is not created by mouse, but is created by the received events
                    if (this.receivingScrollEvent && !this.isMouseScroll) return void 0
                }
                this.sendEvent(eventSend)
            }

            this.isMouseScroll = false
        }
        const wheelScroll = () => {
            this.isMouseScroll = true;
        }


        window.addEventListener("resize", resizeHandler)
        if (this.config.remotePeer) {
            this.iframe!.contentWindow!.addEventListener("scroll", scrollHandler)
        } else {
            window.addEventListener("scroll", scrollHandler)
            window.addEventListener("wheel", wheelScroll)
            window.addEventListener("mousewheel", wheelScroll)
        }
        // Send the first set of dimension
        resizeHandler()
    }

    private listenToMousePosition() {
        const mousePositionHandler = (event: any) => {
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
            this.sendEvent(eventSend)
        }
        //Mouse out of screen handler
        const mouseOut = () => {
            const mouseEvent: MouseEvent = {
                id: -1,
                type: MOUSE_EVENTS_TYPE.OUT_OF_SCREEN,
                content: {
                    clientY: 0,
                    clientX: 0,
                }
            }
            const eventSend: HTMLEvent = {
                data: mouseEvent,
                type: EVENTS_TYPE.MOUSE
            }
            this.sendEvent(eventSend)
        }
        if (this.config.remotePeer) {
            this.iframe!.contentDocument!.body.addEventListener("mousemove", mousePositionHandler)
            this.iframe!.contentDocument!.body.addEventListener("mouseout", mouseOut)
        } else {
            document.body.addEventListener("mousemove", mousePositionHandler)
            document.body.addEventListener("mouseout", mouseOut)
        }
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
                        const domEvent: DOMEvent = {
                            type: DOM_EVENTS_TYPE.ATTRIBUTE_CHANGE,
                            content: event,
                        }
                        const eventSend: HTMLEvent = {
                            type: EVENTS_TYPE.DOM,
                            data: domEvent
                        }
                        this.sendEvent(eventSend)
                    }
                    break
                }

                case "childList": {
                    const { addedNodes, removedNodes, target } = event
                    if (Array.from(addedNodes).length === 0) {
                        // there is no element removed, too strange, it shouldn't be the case
                        if (Array.from(removedNodes).length === 0) return void 0
                        // The id of elements got remove from the DOM
                        const nodeRemovedId: Array<number> = []
                        for (const node of removedNodes) {
                            nodeRemovedId.push(node.__emploriumId)
                        }
                        const event: HTMLElementRemovedEvent = {
                            chidlrenId: nodeRemovedId,
                            id: target.__emploriumId
                        }
                        const domEvent: DOMEvent = {
                            type: DOM_EVENTS_TYPE.REMOVED_ELEMENT_FROM_DOM,
                            content: event
                        }
                        const eventSend: HTMLEvent = {
                            data: domEvent,
                            type: EVENTS_TYPE.DOM,
                        }
                        this.sendEvent(eventSend)
                    } else {
                        // IN this case the element can be added as can be removed
                        const serialize = this.serializeDOMElement(target) as HTMLElementSerialization
                        const event: DOMEventChange = {
                            content: serialize,
                            id: target.__emploriumId,
                        }
                        const domEvent: DOMEvent = {
                            type: DOM_EVENTS_TYPE.DOM_CHANGE,
                            content: event
                        }
                        const eventSend: HTMLEvent = {
                            data: domEvent,
                            type: EVENTS_TYPE.DOM
                        }
                        this.sendEvent(eventSend)
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

    private buildDOM(DOMString: string | HTMLElementSerialization): void {
        const DOM = typeof DOMString === "string" ? JSON.parse(DOMString) as HTMLElementSerialization : DOMString
        this.rebuildDOM(DOM, this.iframe?.contentDocument as Document, true)
    }

    private sendEvent(event: HTMLEvent) {
        // If the event to send is not allowed to be send, we save it to send it later
        if (!this.lastEventOccurred.allowedToSend) {
            // If the event we want to send is the same type, we don't allow till the time restriction is out 
            if (this.lastEventOccurred.content!.type === event.type && this.lastEventOccurred.content!.data.type === event.data.type) {
                this.lastEventOccurred.content = event;
                if (this.lastEventOccurred.throwFunc) {
                    setTimeout(() => {
                        this.sendEvent(this.lastEventOccurred!.content!)
                        this.lastEventOccurred.content = null
                        this.lastEventOccurred.throwFunc = true;
                        this.lastEventOccurred.allowedToSend = true;
                    }, this.restrictionTime)
                    this.lastEventOccurred!.throwFunc = false;
                }

                return void 0
            }
        }
        this.lastEventOccurred.content = event;
        this.lastEventOccurred.allowedToSend = false;
        this.socket.send(JSON.stringify(event))
    }

    private executeEvent = (event: MessageEvent): void => {
        // Try to execute an event using received event structure
        try {
            const eventString = event.data
            const parsedEvent = JSON.parse(eventString) as HTMLEvent
            // type is the type of event we received to execute, if the type doesn't exist so it should not be executed
            console.log("recevied event......")
            this.receivingScrollEvent = false
            switch (parsedEvent.type) {
                case EVENTS_TYPE.INPUT: {
                    const eventContent = parsedEvent.data as InputEvent
                    const node = this.map.get(eventContent.content.id) as HTMLInputElement
                    switch (eventContent.type) {
                        case INPUT_EVENTS_TYPE.CHANGE: {
                            console.log("input change ....", eventContent)
                            const { content } = eventContent.content
                            node.value = content
                            if (node?.onchange) {
                                //@ts-ignore
                                node.onchange({ isTrusted: true, target: node, stopPropagation: () => { } })
                            }
                            break;
                        }

                        case INPUT_EVENTS_TYPE.INPUT: {
                            console.log("input  ....", eventContent)
                            const { content } = eventContent.content
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
                            const { content, alt, code, ctl, keyCode, shift, which } = eventContent.content
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
                            const { content, alt, code, ctl, keyCode, shift, which } = eventContent.content
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
                            const { content, alt, code, ctl, keyCode, shift, which } = eventContent.content
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
                    const recursiveHandlerCall = (node: HTMLElement, handler: (node: HTMLElement) => Function, stopPropagation?: false) => {
                        const func = handler(node)
                        if (func && typeof func === "function") {
                            func({
                                clientX,
                                clientY,
                                ctrlKey,
                                altKey,
                                shiftKey,
                                movementX,
                                movementY,
                                offsetX,
                                pageY,
                                pageX,
                                screenX,
                                screenY,
                                x,
                                y
                            })
                        }
                        const parent = node!.offsetParent as HTMLElement
                        if (parent) recursiveHandlerCall(parent, handler)
                    }
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

                        case MOUSE_EVENTS_TYPE.MOUSE_OVER: {

                            break
                        }

                        case MOUSE_EVENTS_TYPE.MOUSE_ENTER: {
                            break
                        }

                        case MOUSE_EVENTS_TYPE.MOUSE_MOVE: {
                            break
                        }

                        case MOUSE_EVENTS_TYPE.MOUSE_OUT: {
                            break
                        }


                        case MOUSE_EVENTS_TYPE.POSITION: {
                            this.mouse!.style.display = "block";
                            this.mouse!.style.left = clientX + "px";
                            this.mouse!.style.top = clientY + "px";
                            break
                        }

                        case MOUSE_EVENTS_TYPE.OUT_OF_SCREEN: {
                            this.mouse!.style.display = "none";
                            break
                        }
                    }
                    break
                }

                case EVENTS_TYPE.DOM: {
                    const eventContent = parsedEvent.data as DOMEvent
                    switch (eventContent.type) {
                        case DOM_EVENTS_TYPE.ATTRIBUTE_CHANGE: {
                            const content = eventContent.content as AttributeEvent
                            const node = map.get(content.id)
                            //@ts-ignore
                            Object.keys(content.content).forEach(key => node?.setAttribute(key, content.content[key]))
                            break
                        }

                        case DOM_EVENTS_TYPE.DOM_CHANGE: {
                            const content = eventContent.content as DOMEventChange
                            const node = map.get(content.id)

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

                            const builded = this.buildElementNode(content.content as HTMLElementSerialization, []);
                            builded?.childNodes.forEach(child => node?.append(child))
                            break
                        }

                        case DOM_EVENTS_TYPE.REMOVED_ELEMENT_FROM_DOM: {
                            const content = eventContent.content as HTMLElementRemovedEvent
                            const node = map.get(content.id)
                            const idToRemove = content.chidlrenId

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

                        case DOM_EVENTS_TYPE.SNAPSHOT: {
                            // substract the event
                            const content = eventContent.content as SnapShotEvent
                            // substract the DOM content
                            const DOM = content.content
                            // Setup the wrapper and iframe to heberge the new received dom
                            this.setup()
                            // Start building the DOM
                            this.buildDOM(DOM)
                            // Listen to the changement in the DOM (created by css)
                            this.startMutationObserver(this.iframe?.contentDocument as Document)
                            // Listen to some events on The window  
                            this.listenToWindowEvents()
                            // Listen to the mouse postion over the body component
                            this.listenToMousePosition()
                            break;
                        }
                    }
                    break
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
                            this.receivingScrollEvent = true
                            const { x, y } = eventContent.content as Scroll
                            if (this.config.remotePeer) {
                                this.iframe!.contentWindow!.scrollTo(x, y)
                            } else {
                                window.scrollTo(x, y)
                            }
                            break
                        }
                    }
                    break
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

        return (this.buildElementNode(serialization as HTMLElementSerialization, [], dom, isIframe));
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
        // Append them by each other
        this.mouse.append(mouseCursor)
        this.iframeWrapper.append(this.iframe)
        this.wrapper.append(this.iframeWrapper)
        this.wrapper.append(this.mouse)
        this.root.append(this.wrapper)

        //Stop making event
        this.stopDoing = this.iframe.contentDocument!.createElement("div")
        this.stopDoing!.setAttribute("style", `background: #000A; color: white; display: none; justify-content: center; 
                    align-items: center; position: fixed; top: 0; left: 0; right: 0; bottom: 0; height: 100vh; width: 100vw;
                    z-index: 100000000; font-size: 2em`)
        this.stopDoing.innerText = "Please, stop scrolling the client in the other hand try to navigate somewhere else"
        this.iframe.contentDocument!.body.append(this.stopDoing)

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
                    }).reduce((acc, v) => ({ ...acc, ...v }), {}),
                    //@ts-ignore
                    listenEvents: this.eventsHandled.filter(event => element[event] !== null)
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
                    //@ts-ignore
                    listenEvents: this.eventsHandled.filter(event => element[event] !== null)
                }
            case document.DOCUMENT_NODE: {
                element = element as Document
                //@ts-ignore
                element.__emploriumId = this._id + 1;
                this.map.set(this._id + 1, element)
                return {
                    id: ++this._id,
                    type: document.DOCUMENT_NODE,
                    children: [element.head, element.body].map(element => this.serializeDOMElement(element)).filter(serialize => serialize !== void 0) as HTMLElementSerialization[],
                    //@ts-ignore
                    listenEvents: this.eventsHandled.filter(event => element[event] !== null)
                }
            }

        }
        return undefined;
    }

    private buildElementNode(element: HTMLElementSerialization, forwardEvents: Array<string>, virtualDocument?: Document, isIframe?: boolean): HTMLElement | Document | Text | undefined {
        switch (element.type) {
            case document.DOCUMENT_NODE: {
                const doc = virtualDocument!.implementation.createDocument(null, null, null)
                const children = element.children?.map(child => this.buildElementNode(child, [], isIframe ? virtualDocument : doc)) || []
                const eventsListen = element.listenEvents;
                forwardEvents.forEach(event => eventsListen.indexOf(event) === -1 && eventsListen.push(event))
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
                const eventsListen = element.listenEvents;
                if (forwardEvents.indexOf("onclick") === -1) forwardEvents.push("onclick")
                if (element.tag === "input" || element.tag === "select" || element.tag === "textarea") forwardEvents.push("oninput", 'onkeyup')
                forwardEvents.forEach(event => eventsListen.indexOf(event) === -1 && eventsListen.push(event))
                const children = element.children?.map(child => this.buildElementNode(child, forwardEvents, virtualDocument)) || []
                //@ts-ignore
                node!.__emploriumId = element.id
                //@ts-ignore
                Object.keys(attributes).map(key => node?.setAttribute(key, attributes[key]))
                children.map(child => node.appendChild(child as HTMLElement))
                //@ts-ignore
                this.map.set(node.__emploriumId, node)
                forwardEvents.forEach(event => this.addEventListener(node, event))
                return node
            }

            case document.TEXT_NODE: {
                const textNode = virtualDocument?.createTextNode(element.content as string) as Text
                const eventsListen = element.listenEvents;
                forwardEvents.forEach(event => eventsListen.indexOf(event) === -1 && eventsListen.push(event))
                ///@ts-ignore
                textNode.__emploriumId = element.id;
                ///@ts-ignore
                this.map.set(textNode.__emploriumId, textNode)
                forwardEvents.forEach(event => this.addEventListener(textNode, event))
                return textNode
            }
        }
        return undefined
    }

    /**
     * Add events to the node received in params
     * @param node 
     * @param eventType 
     */
    private addEventListener(node: HTMLElement | Text, eventType: string) {
        const handler = (event: any) => {
            event.stopPropagation();
            event.preventDefault();
            switch (eventType) {
                case "onmouseover": case "onmouseout": case "onclick": case "onmouseenter": case "onmousemove": {
                    const {
                        clientX,
                        clientY,
                        ctrlKey,
                        altKey,
                        shiftKey,
                        movementX,
                        movementY,
                        offsetX,
                        pageY,
                        pageX,
                        screenX,
                        screenY,
                        x,
                        y
                    } = event

                    const mouseEvent: MouseEvent = {
                        type: MOUSE_EVENTS_TYPE.CLICK,
                        //@ts-ignore
                        id: node.__emploriumId,
                        content: {
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
                        }
                    }

                    switch (eventType) {
                        case "onclick": {
                            break
                        }

                        case "onmouseover": {
                            mouseEvent.type = MOUSE_EVENTS_TYPE.MOUSE_OVER
                            break
                        }

                        case "onmouseout": {
                            mouseEvent.type = MOUSE_EVENTS_TYPE.MOUSE_OUT
                            break
                        }

                        case "onmouseenter": {
                            mouseEvent.type = MOUSE_EVENTS_TYPE.MOUSE_ENTER
                            break
                        }

                        case "onmousemove": {
                            mouseEvent.type = MOUSE_EVENTS_TYPE.MOUSE_MOVE
                            break
                        }

                        default: return void 0
                    }

                    const eventSend: HTMLEvent = {
                        type: EVENTS_TYPE.MOUSE,
                        data: mouseEvent
                    }

                    this.sendEvent(eventSend)
                    break
                }

                case "oninput": case "onchange": case "onkeypress": case "onkeyup": case "onkeydown": case "onblur": {
                    console.log("Input events are executing..........")
                    const { ctrlKey, code, altKey, keyCode, which, shiftKey } = event;
                    const target = event.target;
                    const value = target.value;
                    const inputContent: input = {
                        id: target.__emploriumId,
                        content: value,
                        alt: altKey,
                        code: code,
                        ctl: ctrlKey,
                        keyCode,
                        which: which,
                        shift: shiftKey
                    }
                    const inputEvent: InputEvent = {
                        content: inputContent,
                        type: INPUT_EVENTS_TYPE.INPUT
                    }
                    const eventSend: HTMLEvent = {
                        type: EVENTS_TYPE.INPUT,
                        data: inputEvent
                    }

                    switch (eventType) {
                        case "oninput": {
                            break
                        }

                        case "onblur": {
                            inputEvent.type = INPUT_EVENTS_TYPE.BLUR
                            break
                        }

                        case "onchange": {
                            inputEvent.type = INPUT_EVENTS_TYPE.CHANGE
                            break
                        }

                        case "onkeydown": {
                            inputEvent.type = INPUT_EVENTS_TYPE.KEYDOWN
                            break
                        }

                        case "onkeypress": {
                            inputEvent.type = INPUT_EVENTS_TYPE.KEYPRESS
                            break
                        }

                        case "onkeyup": {
                            inputEvent.type = INPUT_EVENTS_TYPE.KEYUP
                            break
                        }

                        default: return void 0
                    }
                    this.sendEvent(eventSend)
                    break
                }
            }
        }
        node.addEventListener(eventType.substr(2), handler)
    }
}