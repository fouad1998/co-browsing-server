enum EVENTS_TYPE {
    CLICK = 0,
    INPUT,
    MOUSE,
    DOM_CHANGE,
    REMOVED_ELEMENT_FROM_DOM,
    ATTRIBUTE_CHANGE,
    SNAPSHOT,
}
enum INPUT_EVENTS_TYPE {
    INPUT = 0,
    CHANGE,
    KEYPRESS,
    KEYPRESSDOWN,
    KEYPRESSUP,
}
interface CoBrowsingInterface {
    root: HTMLElement;
    coBrowsingExec: boolean // If the co-browser is used to execute remote event
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
interface mouseClick {
    x: number;
    y: number;
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
    keyCode?: string; 
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
// The whole objec who contains all kind of event that can be cought
interface HTMLEvent {
    type: number;
    data: mouseClick | inputEvent | DOMEvent | AttributeEvent | SnapShotEvent | HTMLElementRemovedEvent | HTMLElementSerialization
}


const map = new Map<number, HTMLElement>()

export class CoBrowsing {
    _id = -1;
    map: Map<number, HTMLElement | Document>
    iframe: HTMLIFrameElement | null = null
    wrapper: HTMLDivElement | null = null
    root: HTMLElement
    config: Partial<CoBrowsingInterface> = {}
    socket: WebSocket
    allowToSendEvent: boolean = true
    
    constructor(props: CoBrowsingInterface){
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

    setConfig(config: CoBrowsingInterface){
        this.config = config
    }

    /**
     * Transform the current document to a string representation, in order to rebuild it after
     */
    snapshot(): HTMLElementSerialization | undefined {
        // The object here is used as the controller, not the receiver, so we don't need to get snapshot of it
        if (!this.config.coBrowsingExec) return undefined
        const DOMVirual = this.serializeDOMElement(document)
        const event: SnapShotEvent = {
            href: window.location.href,
            content: DOMVirual as HTMLElementSerialization
        }
        const eventSend: HTMLEvent =  {
            data: event,
            type: EVENTS_TYPE.SNAPSHOT,
        }
        this.socket.send(JSON.stringify(eventSend))
        this.startMutationObserver(document)
        this.startFieldChangeEventListener(document)
    }

    private mutationObserverHandler(events: Array<any>) {
        events.forEach(event => {
            switch(event.type) {
                case "attributes": {
                  const attributeName = event.attributeName
                  const oldValueOfAttribute = event.oldValue
                  const target = event.target
                  const newValueOfAttribute = target.getAttribute(attributeName)
                  if (oldValueOfAttribute !== newValueOfAttribute) {
                    const id = target.__emploriumId
                    const event: AttributeEvent = {
                        content: {[attributeName]: newValueOfAttribute},
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

                case "childList":{
                    const { addedNodes, removedNodes, target } = event
                    if (Array.from(addedNodes).length === 0) {
                        // there is no element removed, too strange, it shouldn't be the case
                        if (Array.from(removedNodes).length === 0) return
                        // The id of elements got remove from the DOM
                        const nodeRemovedId:Array<number> = []
                        for(const node of removedNodes) {
                            nodeRemovedId.push(node.__emploriumId)
                        }
                        const event: HTMLElementRemovedEvent = {
                            chidlrenId: nodeRemovedId,
                            id: target.__emploriumId
                        }
                        const eventSend:HTMLEvent = {
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
                setTimeout(() => this.allowToSendEvent = true, 1000/24);
                console.log('new event', event)
                switch(eventType) {
                    case "onchange": {
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
                        const target = event.target;
                        const value = target.value;
                        const { ctrlKey, code, altKey, keyCode, which, shiftKey } = event;
                        const inputEvent: inputEvent = {
                            id: target.__emploriumId,
                            content: value,
                            eventType: INPUT_EVENTS_TYPE.KEYPRESSDOWN,
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
                        const target = event.target;
                        const value = target.value;
                        const { ctrlKey, code, altKey, keyCode, which, shiftKey } = event;
                        const inputEvent: inputEvent = {
                            id: target.__emploriumId,
                            content: value,
                            eventType: INPUT_EVENTS_TYPE.KEYPRESSUP,
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

    private buildDOM(DOMString: string  | HTMLElementSerialization):void {
        const DOM = typeof DOMString === "string" ? JSON.parse(DOMString) as HTMLElementSerialization : DOMString
        this.rebuildDOM(DOM, this.iframe?.contentDocument as Document, true)
        this.startMutationObserver(this.iframe?.contentDocument as Document)
        this.startFieldChangeEventListener(this.iframe?.contentDocument as Document)
    }

    private executeEvent = (event: MessageEvent): void =>  {
        // Try to execute an event using received event structure
        try {
            const eventString  =  event.data
            const parsedEvent = JSON.parse(eventString) as HTMLEvent
            console.log("Trying to Execute event......")
            // the object in this case is not used to execute commande not, because we are in the remote pair 
        if (!this.config.coBrowsingExec && parsedEvent.type !== EVENTS_TYPE.SNAPSHOT) return undefined
            console.log("Execute event......")
            // type is the type of event we received to execute, if the type doesn't exist so it should not be executed
            switch (parsedEvent.type){
                case EVENTS_TYPE.INPUT: {
                    const eventContent = parsedEvent.data  as inputEvent
                    const node = this.map.get(eventContent.id) as HTMLInputElement
                    console.log("INPUT EVENT")
                    switch(eventContent.eventType) {
                       case INPUT_EVENTS_TYPE.CHANGE: {
                        const { content } = eventContent
                        debugger
                        node.value = content
                        if (node?.onchange) {
                            //@ts-ignore
                            node.onchange({isTrusted: true, target: node, stopPropagation: () => {}})
                        }
                        break;
                       }

                       case INPUT_EVENTS_TYPE.INPUT: {
                        break
                       }

                       case INPUT_EVENTS_TYPE.KEYPRESS: {
                        break
                       }

                       case INPUT_EVENTS_TYPE.KEYPRESSDOWN: {
                        break
                       }

                       case INPUT_EVENTS_TYPE.KEYPRESSUP: {

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
    
                    const builded =  this.buildElementNode(eventContent.content as HTMLElementSerialization);
                    builded?.childNodes.forEach(child => node?.append(child))
                    break;
                }

                case EVENTS_TYPE.REMOVED_ELEMENT_FROM_DOM: {
                    const eventContent = parsedEvent.data as HTMLElementRemovedEvent
                    const node = map.get(eventContent.id)
                    const idToRemove=  eventContent.chidlrenId

                    const removeIDs = (child: HTMLElement) => {
                        //@ts-ignore
                        const id = child.__emploriumId
                        map.delete(id)
                        child.childNodes.forEach(child => removeIDs(child as HTMLElement))
                    }
                    node?.childNodes.forEach(child => {
                        //@ts-ignore
                        if (idToRemove.findIndex(childId  => childId === child.__emploriumId) !== -1) {
                            removeIDs(child as HTMLElement)
                            child.remove()
                        }
                    })
                    break;
                }

                case EVENTS_TYPE.SNAPSHOT: {
                    const eventContent = parsedEvent.data as SnapShotEvent
                    const DOM = eventContent.content
                    //TODO Change place after
                    console.log("Building", DOM)
                    this.setup()
                    this.buildDOM(DOM)
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

    private setup(){
        this.iframe = document.createElement("iframe")
        this.wrapper = document.createElement("div")
        this.iframe.classList.add("__emplorium-iframe")
        this.wrapper.classList.add("__emplorium-wrapper")
        this.wrapper.append(this.iframe)
        this.root.append(this.wrapper)
    }

    private serializeDOMElement(element: HTMLElement | Document): HTMLElementSerialization | undefined  {
        switch(element.nodeType) {
            case document.ELEMENT_NODE:
                element = element as HTMLElement
                if (element.tagName === "SCRIPT") return void 0
                //@ts-ignore
                element.__emploriumId = this._id + 1;
                this.map.set(this._id+1, element)
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
                        const port =  window.location.port === "80" || window.location.port === "443" ? '' : ":"+window.location.port
                        let value = attribute.value
                        if ((attribute.name === "href" || attribute.name === "src") && !/^(https|http):\/\//.test(attribute.value)) {
                            value = value[0] !== "/" ? "/" + value : value;
                            value = `${protocol}//${hostname}${port}${value}`
                        } 
                        return ({[attribute.name]: value})
                    }).reduce((acc, v) => ({...acc, ...v}),{})
                }
            case document.TEXT_NODE:
                element = element as HTMLElement
                if (element.textContent === null) {
                    return undefined
                }
                //@ts-ignore
                element.__emploriumId = this._id + 1;
                this.map.set(this._id+1, element)
                return {
                    id: ++this._id,
                    type: document.TEXT_NODE,
                    content: element.textContent as string,
                }
            case document.DOCUMENT_NODE: {
                element = element as Document
                //@ts-ignore
                element.__emploriumId = this._id + 1;
                this.map.set(this._id+1, element)
                return {
                    id: ++this._id,
                    type: document.DOCUMENT_NODE,
                    children: [element.head, element.body].map(element => this.serializeDOMElement(element)).filter(serialize => serialize !== void 0) as HTMLElementSerialization[]
                }
            }
                
        }
        return undefined;
    }

    private buildElementNode (element: HTMLElementSerialization, virtualDocument?: Document, isIframe?: boolean): HTMLElement | Document | Text | undefined {
        if(element.tag === "input") console.log(element.id)
        switch(element.type) {
            case document.DOCUMENT_NODE: {
                const doc = virtualDocument!.implementation.createDocument(null, null, null)
                const children = element.children?.map(child =>this.buildElementNode(child, isIframe ? virtualDocument : doc)) || []
                const HTMLNode = document.createElement("html")
                //@ts-ignore
                doc.__emploriumId = element.id;
                children.map(child => HTMLNode.appendChild(child as HTMLElement))
                if (isIframe) {
                    virtualDocument?.getElementsByTagName('html')[0].remove()
                    virtualDocument?.append(HTMLNode)
                }else {
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